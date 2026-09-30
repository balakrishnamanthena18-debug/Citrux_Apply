"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  requestDocumentUploadUrlAction,
  registerCandidateDocumentAction,
  getDocumentDownloadUrlAction,
  deleteCandidateDocumentAction,
} from "@/lib/candidate/actions";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";

interface CandidateDocumentItem {
  id: string;
  candidateId: string;
  documentType: "RESUME" | "COVER_LETTER" | "TRANSCRIPT" | "CERTIFICATE" | "OTHER";
  title: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  versionNumber: number;
  isDefault: boolean;
  uploadedBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface Props {
  candidateId: string;
  candidateName: string;
  documents: CandidateDocumentItem[];
}

export function EmployeeCandidateDocuments({
  candidateId,
  candidateName,
  documents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [docList, setDocList] = useState<CandidateDocumentItem[]>(documents);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<"RESUME" | "COVER_LETTER" | "TRANSCRIPT" | "CERTIFICATE" | "OTHER">("RESUME");
  const [isDefault, setIsDefault] = useState(false);
  const [documentTitle, setDocumentTitle] = useState("");

  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Document Viewer State
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [viewingDocMeta, setViewingDocMeta] = useState<{ title: string; mimeType: string; sizeBytes: number } | null>(null);

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const showFeedback = (type: "success" | "error", text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
  };

  const handleDownload = async (docId: string, title: string) => {
    const res = await getDocumentDownloadUrlAction(docId);
    if (res.success && res.data?.downloadUrl) {
      window.open(res.data.downloadUrl, "_blank", "noopener,noreferrer");
    } else {
      showFeedback("error", res.error || "Failed to generate secure download link");
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      return;
    }
    // Optimistic local removal
    setDocList((prev) => prev.filter((d) => d.id !== docId));
    const res = await deleteCandidateDocumentAction(docId);
    if (res.success) {
      showFeedback("success", `Document "${title}" removed successfully.`);
    } else {
      // Revert if server failed
      setDocList(documents);
      showFeedback("error", res.error || "Failed to delete document");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!documentTitle) {
        setDocumentTitle(file.name);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Please select a file to upload.");
      return;
    }

    setUploadStatus("uploading");
    setErrorMessage(null);

    try {
      // 1. Request signed upload URL
      const urlRes = await requestDocumentUploadUrlAction({
        candidateId,
        filename: selectedFile.name,
      });

      if (!urlRes.success || !urlRes.data) {
        throw new Error(urlRes.error || "Failed to authorize document upload");
      }

      const { signedUrl, storagePath } = urlRes.data;

      // 2. Binary PUT to Supabase Storage signed URL
      const uploadHttpRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile,
      });

      if (!uploadHttpRes.ok) {
        throw new Error(`Storage upload failed with HTTP status ${uploadHttpRes.status}`);
      }

      // 3. Register document in PostgreSQL
      const registerRes = await registerCandidateDocumentAction({
        candidateId,
        documentType,
        title: documentTitle.trim() || selectedFile.name,
        storagePath,
        fileSizeBytes: selectedFile.size,
        mimeType: selectedFile.type || "application/octet-stream",
        isDefault,
      });

      const newDoc: CandidateDocumentItem = {
        id: registerRes.data?.documentId || `doc-${Date.now()}`,
        candidateId,
        documentType,
        title: documentTitle.trim() || selectedFile.name,
        storagePath,
        fileSizeBytes: selectedFile.size,
        mimeType: selectedFile.type || "application/octet-stream",
        versionNumber: 1,
        isDefault,
        uploadedBy: "me",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setDocList((prev) => {
        let updated = isDefault
          ? prev.map((d) => (d.documentType === documentType ? { ...d, isDefault: false } : d))
          : [...prev];
        return [newDoc, ...updated];
      });

      setUploadStatus("success");
      showFeedback("success", `Document "${documentTitle || selectedFile.name}" uploaded successfully.`);
      setTimeout(() => {
        setShowUploadModal(false);
        setSelectedFile(null);
        setDocumentTitle("");
        setUploadStatus("idle");
      }, 500);
    } catch (err: any) {
      setUploadStatus("error");
      setErrorMessage(err.message || "An unexpected error occurred during upload.");
    }
  };

  // Filter resumes vs other documents from local state
  const resumes = docList.filter((d) => d.documentType === "RESUME");
  const otherDocs = docList.filter((d) => d.documentType !== "RESUME");

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Candidate Documents</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {docList.length} {docList.length === 1 ? "file" : "files"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Authorized source documents and resumes for {candidateName}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowUploadModal(true);
            setUploadStatus("idle");
            setErrorMessage(null);
            setSelectedFile(null);
            setDocumentTitle("");
            setIsDefault(docList.length === 0);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition shadow-sm"
        >
          <span>+</span> Upload Document
        </button>
      </div>

      {/* Inline Feedback Toast */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-md text-xs flex items-center justify-between ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Resumes Highlight Box */}
      <div>
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <span>📄</span> Resumes / CVs
        </h3>

        {resumes.length === 0 ? (
          <div className="p-4 rounded-md border border-dashed border-slate-200 bg-slate-50 text-center">
            <p className="text-xs text-slate-500">No resume uploaded for this candidate yet.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Upload the candidate&apos;s canonical resume to prepare application materials.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {resumes.map((doc) => (
              <div
                key={doc.id}
                className="p-4 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition shadow-xs flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-900 truncate" title={doc.title}>
                      {doc.title}
                    </h4>
                    {doc.isDefault && (
                      <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                    <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    <span>•</span>
                    <span>{doc.mimeType.split("/")[1]?.toUpperCase() || "PDF"}</span>
                    <span>•</span>
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setViewingDocId(doc.id);
                      setViewingDocMeta({ title: doc.title, mimeType: doc.mimeType, sizeBytes: doc.fileSizeBytes });
                    }}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition inline-flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc.id, doc.title)}
                    className="px-2.5 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition inline-flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.title)}
                    className="px-2.5 py-1 rounded hover:bg-rose-50 text-rose-600 text-xs font-medium transition ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Other Candidate Documents */}
      {otherDocs.length > 0 && (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span>📁</span> Other Candidate Documents
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {otherDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition shadow-xs flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-900 truncate" title={doc.title}>
                      {doc.title}
                    </h4>
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                      {doc.documentType.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                    <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    <span>•</span>
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setViewingDocId(doc.id);
                      setViewingDocMeta({ title: doc.title, mimeType: doc.mimeType, sizeBytes: doc.fileSizeBytes });
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition inline-flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc.id, doc.title)}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition inline-flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id, doc.title)}
                    className="px-2 py-0.5 rounded hover:bg-rose-50 text-rose-600 text-xs font-medium transition ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">Upload Candidate Document</h3>
              <button
                type="button"
                disabled={uploadStatus === "uploading"}
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                {errorMessage}
              </div>
            )}

            {uploadStatus === "success" ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded text-center text-xs text-emerald-800 font-medium">
                ✓ Document uploaded and registered successfully!
              </div>
            ) : (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Document Category
                  </label>
                  <select
                    value={documentType}
                    disabled={uploadStatus === "uploading"}
                    onChange={(e) => setDocumentType(e.target.value as any)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-1 focus:ring-slate-500 focus:outline-none"
                  >
                    <option value="RESUME">Resume / CV</option>
                    <option value="COVER_LETTER">Cover Letter</option>
                    <option value="TRANSCRIPT">Academic Transcript</option>
                    <option value="CERTIFICATE">Certificate / License</option>
                    <option value="OTHER">Other Source Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Select File (PDF, DOCX, TXT - max 15MB)
                  </label>
                  <input
                    type="file"
                    required
                    disabled={uploadStatus === "uploading"}
                    onChange={handleFileChange}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>

                {selectedFile && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Document Title / Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={documentTitle}
                      disabled={uploadStatus === "uploading"}
                      onChange={(e) => setDocumentTitle(e.target.value)}
                      placeholder="e.g. Alex_Rivera_Resume_2026.pdf"
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:ring-1 focus:ring-slate-500 focus:outline-none"
                    />
                  </div>
                )}

                {documentType === "RESUME" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isDefaultResume"
                      checked={isDefault}
                      disabled={uploadStatus === "uploading"}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="rounded text-slate-900"
                    />
                    <label htmlFor="isDefaultResume" className="text-xs text-slate-700">
                      Set as primary default resume for application preparation
                    </label>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={uploadStatus === "uploading"}
                    onClick={() => setShowUploadModal(false)}
                    className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadStatus === "uploading" || !selectedFile}
                    className="px-4 py-1.5 rounded-md bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {uploadStatus === "uploading" ? (
                      <>
                        <span className="animate-spin text-xs">⏳</span>
                        <span>Uploading...</span>
                      </>
                    ) : (
                      "Upload & Register"
                    )}
                  </button>
                </div>
              </form>
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
