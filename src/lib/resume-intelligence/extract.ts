import mammoth from "mammoth";
import {
  RESUME_EXTRACT_MAX_BYTES,
  RESUME_PARSER_VERSION,
  truncateExtractedText,
} from "./constants";

export type ExtractAttemptResult = {
  parseStatus: "SUCCESS" | "EMPTY" | "FAILED" | "UNSUPPORTED";
  text: string;
  pageCount: number | null;
  charCount: number;
  errorCode: string | null;
  parserVersion: string;
};

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPdf(mimeType: string, buffer: Buffer): boolean {
  if (mimeType.includes("pdf")) return true;
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function isDocx(mimeType: string, buffer: Buffer): boolean {
  if (
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("officedocument.wordprocessingml") ||
    mimeType.includes("msword") ||
    mimeType.includes("docx")
  ) {
    return true;
  }
  // ZIP/DOCX magic
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Deterministic server-side PDF/DOCX text extraction.
 * No OCR. Does not invent content on failure.
 */
export async function extractResumeTextFromBuffer(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<ExtractAttemptResult> {
  const { buffer, mimeType } = input;

  if (!buffer.length) {
    return {
      parseStatus: "EMPTY",
      text: "",
      pageCount: null,
      charCount: 0,
      errorCode: "EMPTY_DOCUMENT",
      parserVersion: RESUME_PARSER_VERSION,
    };
  }

  if (buffer.length > RESUME_EXTRACT_MAX_BYTES) {
    return {
      parseStatus: "FAILED",
      text: "",
      pageCount: null,
      charCount: 0,
      errorCode: "DOCUMENT_TOO_LARGE",
      parserVersion: RESUME_PARSER_VERSION,
    };
  }

  try {
    if (isPdf(mimeType, buffer)) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const normalized = normalizeWhitespace(result.text || "");
        if (!normalized) {
          return {
            parseStatus: "EMPTY",
            text: "",
            pageCount: result.total ?? null,
            charCount: 0,
            errorCode: "NO_READABLE_TEXT",
            parserVersion: RESUME_PARSER_VERSION,
          };
        }
        const truncated = truncateExtractedText(normalized);
        return {
          parseStatus: "SUCCESS",
          text: truncated.text,
          pageCount: result.total ?? null,
          charCount: truncated.charCount,
          errorCode: truncated.truncated ? "TEXT_TRUNCATED" : null,
          parserVersion: RESUME_PARSER_VERSION,
        };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }

    if (isDocx(mimeType, buffer)) {
      const result = await mammoth.extractRawText({ buffer });
      const normalized = normalizeWhitespace(result.value || "");
      if (!normalized) {
        return {
          parseStatus: "EMPTY",
          text: "",
          pageCount: null,
          charCount: 0,
          errorCode: "NO_READABLE_TEXT",
          parserVersion: RESUME_PARSER_VERSION,
        };
      }
      const truncated = truncateExtractedText(normalized);
      return {
        parseStatus: "SUCCESS",
        text: truncated.text,
        pageCount: null,
        charCount: truncated.charCount,
        errorCode: truncated.truncated ? "TEXT_TRUNCATED" : null,
        parserVersion: RESUME_PARSER_VERSION,
      };
    }

    return {
      parseStatus: "UNSUPPORTED",
      text: "",
      pageCount: null,
      charCount: 0,
      errorCode: "UNSUPPORTED_MIME",
      parserVersion: RESUME_PARSER_VERSION,
    };
  } catch {
    return {
      parseStatus: "FAILED",
      text: "",
      pageCount: null,
      charCount: 0,
      errorCode: "EXTRACT_FAILED",
      parserVersion: RESUME_PARSER_VERSION,
    };
  }
}
