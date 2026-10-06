"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  getDocumentDownloadUrlAction,
  deleteCandidateDocumentAction,
  requestCandidateDocumentUploadUrlSelfAction,
  registerCandidateDocumentSelfAction,
} from "@/lib/candidate/actions";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { DestructiveAction } from "@/components/ui/destructive-action";

export interface CandidateVaultDocument {
  id: string;
  candidateId?: string;
  title: string;
  documentType: string;
  fileSizeBytes: number;
  mimeType: string;
  versionNumber: number;
  isDefault: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface Props {
  documents: CandidateVaultDocument[];
  onDocumentDeleted?: () => void;
  onDocumentUploaded?: (newDoc: CandidateVaultDocument) => void;
  allowUploadRedirect?: boolean;
}

type UploadState = "IDLE" | "SELECTING" | "VALIDATING" | "UPLOADING" | "SAVING" | "SUCCESS" | "ERROR";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".rtf", ".png", ".jpg", ".jpeg", ".webp"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export function CandidateDocumentVault({
  documents: initialDocuments,
  onDocumentDeleted,
  onDocumentUploaded,
  allowUploadRedirect = true,
}: Props) {
  const [documents, setDocuments] = useState<CandidateVaultDocument[]>(initialDocuments);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [exitingDocId, setExitingDocId] = useState<string | null>(null);

  // Document Viewer State
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [viewingDocMeta, setViewingDocMeta] = useState<{ title: string; mimeType: string; sizeBytes: number } | null>(null);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadState, setUploadState] = useState<UploadState>("IDLE");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [progressStatusText, setProgressStatusText] = useState<string>("");
  const [modalError, setModalError] = useState<string | null>(null);

  const [docType, setDocType] = useState<"RESUME" | "COVER_LETTER" | "TRANSCRIPT" | "CERTIFICATE" | "OTHER">("RESUME");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState<string>("");
  const [isDefaultResume, setIsDefaultResume] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up any progress timers on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const clearProgressTimer = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  // Sync state during render when props change
  const [prevInitial, setPrevInitial] = useState(initialDocuments);
  if (prevInitial !== initialDocuments) {
    setPrevInitial(initialDocuments);
    setDocuments(initialDocuments);
  }

  const categories = [
    { key: "ALL", label: "All Documents" },
    { key: "RESUME", label: "Resumes" },
    { key: "COVER_LETTER", label: "Cover Letters" },
    { key: "TRANSCRIPT", label: "Education & Transcripts" },
    { key: "CERTIFICATE", label: "Certifications" },
    { key: "OTHER", label: "Other Attachments" },
  ];

  const filteredDocs = useMemo(() => {
    if (selectedCategory === "ALL") return documents;
    return documents.filter((d) => d.documentType === selectedCategory);
  }, [documents, selectedCategory]);

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleOpenUploadModal = (categoryOverride?: string) => {
    clearProgressTimer();
    setUploadState("IDLE");
    setModalError(null);
    setSelectedFile(null);
    setDocTitle("");
    setUploadProgress(0);
    setProgressStatusText("");

    if (categoryOverride && categoryOverride !== "ALL") {
      setDocType(categoryOverride as any);
    } else if (selectedCategory !== "ALL") {
      setDocType(selectedCategory as any);
    } else {
      setDocType("RESUME");
    }

    const hasResumes = documents.some((d) => d.documentType === "RESUME");
    setIsDefaultResume(!hasResumes);
    setShowUploadModal(true);
  };

  const handleCloseUploadModal = () => {
    if (uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING") {
      return; // Prevent dismissal while upload or save is in flight
    }
    clearProgressTimer();
    setShowUploadModal(false);
  };

  const validateAndSetFile = (file: File) => {
    setModalError(null);

    // Validate size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setModalError("Your file is larger than the 50 MB limit.");
      return;
    }
    if (file.size === 0) {
      setModalError("The selected file is empty (0 bytes).");
      return;
    }

    // Validate extension
    const nameLower = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
    if (!hasValidExt) {
      setModalError(`Unsupported file format. Please upload a PDF, Word document, or image (${ALLOWED_EXTENSIONS.join(", ")}).`);
      return;
    }

    setSelectedFile(file);
    if (!docTitle.trim()) {
      // Clean title from filename
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setDocTitle(cleanName);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING") {
      return; // Prevent duplicate submission
    }

    if (!selectedFile) {
      setModalError("Please select a document file to upload.");
      return;
    }

    const titleToUse = docTitle.trim() || selectedFile.name;
    if (!titleToUse) {
      setModalError("Please enter a valid document title.");
      return;
    }

    clearProgressTimer();
    setModalError(null);

    // Stage 1: PREPARING (0-80%)
    setUploadState("VALIDATING");
    setUploadProgress(20);
    setProgressStatusText("Preparing secure upload…");

    // Fast perceived progression during preparation (20% -> 45% -> 65% -> 78%)
    const prepTargets = [45, 65, 78];
    let prepIdx = 0;
    progressIntervalRef.current = setInterval(() => {
      const nextVal = prepTargets[prepIdx];
      if (typeof nextVal === "number") {
        setUploadProgress(nextVal);
        prepIdx++;
      }
    }, 120);

    try {
      // 1. Authoritative candidate signed upload URL request
      const urlRes = await requestCandidateDocumentUploadUrlSelfAction({
        filename: selectedFile.name,
      });

      clearProgressTimer();

      if (!urlRes.success || !urlRes.data) {
        setUploadState("ERROR");
        setUploadProgress(0);
        setModalError("Unable to prepare secure upload. Please try again.");
        return;
      }

      const { signedUrl, documentId, filename } = urlRes.data;

      // Stage 2: UPLOADING (80-95%)
      setUploadState("UPLOADING");
      setUploadProgress(80);
      setProgressStatusText("Uploading document…");

      // Smooth visual progression during network upload (80% -> 84% -> 88% -> 91% -> 94%)
      const uploadTargets = [84, 88, 91, 94];
      let uploadIdx = 0;
      progressIntervalRef.current = setInterval(() => {
        const nextVal = uploadTargets[uploadIdx];
        if (typeof nextVal === "number") {
          setUploadProgress(nextVal);
          uploadIdx++;
        }
      }, 150);

      // 2. Binary PUT to Supabase Storage signed upload URL
      let uploadHttpRes: Response;
      try {
        uploadHttpRes = await fetch(signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": selectedFile.type || "application/octet-stream",
          },
          body: selectedFile,
        });
      } catch {
        clearProgressTimer();
        setUploadState("ERROR");
        setUploadProgress(0);
        setModalError("Upload failed. Please try again.");
        return;
      }

      clearProgressTimer();

      if (!uploadHttpRes.ok) {
        setUploadState("ERROR");
        setUploadProgress(0);
        setModalError("Upload failed. Please try again.");
        return;
      }

      // Stage 3: FINALIZING (95-99%)
      setUploadState("SAVING");
      setUploadProgress(95);
      setProgressStatusText("Saving document…");

      const savingTargets = [97, 99];
      let savingIdx = 0;
      progressIntervalRef.current = setInterval(() => {
        const nextVal = savingTargets[savingIdx];
        if (typeof nextVal === "number") {
          setUploadProgress(nextVal);
          savingIdx++;
        }
      }, 200);

      // 3. Register document in PostgreSQL database using server-bound documentId and filename
      const regRes = await registerCandidateDocumentSelfAction({
        documentId,
        filename,
        documentType: docType,
        title: titleToUse,
        fileSizeBytes: selectedFile.size,
        mimeType: selectedFile.type || "application/octet-stream",
        isDefault: docType === "RESUME" ? isDefaultResume : false,
      });

      clearProgressTimer();

      if (!regRes.success || !regRes.data?.document) {
        setUploadState("ERROR");
        setUploadProgress(0);
        setModalError(regRes.error || "Document could not be finalized. Please try again.");
        return;
      }

      // Stage 4: COMPLETE (100%)
      setUploadProgress(100);
      setProgressStatusText("Document uploaded successfully");
      setUploadState("SUCCESS");

      const createdDoc = regRes.data.document as CandidateVaultDocument;

      // Optimistic/Local state update without full page reload
      setDocuments((prev) => {
        let next = [createdDoc, ...prev];
        if (createdDoc.isDefault && createdDoc.documentType === "RESUME") {
          next = next.map((d) =>
            d.id === createdDoc.id
              ? d
              : d.documentType === "RESUME"
              ? { ...d, isDefault: false }
              : d
          );
        }
        return next;
      });

      onDocumentUploaded?.(createdDoc);

      setSuccessToast(`Document "${titleToUse}" uploaded and registered.`);
      setTimeout(() => {
        setSuccessToast(null);
      }, 4000);

      setTimeout(() => {
        setShowUploadModal(false);
        setUploadState("IDLE");
        setUploadProgress(0);
        setProgressStatusText("");
      }, 600);
    } catch (err: any) {
      clearProgressTimer();
      setUploadState("ERROR");
      setUploadProgress(0);
      setModalError("Unable to prepare secure upload. Please try again.");
    }
  };

  const handleDownload = async (docId: string) => {
    setIsDownloadingId(docId);
    setErrorMsg(null);
    try {
      const res = await getDocumentDownloadUrlAction(docId);
      if (res.success && res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        setErrorMsg(res.error || "Failed to generate secure download link");
      }
    } catch {
      setErrorMsg("Network error generating download link");
    } finally {
      setIsDownloadingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Candidate Document Vault
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              {documents.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Encrypted candidate assets utilized for tailoring and employer submissions
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenUploadModal()}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer active:scale-98"
        >
          <span>+</span>
          <span>Upload Document</span>
        </button>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-700">✓</span>
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-600 hover:text-emerald-800 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Error Alert */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="p-3 bg-slate-50/40 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          const count =
            cat.key === "ALL"
              ? documents.length
              : documents.filter((d) => d.documentType === cat.key).length;

          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                isSelected
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1 rounded ${
                  isSelected ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Documents List / Empty State */}
      {filteredDocs.length === 0 ? (
        <div className="p-12 text-center text-slate-500 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-xl text-slate-400">
            📄
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              No documents in this category
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Upload your resume, transcripts, certifications, or other career documents.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleOpenUploadModal()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span>
              <span>Upload Document</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 pt-1">
            PDF, DOCX and supported file types • Maximum 50 MB
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredDocs.map((doc) => {
            const uploadedDateText = new Date(doc.createdAt).toLocaleDateString([], {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <div
                key={doc.id}
                className={`p-4 hover:bg-slate-50/75 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  exitingDocId === doc.id
                    ? "opacity-0 -translate-y-2 scale-98 pointer-events-none"
                    : "opacity-100 translate-y-0 scale-100"
                }`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 truncate">
                      {doc.title}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {doc.documentType.replace(/_/g, " ")} (v{doc.versionNumber})
                    </span>
                    {doc.isDefault && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        Default for Tailoring
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-500">
                    <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    <span>•</span>
                    <span>Uploaded {uploadedDateText}</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setViewingDocId(doc.id);
                      setViewingDocMeta({ title: doc.title, mimeType: doc.mimeType, sizeBytes: doc.fileSizeBytes });
                    }}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc.id)}
                    disabled={isDownloadingId === doc.id}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {isDownloadingId === doc.id ? "…" : "Download"}
                  </button>

                  <DestructiveAction
                    actionLabel="Delete"
                    entityName="document"
                    entityTitle={doc.title}
                    entityId={doc.id}
                    confirmTitle="Delete this document?"
                    confirmDescription="This document will be permanently removed from your document vault. This action cannot be undone."
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    processingLabel="Deleting document…"
                    successLabel="Document deleted"
                    variant="ghost"
                    size="sm"
                    mode="modal"
                    onConfirm={async () => {
                      const res = await deleteCandidateDocumentAction(doc.id);
                      if (!res.success) {
                        throw new Error(res.error || "Failed to remove document");
                      }
                    }}
                    onSuccess={() => {
                      setExitingDocId(doc.id);
                      setTimeout(() => {
                        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                        onDocumentDeleted?.();
                        setExitingDocId(null);
                        setSuccessToast(`"${doc.title}" removed from vault.`);
                        setTimeout(() => setSuccessToast(null), 3500);
                      }, 280);
                    }}
                    onError={(err) => {
                      setErrorMsg(
                        err instanceof Error
                          ? err.message
                          : "Failed to remove document"
                      );
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Upload Career Document
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Secure encrypted storage for tailoring and employer applications
                </p>
              </div>
              <button
                type="button"
                disabled={uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING"}
                onClick={handleCloseUploadModal}
                className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <span className="font-bold text-rose-600">!</span>
                  <div className="flex-1">{modalError}</div>
                </div>
              )}

              {uploadState === "SUCCESS" ? (
                <div className="py-8 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                    ✓
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">
                    Upload Complete
                  </h4>
                  <p className="text-xs text-slate-500">
                    Document registered securely in your career vault.
                  </p>
                </div>
              ) : (
                <form id="vault-upload-form" onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
                  {/* Step 1: Document Category */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Step 1 — Document Type
                    </label>
                    <select
                      value={docType}
                      disabled={uploadState === "UPLOADING" || uploadState === "SAVING"}
                      onChange={(e) => {
                        const newType = e.target.value as any;
                        setDocType(newType);
                        if (newType === "RESUME") {
                          const hasResumes = documents.some((d) => d.documentType === "RESUME");
                          setIsDefaultResume(!hasResumes);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition"
                    >
                      <option value="RESUME">Resume / CV</option>
                      <option value="COVER_LETTER">Cover Letter</option>
                      <option value="TRANSCRIPT">Education & Academic Transcript</option>
                      <option value="CERTIFICATE">Certification & Professional License</option>
                      <option value="OTHER">Other Career Documents (Work Auth, Portfolio, etc.)</option>
                    </select>
                  </div>

                  {/* Step 2: File Dropzone / Picker */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Step 2 — Select File
                    </label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ALLOWED_EXTENSIONS.join(",")}
                      disabled={uploadState === "UPLOADING" || uploadState === "SAVING"}
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    {!selectedFile ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                          isDragging
                            ? "border-blue-500 bg-blue-50/50"
                            : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-2xs">
                          ⬆
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">
                            Click to browse or drag & drop file here
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            PDF, DOCX, DOC, RTF, TXT, PNG, JPG (Maximum 50 MB)
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 border border-slate-200 rounded-xl bg-slate-50/75 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-base shrink-0">
                            📄
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 truncate text-xs">
                              {selectedFile.name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatFileSize(selectedFile.size)} • {selectedFile.type || "binary"}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={uploadState === "UPLOADING" || uploadState === "SAVING"}
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="px-2.5 py-1 rounded-md text-slate-600 hover:text-rose-600 hover:bg-white text-xs border border-transparent hover:border-slate-200 transition font-medium cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Document Title / Display Name */}
                  {selectedFile && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Document Title / Display Name
                      </label>
                      <input
                        type="text"
                        required
                        value={docTitle}
                        disabled={uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING"}
                        onChange={(e) => setDocTitle(e.target.value)}
                        placeholder="e.g. Master Resume 2026"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition"
                      />
                    </div>
                  )}

                  {/* Resume Default Checkbox */}
                  {docType === "RESUME" && (
                    <div className="flex items-start gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="isDefaultResumeSelf"
                        checked={isDefaultResume}
                        disabled={uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING"}
                        onChange={(e) => setIsDefaultResume(e.target.checked)}
                        className="mt-0.5 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                      />
                      <label htmlFor="isDefaultResumeSelf" className="text-xs text-slate-700 cursor-pointer">
                        Set as primary default resume for tailoring and applications
                      </label>
                    </div>
                  )}

                  {/* Upload Progress Bar */}
                  {(uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING") && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[11px] text-slate-600 font-medium">
                        <span>{progressStatusText || "Uploading document…"}</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-slate-900 h-1.5 rounded-full transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Modal Footer */}
            {uploadState !== "SUCCESS" && (
              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING"}
                  onClick={handleCloseUploadModal}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white transition disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="vault-upload-form"
                  disabled={uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING" || !selectedFile}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  {uploadState === "SAVING" ? (
                    <>
                      <span className="animate-spin text-xs">⏳</span>
                      <span>Saving…</span>
                    </>
                  ) : uploadState === "VALIDATING" || uploadState === "UPLOADING" ? (
                    <>
                      <span className="animate-spin text-xs">⏳</span>
                      <span>Uploading…</span>
                    </>
                  ) : (
                    "Upload Document"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {viewingDocId && (
        <DocumentPreviewModal
          documentId={viewingDocId}
          documentTitle={viewingDocMeta?.title}
          documentMimeType={viewingDocMeta?.mimeType}
          documentSizeBytes={viewingDocMeta?.sizeBytes}
          onClose={() => {
            setViewingDocId(null);
            setViewingDocMeta(null);
          }}
        />
      )}
    </div>
  );
}
