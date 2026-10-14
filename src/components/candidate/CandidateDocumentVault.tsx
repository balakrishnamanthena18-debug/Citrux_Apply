"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  getDocumentDownloadUrlAction,
  deleteCandidateDocumentAction,
  requestCandidateDocumentUploadUrlSelfAction,
  registerCandidateDocumentSelfAction,
  setDefaultCandidateResumeAction,
} from "@/lib/candidate/actions";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { formatApplicationCardDate } from "@/lib/utils/format-application-date";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export interface CandidateVaultDocument {
  id: string;
  candidateId?: string;
  title: string;
  documentType: string;
  fileSizeBytes: number;
  mimeType: string;
  versionNumber?: number;
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

interface MenuPosition {
  top: number;
  left: number;
  openUpward: boolean;
}

export function CandidateDocumentVault({
  documents: initialDocuments,
  onDocumentDeleted,
  onDocumentUploaded,
}: Props) {
  const [documents, setDocuments] = useState<CandidateVaultDocument[]>(initialDocuments);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);
  const [isSettingDefaultId, setIsSettingDefaultId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [exitingDocId, setExitingDocId] = useState<string | null>(null);

  // Overflow Menu State
  const [activeMenuDocId, setActiveMenuDocId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Document Viewer State
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [viewingDocMeta, setViewingDocMeta] = useState<{ title: string; mimeType: string; sizeBytes: number } | null>(null);

  // Delete Confirmation Modal State
  const [deletingDoc, setDeletingDoc] = useState<CandidateVaultDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Close overflow menu helper
  const closeMenu = useCallback(() => {
    setActiveMenuDocId(null);
    setMenuPosition(null);
    activeTriggerRef.current = null;
  }, []);

  // Handle outside click, scroll, resize, or escape key for overflow menu
  useEffect(() => {
    if (!activeMenuDocId) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        activeTriggerRef.current &&
        !activeTriggerRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };

    const handleScrollOrResize = () => {
      closeMenu();
    };

    document.addEventListener("mousedown", handleOutsideClick, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [activeMenuDocId, closeMenu]);

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

  // 1. Authoritative Single Default Resume Determination
  // Exactly ONE resume per candidate is the authoritative default for application tailoring.
  const defaultResumeId = useMemo(() => {
    const defaultResume = documents.find(
      (d) => d.documentType === "RESUME" && d.isDefault
    );
    return defaultResume ? defaultResume.id : null;
  }, [documents]);

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

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case "RESUME":
        return (
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/80 text-blue-700 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        );
      case "COVER_LETTER":
        return (
          <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200/80 text-purple-700 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        );
      case "TRANSCRIPT":
        return (
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
        );
      case "CERTIFICATE":
        return (
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </div>
        );
    }
  };

  const getEmptyCategoryMessage = (categoryKey: string) => {
    switch (categoryKey) {
      case "RESUME":
        return {
          title: "No resumes uploaded",
          description: "Upload your master resume so operations can extract verified facts and tailor applications for target roles.",
        };
      case "COVER_LETTER":
        return {
          title: "No cover letters yet",
          description: "Upload cover letter templates or supplementary narratives to make them available for employer submissions.",
        };
      case "TRANSCRIPT":
        return {
          title: "No transcripts or education records",
          description: "Upload academic transcripts or degree verifications for roles that require official educational proof.",
        };
      case "CERTIFICATE":
        return {
          title: "No certifications uploaded",
          description: "Upload technical or professional credentials to strengthen employer qualification profiles.",
        };
      case "OTHER":
        return {
          title: "No other attachments",
          description: "Upload supplementary portfolios, letters of recommendation, or specialized documents.",
        };
      default:
        return {
          title: "No documents in vault",
          description: "Upload your resume, transcripts, certifications, or other career files to support tailoring and submissions.",
        };
    }
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
      return;
    }
    clearProgressTimer();
    setShowUploadModal(false);
  };

  const validateAndSetFile = (file: File) => {
    setModalError(null);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setModalError("Your file is larger than the 50 MB limit.");
      return;
    }
    if (file.size === 0) {
      setModalError("The selected file is empty (0 bytes).");
      return;
    }

    const nameLower = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
    if (!hasValidExt) {
      setModalError(`Unsupported file format. Please upload a PDF, Word document, or image (${ALLOWED_EXTENSIONS.join(", ")}).`);
      return;
    }

    setSelectedFile(file);
    if (!docTitle.trim()) {
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
    if (!selectedFile) {
      setModalError("Please select a file to upload.");
      return;
    }

    const titleToUse = docTitle.trim() || selectedFile.name;

    try {
      setUploadState("VALIDATING");
      setUploadProgress(15);
      setProgressStatusText("Validating document and preparing secure storage…");

      const validationTargets = [30, 50, 70];
      let valIdx = 0;
      progressIntervalRef.current = setInterval(() => {
        const nextVal = validationTargets[valIdx];
        if (typeof nextVal === "number") {
          setUploadProgress(nextVal);
          valIdx++;
        }
      }, 120);

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

      setUploadState("UPLOADING");
      setUploadProgress(80);
      setProgressStatusText("Uploading document…");

      const uploadTargets = [84, 88, 91, 94];
      let uploadIdx = 0;
      progressIntervalRef.current = setInterval(() => {
        const nextVal = uploadTargets[uploadIdx];
        if (typeof nextVal === "number") {
          setUploadProgress(nextVal);
          uploadIdx++;
        }
      }, 150);

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
        setModalError(regRes.error || "Failed to register document record.");
        return;
      }

      setUploadState("SUCCESS");
      setUploadProgress(100);
      setProgressStatusText("Complete!");

      const createdDoc: CandidateVaultDocument = {
        id: regRes.data.document.id,
        title: titleToUse,
        documentType: docType,
        fileSizeBytes: selectedFile.size,
        mimeType: selectedFile.type || "application/octet-stream",
        versionNumber: regRes.data.document.versionNumber || 1,
        isDefault: regRes.data.document.isDefault,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setDocuments((prev) => {
        let next = [createdDoc, ...prev];
        if (createdDoc.isDefault && createdDoc.documentType === "RESUME") {
          next = next.map((d) =>
            d.id !== createdDoc.id && d.documentType === "RESUME"
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
    } catch {
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

  const handleSetDefaultResume = async (doc: CandidateVaultDocument) => {
    setIsSettingDefaultId(doc.id);
    setErrorMsg(null);
    closeMenu();

    try {
      const res = await setDefaultCandidateResumeAction(doc.id);
      if (res.success) {
        setDocuments((prev) =>
          prev.map((d) => ({
            ...d,
            isDefault: d.id === doc.id,
          }))
        );
        setSuccessToast(`"${doc.title}" set as default resume for tailoring.`);
        setTimeout(() => setSuccessToast(null), 3500);
      } else {
        setErrorMsg(res.error || "Failed to set default resume");
      }
    } catch {
      setErrorMsg("Failed to update default resume status");
    } finally {
      setIsSettingDefaultId(null);
    }
  };

  const handleExecuteDelete = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteCandidateDocumentAction(deletingDoc.id);
      if (!res.success) {
        throw new Error(res.error || "Failed to remove document");
      }

      const deletedTitle = deletingDoc.title;
      const deletedId = deletingDoc.id;

      setDeletingDoc(null);
      setIsDeleting(false);

      setExitingDocId(deletedId);
      setTimeout(() => {
        setDocuments((prev) => prev.filter((d) => d.id !== deletedId));
        onDocumentDeleted?.();
        setExitingDocId(null);
        setSuccessToast(`"${deletedTitle}" removed from vault.`);
        setTimeout(() => setSuccessToast(null), 3500);
      }, 280);
    } catch (err: any) {
      setIsDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "Failed to remove document");
    }
  };

  // Open / Toggle Overflow Menu with Viewport Collision Awareness
  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, docId: string) => {
    if (activeMenuDocId === docId) {
      closeMenu();
      return;
    }

    const buttonEl = e.currentTarget;
    activeTriggerRef.current = buttonEl;
    const rect = buttonEl.getBoundingClientRect();

    const menuHeight = 160; // Estimated menu height
    const menuWidth = 190;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight && rect.top > menuHeight;

    const top = openUpward ? rect.top - menuHeight - 4 : rect.bottom + 4;
    const left = Math.max(8, rect.right - menuWidth);

    setMenuPosition({ top, left, openUpward });
    setActiveMenuDocId(docId);
  };

  // Find active menu doc
  const activeMenuDoc = useMemo(() => {
    if (!activeMenuDocId) return null;
    return documents.find((d) => d.id === activeMenuDocId) || null;
  }, [activeMenuDocId, documents]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Candidate Document Vault
            </h2>
            <HelpTooltip topic="document_vault" label="Document vault help" />
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
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
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

      {/* Category Navigation (Wrapping Flex - Zero Scrollbar on Desktop) */}
      <div className="p-3 bg-slate-50/40 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
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
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                  isSelected ? "bg-slate-700 text-slate-100" : "bg-slate-100 text-slate-500"
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
        <div className="p-10 sm:p-12 text-center text-slate-500 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-xl text-slate-400">
            📄
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">
              {getEmptyCategoryMessage(selectedCategory).title}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {getEmptyCategoryMessage(selectedCategory).description}
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleOpenUploadModal(selectedCategory)}
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
            const uploadedDateText = formatApplicationCardDate(doc.createdAt);
            const isDefault = doc.id === defaultResumeId;
            const isMenuOpen = activeMenuDocId === doc.id;

            return (
              <div
                key={doc.id}
                className={`p-4 hover:bg-slate-50/75 transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  exitingDocId === doc.id
                    ? "opacity-0 -translate-y-2 scale-98 pointer-events-none"
                    : "opacity-100 translate-y-0 scale-100"
                }`}
              >
                {/* Left: Document Identity & Authority */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {getDocumentTypeIcon(doc.documentType)}

                  <div className="space-y-1 min-w-0 flex-1">
                    {/* Primary: Full Title with Title Tooltip */}
                    <div className="flex items-center gap-2 max-w-full">
                      <h4
                        className="font-semibold text-sm text-slate-900 break-words sm:truncate max-w-xl"
                        title={doc.title}
                      >
                        {doc.title}
                      </h4>
                    </div>

                    {/* Secondary: Type & Truthful Single Default Semantic (No Fake Versions) */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-semibold text-slate-600 uppercase tracking-wider text-[11px]">
                        {doc.documentType.replace(/_/g, " ")}
                      </span>

                      {/* Only the single authoritative default resume gets this badge */}
                      {isDefault && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Default for Tailoring
                          </span>
                        </>
                      )}
                    </div>

                    {/* Tertiary: Size & Upload Date */}
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span>{formatFileSize(doc.fileSizeBytes)}</span>
                      <span>•</span>
                      <span suppressHydrationWarning>Uploaded {uploadedDateText}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions Hierarchy (View [Primary] · Download [Secondary] · Overflow [⋮]) */}
                <div className="shrink-0 flex items-center gap-2 relative self-end sm:self-center">
                  {/* Primary Action: View */}
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      setViewingDocId(doc.id);
                      setViewingDocMeta({ title: doc.title, mimeType: doc.mimeType, sizeBytes: doc.fileSizeBytes });
                    }}
                    aria-label={`View ${doc.title}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs cursor-pointer inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 active:scale-98"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>View</span>
                  </button>

                  {/* Secondary Action: Download (Visible on Desktop / Tablet) */}
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      handleDownload(doc.id);
                    }}
                    disabled={isDownloadingId === doc.id}
                    aria-label={`Download ${doc.title}`}
                    className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition disabled:opacity-50 cursor-pointer items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>{isDownloadingId === doc.id ? "…" : "Download"}</span>
                  </button>

                  {/* Overflow Action Trigger [ ⋮ ] */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleMenu(e, doc.id)}
                    aria-expanded={isMenuOpen}
                    aria-haspopup="true"
                    aria-label={`More options for ${doc.title}`}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                      isMenuOpen
                        ? "bg-slate-100 border-slate-300 text-slate-900"
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Viewport-Anchored Overflow Popover Menu (Rendered via React Portal) */}
      {typeof document !== "undefined" &&
        activeMenuDoc &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            style={{
              position: "fixed",
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: "190px",
              zIndex: 9999,
            }}
            className="bg-white rounded-lg shadow-xl border border-slate-200 py-1 divide-y divide-slate-100 animate-fade-in"
          >
            <div className="py-0.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const doc = activeMenuDoc;
                  closeMenu();
                  setViewingDocId(doc.id);
                  setViewingDocMeta({ title: doc.title, mimeType: doc.mimeType, sizeBytes: doc.fileSizeBytes });
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer focus:bg-slate-50 focus:outline-none"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>View Document</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const doc = activeMenuDoc;
                  closeMenu();
                  handleDownload(doc.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer focus:bg-slate-50 focus:outline-none"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download File</span>
              </button>

              {/* Set as Default (Only for non-default Resumes) */}
              {activeMenuDoc.documentType === "RESUME" && activeMenuDoc.id !== defaultResumeId && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={isSettingDefaultId === activeMenuDoc.id}
                  onClick={() => handleSetDefaultResume(activeMenuDoc)}
                  className="w-full px-3 py-1.5 text-left text-xs text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer focus:bg-emerald-50 focus:outline-none"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{isSettingDefaultId === activeMenuDoc.id ? "Setting Default…" : "Set as Default Resume"}</span>
                </button>
              )}
            </div>

            {/* Destructive Action */}
            <div className="py-0.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const doc = activeMenuDoc;
                  closeMenu();
                  setDeletingDoc(doc);
                  setDeleteError(null);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer focus:bg-rose-50 focus:outline-none font-medium"
              >
                <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete Document</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Authoritative OOS Delete Confirmation Modal (Rendered via React Portal) */}
      {typeof document !== "undefined" &&
        deletingDoc &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) {
                setDeletingDoc(null);
                setDeleteError(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
              aria-describedby="delete-dialog-desc"
              className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden p-6 space-y-4 animate-scale-in"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center text-lg shrink-0">
                  🗑️
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <h3 id="delete-dialog-title" className="text-sm font-semibold text-slate-900">
                    Delete this document?
                  </h3>
                  <p id="delete-dialog-desc" className="text-xs text-slate-500 leading-relaxed">
                    <span className="font-semibold text-slate-700 break-words">{deletingDoc.title}</span> will be permanently removed from your document vault. This action cannot be undone.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg">
                  {deleteError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setDeletingDoc(null);
                    setDeleteError(null);
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleExecuteDelete}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition shadow-2xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isDeleting ? (
                    <>
                      <span className="animate-spin text-xs">⏳</span>
                      <span>Deleting document…</span>
                    </>
                  ) : (
                    <span>Delete Document</span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
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
                <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg flex items-center justify-between">
                  <span>{modalError}</span>
                  <button
                    type="button"
                    onClick={() => setModalError(null)}
                    className="text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={docType}
                    disabled={uploadState !== "IDLE" && uploadState !== "ERROR"}
                    onChange={(e) => setDocType(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="RESUME">Resume / CV (Master)</option>
                    <option value="COVER_LETTER">Cover Letter / Narrative</option>
                    <option value="TRANSCRIPT">Education Transcript / Degree</option>
                    <option value="CERTIFICATE">Professional Certificate</option>
                    <option value="OTHER">Other Career Attachment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select File <span className="text-rose-500">*</span>
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                      isDragging
                        ? "border-blue-500 bg-blue-50/50"
                        : selectedFile
                        ? "border-emerald-300 bg-emerald-50/30"
                        : "border-slate-300 hover:border-slate-400 bg-slate-50/30"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileInputChange}
                      accept={ALLOWED_EXTENSIONS.join(",")}
                      disabled={uploadState !== "IDLE" && uploadState !== "ERROR"}
                      className="hidden"
                    />

                    {selectedFile ? (
                      <div className="space-y-1">
                        <div className="text-xl">📄</div>
                        <p className="text-xs font-semibold text-slate-900 truncate max-w-xs mx-auto">
                          {selectedFile.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatFileSize(selectedFile.size)} • Click to change file
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-xl text-slate-400">☁️</div>
                        <p className="text-xs font-medium text-slate-700">
                          Drag & drop your file here, or <span className="text-blue-600 font-semibold">browse</span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          PDF, DOCX, TXT, images up to 50 MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Display Title
                  </label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    disabled={uploadState !== "IDLE" && uploadState !== "ERROR"}
                    placeholder="e.g. Master Resume - Senior Engineer"
                    className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {docType === "RESUME" && (
                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDefaultResume}
                      disabled={uploadState !== "IDLE" && uploadState !== "ERROR"}
                      onChange={(e) => setIsDefaultResume(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-900 block">
                        Set as Default Resume for Tailoring
                      </span>
                      <span className="text-slate-500 text-[11px] block mt-0.5">
                        Specialists will use this version as the base facts for customized application proposals.
                      </span>
                    </div>
                  </label>
                )}

                {uploadState !== "IDLE" && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{progressStatusText}</span>
                      <span className="font-semibold text-slate-900">{uploadProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          uploadState === "SUCCESS"
                            ? "bg-emerald-500"
                            : uploadState === "ERROR"
                            ? "bg-rose-500"
                            : "bg-blue-600"
                        }`}
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING"}
                    onClick={handleCloseUploadModal}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedFile || (uploadState !== "IDLE" && uploadState !== "ERROR")}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {uploadState === "VALIDATING" || uploadState === "UPLOADING" || uploadState === "SAVING" ? (
                      <>
                        <span className="animate-spin text-xs">⏳</span>
                        <span>Processing…</span>
                      </>
                    ) : (
                      <>
                        <span>Upload & Register</span>
                        <span>→</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDocId && viewingDocMeta && (
        <DocumentPreviewModal
          documentId={viewingDocId}
          documentTitle={viewingDocMeta.title}
          documentSizeBytes={viewingDocMeta.sizeBytes}
          documentMimeType={viewingDocMeta.mimeType}
          onClose={() => {
            setViewingDocId(null);
            setViewingDocMeta(null);
          }}
        />
      )}
    </div>
  );
}
