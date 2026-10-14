"use client";

import React, { useState, useRef, useEffect, useId, useMemo, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { HELP_DICTIONARY, HelpTopicKey, HelpTopicDefinition } from "@/lib/help/dictionary";

const emptySubscribe = () => () => {};
function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export interface HelpTooltipProps {
  /** Reference an audited topic from the central domain dictionary */
  topic?: HelpTopicKey;
  /** Custom inline explanation content (overrides topic if provided) */
  content?: React.ReactNode;
  /** Optional custom title displayed in the tooltip */
  title?: string;
  /** Accessible label for screen readers (e.g. "Help: Active pipeline") */
  label?: string;
  /** Preferred placement: top | bottom | left | right (default: "top") */
  placement?: "top" | "bottom" | "left" | "right";
  /** Visual tone: "neutral" (for standard light backgrounds) or "light" (for dark hero sections) */
  tone?: "neutral" | "light";
  /** Optional size of the icon: "sm" (14px) or "md" (16px) (default: "sm") */
  size?: "sm" | "md";
  /** Optional additional class for the trigger button */
  className?: string;
  /** Optional max width for tooltip card in px (default: 300) */
  maxWidth?: number;
}

interface TooltipCoords {
  top: number;
  left: number;
  actualPlacement: "top" | "bottom" | "left" | "right";
  arrowLeft: number;
}

export function HelpTooltip({
  topic,
  content,
  title,
  label,
  placement = "top",
  tone = "neutral",
  size = "sm",
  className = "",
  maxWidth = 320,
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const mounted = useIsMounted();

  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const focusOpenedRef = useRef(false);

  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Retrieve topic definition if topic key is supplied
  const topicData: HelpTopicDefinition | null = useMemo(() => {
    if (topic && HELP_DICTIONARY[topic]) {
      return HELP_DICTIONARY[topic];
    }
    return null;
  }, [topic]);

  const displayTitle = title || topicData?.title;
  const accessibleLabel =
    label || (displayTitle ? `Help: ${displayTitle}` : "Contextual help information");

  // Calculate coordinates with auto-flip and boundary clamping
  const calculateCoords = useCallback((): TooltipCoords | null => {
    if (!triggerRef.current) return null;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : (maxWidth || 320);
    const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 140;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let targetPlacement = placement;

    // Auto-flip vertical placement if close to viewport boundaries
    if (placement === "top" && rect.top - tooltipHeight - 12 < 8) {
      targetPlacement = "bottom";
    } else if (placement === "bottom" && rect.bottom + tooltipHeight + 12 > viewportHeight - 8) {
      targetPlacement = "top";
    }

    let top = 0;
    let left = 0;

    if (targetPlacement === "top") {
      top = rect.top - tooltipHeight - 10;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (targetPlacement === "bottom") {
      top = rect.bottom + 10;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (targetPlacement === "left") {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - 10;
    } else {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + 10;
    }

    // Horizontal clamping to prevent screen edge overflow (min 12px from edge)
    const minLeft = 12;
    const maxLeft = Math.max(minLeft, viewportWidth - tooltipWidth - 12);
    const clampedLeft = Math.max(minLeft, Math.min(left, maxLeft));

    // Arrow pointer offset anchored to trigger center
    const triggerCenter = rect.left + rect.width / 2;
    const arrowLeft = Math.max(16, Math.min(triggerCenter - clampedLeft, tooltipWidth - 16));

    return {
      top: Math.max(8, top),
      left: clampedLeft,
      actualPlacement: targetPlacement,
      arrowLeft,
    };
  }, [placement, maxWidth]);

  const updatePosition = useCallback(() => {
    const nextCoords = calculateCoords();
    if (nextCoords) {
      setCoords(nextCoords);
    }
  }, [calculateCoords]);

  const openTooltip = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    const nextCoords = calculateCoords();
    if (nextCoords) {
      setCoords(nextCoords);
    }
    setIsOpen(true);
  }, [calculateCoords]);

  const closeTooltip = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    setIsOpen(false);
  }, []);

  // Keep position aligned on scroll or resize when open, and measure after DOM layout
  useEffect(() => {
    if (!isOpen) return;

    const rafId = requestAnimationFrame(() => {
      updatePosition();
    });

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScrollOrResize, { capture: true });
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Open with debounce delay
  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    openTimeoutRef.current = setTimeout(() => {
      openTooltip();
    }, 60);
  };

  // Close with grace period
  const handleMouseLeave = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      closeTooltip();
    }, 120);
  };

  // Focus & Touch handlers
  const handleFocus = () => {
    focusOpenedRef.current = true;
    openTooltip();
    setTimeout(() => {
      focusOpenedRef.current = false;
    }, 200);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // If focus moved into tooltip (for links or interactive elements), don't close
    if (tooltipRef.current && tooltipRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    closeTooltip();
  };

  const handleClick = (e: React.MouseEvent) => {
    // Touch tap or click toggles state
    e.preventDefault();
    e.stopPropagation();
    if (focusOpenedRef.current && isOpen) {
      focusOpenedRef.current = false;
      return;
    }
    if (isOpen) {
      closeTooltip();
    } else {
      openTooltip();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeTooltip();
      triggerRef.current?.focus();
    }
  };

  // Dismiss on document click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(target)
      ) {
        closeTooltip();
      }
    };

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeTooltip();
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("touchstart", handleDocumentClick, { passive: true });
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("touchstart", handleDocumentClick);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen, closeTooltip]);

  const iconDimension = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";

  const toneClass =
    tone === "light"
      ? "text-white/70 hover:text-white focus:text-white"
      : "text-slate-400 hover:text-slate-700 focus:text-slate-900";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={accessibleLabel}
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center justify-center align-middle rounded-full transition-colors cursor-pointer select-none p-0.5 ml-1 -translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${toneClass} ${className}`}
      >
        {/* Standard Lucide-style CircleHelp SVG (24x24 viewBox, strokeWidth 2) */}
        <svg
          className={iconDimension}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      </button>

      {/* Viewport-Anchored Tooltip Overlay via React Portal */}
      {mounted &&
        isOpen &&
        coords &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            aria-live="polite"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${maxWidth}px`,
              maxWidth: "calc(100vw - 24px)",
              zIndex: 99999,
            }}
            className="bg-white text-slate-900 rounded-xl p-4 shadow-[0_12px_36px_-4px_rgba(15,23,42,0.16),0_4px_12px_-2px_rgba(15,23,42,0.08)] border border-slate-200/95 text-left select-text animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Tooltip Content */}
            <div>
              {displayTitle && (
                <div className="flex items-center gap-2 pb-2 mb-2.5 border-b border-slate-100">
                  <span className="w-2 h-2 rounded-full bg-[#12A150] shrink-0" />
                  <h4 className="font-bold text-slate-900 text-[13px] leading-snug tracking-tight">
                    {displayTitle}
                  </h4>
                </div>
              )}

              {/* Body Text */}
              {content ? (
                <div className="text-slate-800 text-[13px] leading-relaxed font-normal">{content}</div>
              ) : topicData ? (
                <div className="space-y-2.5 text-[13px] leading-relaxed">
                  <p className="text-slate-800 font-normal leading-relaxed">
                    {topicData.whatItMeans}
                  </p>

                  {topicData.whyItMatters && (
                    <p className="text-slate-600 text-[12px] leading-relaxed">
                      <span className="font-semibold text-slate-800">Why it matters: </span>
                      {topicData.whyItMatters}
                    </p>
                  )}

                  {topicData.whatToDo && (
                    <div className="pt-2 border-t border-slate-100 text-[12px] text-[#0B3B2C] flex items-start gap-1.5 leading-relaxed">
                      <span className="font-bold text-[#12A150] shrink-0">Action:</span>
                      <span className="font-medium text-slate-700">{topicData.whatToDo}</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Pointer Caret / Arrow */}
            {coords.actualPlacement === "top" && (
              <div
                style={{ left: `${coords.arrowLeft}px` }}
                className="absolute -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-slate-200/95 rotate-45 pointer-events-none"
              />
            )}
            {coords.actualPlacement === "bottom" && (
              <div
                style={{ left: `${coords.arrowLeft}px` }}
                className="absolute -top-1.5 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-slate-200/95 rotate-45 pointer-events-none"
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
}
