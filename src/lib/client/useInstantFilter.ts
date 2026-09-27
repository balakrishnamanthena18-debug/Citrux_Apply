"use client";

import { useMemo, useState, useCallback } from "react";
import { syncUrlParams } from "./urlSync";

export interface FilterConfig<T> {
  searchFields?: (keyof T | ((item: T) => string | undefined | null))[];
  syncWithUrl?: boolean;
}

export type SortOrder = "asc" | "desc";

export function useInstantFilter<T>(
  items: T[],
  config: FilterConfig<T> = {}
) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const setFilter = useCallback((key: string, value: string) => {
    setFilterValues((prev) => {
      const next = { ...prev, [key]: value };
      if (!value || value === "ALL" || value === "") {
        delete next[key];
      }
      if (config.syncWithUrl) {
        syncUrlParams(next);
      }
      return next;
    });
  }, [config.syncWithUrl]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setFilterValues({});
    if (config.syncWithUrl) {
      syncUrlParams({ search: null, tab: null });
    }
  }, [config.syncWithUrl]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (config.syncWithUrl) {
      syncUrlParams({ tab: tab === "all" ? null : tab });
    }
  }, [config.syncWithUrl]);

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    if (config.syncWithUrl) {
      syncUrlParams({ search: term.trim() ? term.trim() : null });
    }
  }, [config.syncWithUrl]);

  const filteredItems = useMemo(() => {
    if (!items || !items.length) return [];

    let result = items;

    // 1. Search Filter (Case-insensitive substring)
    const query = searchTerm.trim().toLowerCase();
    if (query && config.searchFields && config.searchFields.length > 0) {
      result = result.filter((item) => {
        return config.searchFields!.some((field) => {
          let val: any;
          if (typeof field === "function") {
            val = field(item);
          } else {
            val = (item as any)[field];
          }
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(query);
        });
      });
    }

    return result;
  }, [items, searchTerm, config.searchFields]);

  return {
    searchTerm,
    setSearchTerm: handleSearchChange,
    activeTab,
    setActiveTab: handleTabChange,
    filterValues,
    setFilter,
    clearFilters,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    filteredItems,
    totalCount: items.length,
    filteredCount: filteredItems.length,
    isFiltered: Boolean(searchTerm.trim() || Object.keys(filterValues).length > 0 || activeTab !== "all"),
  };
}
