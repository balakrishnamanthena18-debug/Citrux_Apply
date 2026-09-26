"use client";

import { useState } from "react";
import {
  generateSubmissionEvidenceUploadUrlAction,
  getSubmissionEvidenceDownloadUrlAction,
} from "@/lib/submission/actions";

interface EvidenceUploaderProps {
  applicationId: string;
  onUploadSuccess: (storagePath: string, filename: string) => void;
}

export function EvidenceUploader({ applicationId, onUploadSuccess }: EvidenceUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate mime type
    const validMimes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!validMimes.includes(file.type)) {
      setError("Invalid file type. Only PNG, JPEG, WEBP, and PDF files are allowed.");
      return;
    }

    // Validate size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10 MB limit.");
      return;
    }

    try {
      setUploading(true);
      const res = await generateSubmissionEvidenceUploadUrlAction({
        applicationId,
        filename: file.name,
        mimeType: file.type as any,
        fileSizeBytes: file.size,
      });

      if (!res.success || !res.uploadUrl) {
        throw new Error("Failed to generate upload URL");
      }

      const uploadRes = await fetch(res.uploadUrl.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status: ${uploadRes.status}`);
      }

      setUploadedFile(file.name);
      onUploadSuccess(res.storagePath, file.name);
    } catch (err: any) {
      setError(err.message || "Failed to upload confirmation evidence file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5 text-xs">
      <label className="block font-medium text-slate-700">
        Confirmation Screenshot / PDF (Optional, max 10MB)
      </label>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={handleFileChange}
        disabled={uploading}
        className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
      />
      {uploading && <p className="text-[11px] text-blue-600 font-medium">Uploading evidence file securely...</p>}
      {uploadedFile && (
        <p className="text-[11px] text-emerald-600 font-medium">
          ✓ Attached: {uploadedFile}
        </p>
      )}
      {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}
    </div>
  );
}

interface EvidenceDownloadButtonProps {
  submissionId: string;
}

export function EvidenceDownloadButton({ submissionId }: EvidenceDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSubmissionEvidenceDownloadUrlAction({ submissionId });
      if (res.success && res.downloadUrl) {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("Could not retrieve download URL");
      }
    } catch (err: any) {
      setError(err.message || "Failed to download evidence");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline"
      >
        {loading ? "Generating link..." : "📎 Download Confirmation Evidence File"}
      </button>
      {error && <span className="text-[10px] text-rose-500 ml-2">{error}</span>}
    </div>
  );
}
