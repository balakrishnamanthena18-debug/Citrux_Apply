"use client";

import { useState, useMemo, useCallback } from "react";
import { syncUrlParams, getInitialParam } from "./urlSync";

export interface UseInstantSearchConfig<T> {
  searchFields?: (keyof T | ((item: T) => string | undefined | null | number))[];
  urlParamKey?: string;
  syncWithUrl?: boolean;
}

export function useInstantSearch<T>(
  items: T[],
  config: UseInstantSearchConfig<T> = {}
) {
  const { searchFields, urlParamKey = "search", syncWithUrl = false } = config;

  const [searchTerm, setSearchTermState] = useState<string>(() => {
    if (syncWithUrl) {
      return getInitialParam(urlParamKey, "");
    }
    return "";
  });

  const setSearchTerm = useCallback(
    (term: string) => {
      setSearchTermState(term);
      if (syncWithUrl) {
        syncUrlParams({ [urlParamKey]: term.trim() ? term.trim() : null });
      }
    },
    [syncWithUrl, urlParamKey]
  );

  const clearSearch = useCallback(() => {
    setSearchTermState("");
    if (syncWithUrl) {
      syncUrlParams({ [urlParamKey]: null });
    }
  }, [syncWithUrl, urlParamKey]);

  const searchedItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    const query = searchTerm.trim().toLowerCase();
    if (!query || !searchFields || searchFields.length === 0) {
      return items;
    }

    const tokens = query.split(/\s+/).filter(Boolean);

    return items.filter((item) => {
      // Must match all tokens
      return tokens.every((token) => {
        return searchFields.some((field) => {
          let val: any;
          if (typeof field === "function") {
            val = field(item);
          } else {
            val = (item as any)[field];
          }
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(token);
        });
      });
    });
  }, [items, searchTerm, searchFields]);

  return {
    searchTerm,
    setSearchTerm,
    clearSearch,
    searchedItems,
    isSearching: Boolean(searchTerm.trim()),
    totalCount: items.length,
    matchedCount: searchedItems.length,
  };
}
