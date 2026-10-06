"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
} from "react";
import { createPortal } from "react-dom";
import styles from "./DestructiveAction.module.css";

export type DestructiveActionState =
  | "idle"
  | "confirming"
  | "processing"
  | "success"
  | "error";

export interface DestructiveActionProps {
  /** Label for the trigger button (default: "Delete") */
  actionLabel?: string;
  /** Generic entity type name (e.g. "document", "record", "project") */
  entityName?: string;
  /** Specific title/name of the instance (e.g. "sadabainama ror (1)") */
  entityTitle?: string;
  /** Optional ID of the entity */
  entityId?: string;
  /** Custom confirmation title override */
  confirmTitle?: string;
  /** Custom confirmation warning description */
  confirmDescription?: string;
  /** Confirm button text (default: "Delete") */
  confirmLabel?: string;
  /** Cancel button text (default: "Cancel") */
  cancelLabel?: string;
  /** Processing title / status text (default: "Deleting…") */
  processingLabel?: string;
  /** Success confirmation text (default: "Deleted") */
  successLabel?: string;
  /** Error status text (default: "Delete failed") */
  errorLabel?: string;
  /** Whether the action trigger is disabled */
  disabled?: boolean;
  /** Visual variant for the trigger button */
  variant?: "subtle" | "outline" | "solid" | "ghost";
  /** Size for the trigger button */
  size?: "sm" | "md" | "lg";
  /** Confirmation UI mode: "modal" (centered dialog) or "popover" (inline anchor) */
  mode?: "modal" | "popover";
  /** Async execution handler. Must resolve on success, throw/reject on failure. */
  onConfirm: () => Promise<void> | void;
  /** Callback invoked after success state transition */
  onSuccess?: () => void;
  /** Callback invoked on execution error */
  onError?: (error: unknown) => void;
  /** Callback invoked when confirmation is cancelled */
  onCancel?: () => void;
  /** Custom CSS class for the wrapper/trigger */
  className?: string;
}

const emptySubscribe = () => () => {};

export function DestructiveAction({
  actionLabel = "Delete",
  entityName = "document",
  entityTitle,
  entityId,
  confirmTitle,
  confirmDescription,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  processingLabel,
  successLabel,
  errorLabel = "Delete failed",
  disabled = false,
  variant = "ghost",
  size = "sm",
  mode = "modal",
  onConfirm,
  onSuccess,
  onError,
  onCancel,
  className = "",
}: DestructiveActionProps) {
  const [state, setState] = useState<DestructiveActionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const errorCloseButtonRef = useRef<HTMLButtonElement>(null);

  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descId = `${dialogId}-desc`;

  const capitalizedEntity =
    entityName.charAt(0).toUpperCase() + entityName.slice(1);

  const resolvedConfirmTitle =
    confirmTitle || `Delete this ${entityName}?`;
  const resolvedConfirmDesc =
    confirmDescription ||
    `This ${entityName} will be permanently removed from your document vault. This action cannot be undone.`;
  const resolvedProcessingLabel =
    processingLabel || `Deleting ${entityName}…`;
  const resolvedSuccessLabel =
    successLabel || `${capitalizedEntity} deleted`;

  // Handle outside click & Escape key dismissal
  useEffect(() => {
    if (state !== "confirming" && state !== "error") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (state === "confirming") {
          setState("idle");
          onCancel?.();
        } else if (state === "error") {
          setState("idle");
        }
        triggerButtonRef.current?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (mode === "popover" && wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        if (state === "confirming") {
          setState("idle");
          onCancel?.();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleClickOutside, true);

    // Auto-focus appropriate action button on entry
    if (state === "confirming") {
      cancelButtonRef.current?.focus();
    } else if (state === "error") {
      errorCloseButtonRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [state, mode, onCancel]);

  const handleOpen = useCallback(() => {
    if (disabled || state === "processing") return;
    setErrorMessage(null);
    setState("confirming");
  }, [disabled, state]);

  const handleCancel = useCallback(() => {
    setState("idle");
    onCancel?.();
    triggerButtonRef.current?.focus();
  }, [onCancel]);

  const handleExecute = useCallback(async () => {
    if (state === "processing") return;

    setState("processing");
    setErrorMessage(null);

    const startTime = Date.now();
    const MIN_FEEDBACK_MS = 1100; // Synchronized with OOS deletion animation cycle (~1.1s)

    try {
      await onConfirm();

      // Ensure minimal processing feedback duration so animation completes cleanly
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_FEEDBACK_MS) {
        await new Promise((r) => setTimeout(r, MIN_FEEDBACK_MS - elapsed));
      }

      setState("success");

      // Hold success checkmark briefly (~400ms) for verified confirmation
      setTimeout(() => {
        setState("idle");
        onSuccess?.();
      }, 400);
    } catch (err: unknown) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_FEEDBACK_MS) {
        await new Promise((r) => setTimeout(r, MIN_FEEDBACK_MS - elapsed));
      }

      setState("error");
      const msg =
        err instanceof Error ? err.message : "The operation encountered an unexpected error.";
      setErrorMessage(msg);
      onError?.(err);
    }
  }, [state, onConfirm, onSuccess, onError]);

  const handleCloseError = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
    triggerButtonRef.current?.focus();
  }, []);

  // Trigger button styling
  const variantClass =
    variant === "solid"
      ? styles.variantSolid
      : variant === "outline"
      ? styles.variantOutline
      : variant === "subtle"
      ? styles.variantSubtle
      : styles.variantGhost;

  const sizeClass =
    size === "sm"
      ? styles.sizeSm
      : size === "lg"
      ? styles.sizeLg
      : styles.sizeMd;

  const isDialogOpen = state !== "idle";

  const dialogContent = (
    <div
      className={mode === "modal" ? styles.modalBackdrop : styles.confirmPopover}
      onClick={(e) => {
        if (e.target === e.currentTarget && state !== "processing") {
          handleCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-busy={state === "processing"}
        className={mode === "modal" ? styles.modalDialog : styles.confirmPopover}
      >
        {/* Visual Stage Icon */}
        <div
          className={`${styles.visualStage} ${
            state === "success"
              ? styles.visualStageSuccess
              : state === "error"
              ? styles.visualStageError
              : styles.visualStageDanger
          }`}
        >
          {state === "success" ? (
            /* Success Checkmark */
            <svg
              className={styles.checkmarkStage}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : state === "error" ? (
            /* Error Alert Icon */
            <svg
              className={styles.errorStage}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            /* Animated Trash Can Stage */
            <div className={state === "processing" ? styles.isProcessing : ""}>
              <svg
                className={styles.trashStageSvg}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                {/* Animated Lid */}
                <g className={styles.trashStageLid}>
                  <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round" />
                  <path
                    d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6"
                    strokeLinecap="round"
                  />
                </g>
                {/* Trash Bin */}
                <path
                  d="M5.5 6L6.8 19.4C6.89 20.3 7.64 21 8.55 21H15.45C16.36 21 17.11 20.3 17.2 19.4L18.5 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line x1="10" y1="10" x2="10" y2="16" strokeLinecap="round" strokeWidth="1.5" />
                <line x1="14" y1="10" x2="14" y2="16" strokeLinecap="round" strokeWidth="1.5" />
              </svg>
              {/* Dropping Document Slip */}
              <span className={styles.modalRecordSlip} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Title */}
        <h3 id={titleId} className={styles.modalTitle}>
          {state === "processing"
            ? resolvedProcessingLabel
            : state === "success"
            ? resolvedSuccessLabel
            : state === "error"
            ? errorLabel
            : resolvedConfirmTitle}
        </h3>

        {/* Entity Title Highlight (Pill) */}
        {entityTitle && state !== "success" && (
          <div className={styles.entityHighlight} title={entityTitle}>
            &ldquo;{entityTitle}&rdquo;
          </div>
        )}

        {/* Description */}
        {state === "error" ? (
          <p id={descId} className={styles.modalDescription}>
            {errorMessage || "The document could not be removed. Please try again."}
          </p>
        ) : state === "processing" ? (
          <div className={styles.processingBlock}>
            <div className={styles.modalProgressTrack} aria-hidden="true">
              <div className={styles.modalProgressBar} />
            </div>
          </div>
        ) : state === "success" ? (
          <p id={descId} className={styles.modalDescription}>
            The record was verified and removed from storage.
          </p>
        ) : (
          <p id={descId} className={styles.modalDescription}>
            {resolvedConfirmDesc}
          </p>
        )}

        {/* Confirmation Action Row */}
        {state === "confirming" && (
          <div className={styles.actionRow}>
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={handleCancel}
              className={styles.cancelBtn}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleExecute}
              className={styles.confirmBtn}
            >
              {confirmLabel}
            </button>
          </div>
        )}

        {/* Error Action Row */}
        {state === "error" && (
          <div className={styles.actionRow}>
            <button
              ref={errorCloseButtonRef}
              type="button"
              onClick={handleCloseError}
              className={styles.cancelBtn}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleExecute}
              className={styles.confirmBtn}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapperRef} className={`${styles.wrapper} ${className}`}>
      {/* Trigger Button */}
      <button
        ref={triggerButtonRef}
        type="button"
        disabled={disabled || state === "processing"}
        aria-busy={state === "processing"}
        aria-haspopup="dialog"
        aria-expanded={isDialogOpen}
        aria-label={
          entityTitle
            ? `${actionLabel} ${entityTitle}`
            : `${actionLabel} ${entityName}`
        }
        data-state={state}
        data-entity-id={entityId}
        onClick={handleOpen}
        className={`${styles.button} ${variantClass} ${sizeClass}`}
      >
        <svg
          className={styles.triggerIcon}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        <span>{actionLabel}</span>
      </button>

      {/* Confirmation Dialog / Modal (rendered in body via portal to prevent container clipping) */}
      {isDialogOpen && (
        mode === "modal" && isMounted
          ? createPortal(dialogContent, document.body)
          : dialogContent
      )}

      {/* Screen Reader Live Status Announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {state === "processing"
          ? `${resolvedProcessingLabel} ${entityTitle || ""}`
          : state === "success"
          ? `${resolvedSuccessLabel} ${entityTitle || ""}`
          : state === "error"
          ? `${errorLabel}: ${errorMessage || ""}`
          : ""}
      </div>
    </div>
  );
}
