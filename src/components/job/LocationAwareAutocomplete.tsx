"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
} from "react";
import {
  Briefcase,
  Sparkles,
  Building,
  MapPin,
  X,
  Loader2,
  Check,
} from "lucide-react";
import type { AutocompleteSuggestion, AutocompleteCategory } from "@/lib/job-discovery/autocomplete";

interface LocationAwareAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  placeholder?: string;
  type?: "all" | "main" | "state" | "city";
  country?: string;
  state?: string;
  limit?: number;
  className?: string;
  inputClassName?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export function LocationAwareAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmit,
  onClear,
  placeholder,
  type = "main",
  country,
  state,
  limit = 8,
  className = "",
  inputClassName = "",
  icon,
  disabled = false,
  autoFocus = false,
  id,
}: LocationAwareAutocompleteProps) {
  const generatedId = useId();
  const inputId = id || `autocomplete-${generatedId}`;
  const listboxId = `listbox-${generatedId}`;

  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  // Fetch suggestions with debouncing and abort cancellation
  const fetchSuggestions = useCallback(
    async (searchQuery: string) => {
      // Abort previous in-flight fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      const currentRequestId = ++requestIdRef.current;

      setIsLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("q", searchQuery);
        params.set("type", type);
        if (country && country !== "ALL") params.set("country", country);
        if (state) params.set("state", state);
        params.set("limit", String(limit));

        const res = await fetch(`/api/jobs/autocomplete?${params.toString()}`, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        // Only update if this request is still the latest one
        if (currentRequestId === requestIdRef.current) {
          const list = Array.isArray(data.suggestions) ? data.suggestions : [];
          setSuggestions(list);
          setHighlightedIndex(-1);
          setIsOpen(list.length > 0);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          // Non-abort error: clear suggestions
          if (currentRequestId === requestIdRef.current) {
            setSuggestions([]);
          }
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [type, country, state, limit]
  );

  // 300ms Debounce trigger on input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  // Re-fetch when context (country, state) changes and input is focused
  useEffect(() => {
    if (document.activeElement === inputRef.current && (value || type === "state" || type === "city")) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, 300);
    }
  }, [country, state, fetchSuggestions, value, type]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Close when clicking or touching outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [highlightedIndex]);

  // Select an item
  const handleSelect = (suggestion: AutocompleteSuggestion) => {
    onChange(suggestion.text);
    if (onSelect) {
      onSelect(suggestion);
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Keyboard navigation & actions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        if (suggestions.length > 0) {
          setIsOpen(true);
        } else {
          fetchSuggestions(value);
        }
        return;
      }
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) return;
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      } else {
        setIsOpen(false);
        if (onSubmit) {
          onSubmit();
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  // Clear text
  const handleClear = () => {
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    if (onClear) {
      onClear();
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Focus event
  const handleFocus = () => {
    // For state/city or existing value, trigger immediate query
    if (value || type === "state" || type === "city") {
      fetchSuggestions(value);
    }
  };

  // Category Icon & Badge Styling
  const getCategoryMeta = (category: AutocompleteCategory) => {
    switch (category) {
      case "title":
        return {
          icon: <Briefcase className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
          badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "skill":
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />,
          badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
        };
      case "employer":
        return {
          icon: <Building className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
          badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
        };
      case "location":
      case "state":
      case "city":
      default:
        return {
          icon: <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
          badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center w-full">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            {icon}
          </div>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0 ? `option-${generatedId}-${highlightedIndex}` : undefined
          }
          className={
            inputClassName ||
            `w-full ${
              icon ? "pl-10" : "px-3"
            } pr-8 py-2 bg-slate-50 border border-[#DDE5E0] rounded-[10px] text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#12A150]/30 transition`
          }
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          )}

          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full transition"
              title="Clear text"
              tabIndex={-1}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Suggestion Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 mt-1.5 py-1.5 bg-white border border-[#DDE5E0] rounded-[14px] shadow-lg max-h-72 overflow-y-auto z-50 divide-y divide-slate-50 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          {suggestions.map((suggestion, index) => {
            const isHighlighted = index === highlightedIndex;
            const meta = getCategoryMeta(suggestion.category);

            return (
              <li
                key={suggestion.id}
                id={`option-${generatedId}-${index}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before selection
                  handleSelect(suggestion);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleSelect(suggestion);
                }}
                className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-3 text-xs transition ${
                  isHighlighted
                    ? "bg-[#12A150]/10 text-[#0B3B2C] font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="shrink-0 p-1 rounded-md bg-white border border-slate-100 shadow-2xs">
                    {meta.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium leading-tight">
                      {suggestion.text}
                    </div>
                    {suggestion.subtext && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">
                        {suggestion.subtext}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${meta.badgeClass}`}
                  >
                    {suggestion.badgeLabel}
                  </span>
                  {isHighlighted && (
                    <Check className="w-3.5 h-3.5 text-[#12A150]" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
