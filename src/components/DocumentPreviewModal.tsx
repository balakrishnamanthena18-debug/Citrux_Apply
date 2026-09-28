"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCandidateDocumentViewUrlAction, getDocumentDownloadUrlAction } from "@/lib/candidate/actions";

interface DocumentPreviewModalProps {
  documentId: string;
  /** Fallback metadata shown while loading. */
  documentTitle?: string;
  documentMimeType?: string;
  documentSizeBytes?: number;
  onClose: () => void;
}

type ViewerState = "LOADING" | "READY" | "ERROR" | "UNSUPPORTED";

const PREVIEWABLE_PDF = ["application/pdf"];
const PREVIEWABLE_IMAGES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"];
const PREVIEWABLE_DOCX = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/docx",
  "application/msword",
];
const PREVIEWABLE_TEXT = ["text/plain", "text/markdown", "text/csv"];

function isPreviewablePdf(mimeType: string, filename?: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  return PREVIEWABLE_PDF.includes(mime) || name.endsWith(".pdf");
}

function isPreviewableImage(mimeType: string, filename?: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  return (
    PREVIEWABLE_IMAGES.includes(mime) ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif")
  );
}

function isPreviewableDocx(mimeType: string, filename?: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  return PREVIEWABLE_DOCX.includes(mime) || name.endsWith(".docx");
}

function isPreviewableText(mimeType: string, filename?: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  return PREVIEWABLE_TEXT.includes(mime) || name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".md");
}

function isPreviewable(mimeType: string, filename?: string): boolean {
  return (
    isPreviewablePdf(mimeType, filename) ||
    isPreviewableImage(mimeType, filename) ||
    isPreviewableDocx(mimeType, filename) ||
    isPreviewableText(mimeType, filename)
  );
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileExtLabel(mimeType: string, filename?: string): string {
  const name = (filename || "").toLowerCase();
  if (name.endsWith(".docx")) return "DOCX";
  if (name.endsWith(".doc")) return "DOC";
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".txt")) return "TXT";
  if (name.endsWith(".csv")) return "CSV";
  if (name.endsWith(".png")) return "PNG";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "JPEG";

  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/jpg": "JPG",
    "image/webp": "WEBP",
    "image/gif": "GIF",
    "image/svg+xml": "SVG",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/msword": "DOC",
    "text/plain": "TXT",
    "text/markdown": "MD",
    "text/csv": "CSV",
    "application/rtf": "RTF",
  };
  return map[mimeType.toLowerCase()] || mimeType.split("/")[1]?.toUpperCase() || "FILE";
}

function DocxViewer({ url, onError }: { url: string; onError: (err: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAndRender() {
      try {
        setRendering(true);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to load document content (${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          const { renderAsync } = await import("docx-preview");
          await renderAsync(blob, containerRef.current, undefined, {
            className: "docx-render-page",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            useBase64URL: true,
          });
        }
        if (!cancelled) {
          setRendering(false);
        }
      } catch (err) {
        if (!cancelled) {
          setRendering(false);
          onError(
            err instanceof Error
              ? `Unable to preview Word document: ${err.message}`
              : "Unable to render Word document preview. You can download the file to view it."
          );
        }
      }
    }

    loadAndRender();
    return () => {
      cancelled = true;
    };
  }, [url, onError]);

  return (
    <div className="relative w-full min-h-[500px] flex flex-col items-center justify-start overflow-auto p-3 sm:p-6 bg-slate-200/60" style={{ maxHeight: "calc(100vh - 12rem)" }}>
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-xs z-10">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center animate-pulse">
              <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p className="text-xs text-slate-600 font-medium">Rendering Word document…</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full max-w-4xl flex flex-col items-center [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0 [&_.docx-wrapper]:flex [&_.docx-wrapper]:flex-col [&_.docx-wrapper]:items-center [&_.docx-wrapper]:gap-6 [&_.docx-render-page]:bg-white [&_.docx-render-page]:shadow-md [&_.docx-render-page]:rounded-sm [&_.docx-render-page]:border [&_.docx-render-page]:border-slate-300/80 [&_.docx-render-page]:p-8 sm:[&_.docx-render-page]:p-12 [&_.docx-render-page]:text-slate-900"
      />
    </div>
  );
}

function TextViewer({ url, onError }: { url: string; onError: (err: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadText() {
      try {
        setLoading(true);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const content = await res.text();
        if (!cancelled) {
          setText(content);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          onError(err instanceof Error ? err.message : "Failed to load file text.");
        }
      }
    }

    loadText();
    return () => {
      cancelled = true;
    };
  }, [url, onError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[300px]">
        <p className="text-xs text-slate-500 font-medium animate-pulse">Loading text preview…</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 overflow-auto max-h-[calc(100vh-12rem)] bg-slate-50 font-mono text-xs text-slate-800 whitespace-pre-wrap select-text leading-relaxed">
      {text}
    </div>
  );
}

export function DocumentPreviewModal({
  documentId,
  documentTitle,
  documentMimeType,
  documentSizeBytes,
  onClose,
}: DocumentPreviewModalProps) {
  const [state, setState] = useState<ViewerState>("LOADING");
  const [statusText, setStatusText] = useState("Opening document…");
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Resolved metadata from server
  const [title, setTitle] = useState(documentTitle || "Document");
  const [mimeType, setMimeType] = useState(documentMimeType || "");
  const [sizeBytes, setSizeBytes] = useState(documentSizeBytes || 0);

  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load signed view URL on mount
  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setStatusText("Preparing secure preview…");

      const res = await getCandidateDocumentViewUrlAction(documentId);

      if (cancelled) return;

      if (!res.success || !res.data) {
        setState("ERROR");
        setErrorMsg(res.error || "Unable to prepare document preview. Please try again.");
        return;
      }

      const { viewUrl: url, title: docTitle, mimeType: docMime, fileSizeBytes: docSize } = res.data;
      setViewUrl(url);
      setTitle(docTitle);
      setMimeType(docMime);
      setSizeBytes(docSize);

      if (isPreviewable(docMime, docTitle)) {
        setState("READY");
      } else {
        setState("UNSUPPORTED");
      }
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap: focus the modal container on mount
  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const res = await getDocumentDownloadUrlAction(documentId);
      if (res.success && res.data?.downloadUrl) {
        // Create a hidden anchor to trigger download intent
        const a = document.createElement("a");
        a.href = res.data.downloadUrl;
        a.download = title || "document";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setErrorMsg(res.error || "Failed to generate download link.");
      }
    } catch {
      setErrorMsg("Download failed. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [documentId, title]);

  const extLabel = getFileExtLabel(mimeType, title);

  const handleRenderError = useCallback((err: string) => {
    setErrorMsg(err);
  }, []);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Document preview: ${title}`}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl flex flex-col overflow-hidden outline-none"
        style={{ maxHeight: "calc(100vh - 3rem)" }}
      >
        {/* Sticky Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {extLabel} • {formatFileSize(sizeBytes)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
              aria-label="Download document"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>{isDownloading ? "Downloading…" : "Download"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              aria-label="Close document preview"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-slate-100/50 min-h-0">
          {/* Loading */}
          {state === "LOADING" && (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-3">
                <div className="w-10 h-10 mx-auto rounded-full bg-slate-200 flex items-center justify-center animate-pulse">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-500 font-medium">{statusText}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {state === "ERROR" && (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-4 max-w-sm px-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Preview unavailable</p>
                  <p className="text-xs text-slate-500 mt-1">{errorMsg}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Unsupported File Type */}
          {state === "UNSUPPORTED" && (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-4 max-w-sm px-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-200 flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Preview unavailable for this file type</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {extLabel} files cannot be previewed directly in the browser. Download the document to view it in a native application.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>{isDownloading ? "Downloading…" : "Download document"}</span>
                </button>
              </div>
            </div>
          )}

          {/* PDF Preview */}
          {state === "READY" && viewUrl && isPreviewablePdf(mimeType, title) && (
            <iframe
              src={`${viewUrl}#toolbar=1&navpanes=0`}
              title={`Preview: ${title}`}
              className="w-full border-0"
              style={{ minHeight: "calc(100vh - 12rem)", height: "100%" }}
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
          )}

          {/* DOCX Preview */}
          {state === "READY" && viewUrl && isPreviewableDocx(mimeType, title) && (
            <DocxViewer url={viewUrl} onError={handleRenderError} />
          )}

          {/* Text Preview */}
          {state === "READY" && viewUrl && isPreviewableText(mimeType, title) && !isPreviewableDocx(mimeType, title) && (
            <TextViewer url={viewUrl} onError={handleRenderError} />
          )}

          {/* Image Preview */}
          {state === "READY" && viewUrl && isPreviewableImage(mimeType, title) && (
            <div className="flex items-center justify-center p-6 min-h-[400px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewUrl}
                alt={title}
                className="max-w-full max-h-[calc(100vh-16rem)] object-contain rounded-lg shadow-lg"
                style={{ imageRendering: "auto" }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-400">
            Secure preview • Access expires automatically
          </p>
          {errorMsg && state !== "ERROR" && (
            <p className="text-[11px] text-rose-500 font-medium">{errorMsg}</p>
          )}
        </div>
      </div>
    </div>
  );
}

