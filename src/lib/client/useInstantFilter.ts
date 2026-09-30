"use client";

import { useMemo, useState, useCallback } from "react";
import { syncUrlParams, getInitialParam } from "./urlSync";

export type SortOrder = "asc" | "desc";

export interface FilterConfig<T> {
  searchFields?: (keyof T | ((item: T) => string | undefined | null | number))[];
  tabField?: keyof T | ((item: T) => string | undefined | null);
  defaultTab?: string;
  urlTabParamKey?: string;
  urlSearchParamKey?: string;
  syncWithUrl?: boolean;
  pageSize?: number;
}

export function useInstantFilter<T>(
  items: T[],
  config: FilterConfig<T> = {}
) {
  const {
    searchFields,
    tabField,
    defaultTab = "ALL",
    urlTabParamKey = "tab",
    urlSearchParamKey = "search",
    syncWithUrl = false,
    pageSize = 25,
  } = config;

  const [searchTerm, setSearchTermState] = useState<string>(() => {
    if (syncWithUrl) {
      return getInitialParam(urlSearchParamKey, "");
    }
    return "";
  });

  const [activeTab, setActiveTabState] = useState<string>(() => {
    if (syncWithUrl) {
      return getInitialParam(urlTabParamKey, defaultTab);
    }
    return defaultTab;
  });

  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);

  const setFilter = useCallback(
    (key: string, value: string) => {
      setFilterValues((prev) => {
        const next = { ...prev, [key]: value };
        if (!value || value === "ALL" || value === "") {
          delete next[key];
        }
        if (syncWithUrl) {
          syncUrlParams(next);
        }
        return next;
      });
      setCurrentPage(1);
    },
    [syncWithUrl]
  );

  const clearFilters = useCallback(() => {
    setSearchTermState("");
    setActiveTabState(defaultTab);
    setFilterValues({});
    setCurrentPage(1);
    if (syncWithUrl) {
      syncUrlParams({
        [urlSearchParamKey]: null,
        [urlTabParamKey]: null,
        ...Object.keys(filterValues).reduce((acc, k) => ({ ...acc, [k]: null }), {}),
      });
    }
  }, [defaultTab, filterValues, syncWithUrl, urlSearchParamKey, urlTabParamKey]);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTabState(tab);
      setCurrentPage(1);
      if (syncWithUrl) {
        syncUrlParams({ [urlTabParamKey]: tab === defaultTab ? null : tab });
      }
    },
    [defaultTab, syncWithUrl, urlTabParamKey]
  );

  const handleSearchChange = useCallback(
    (term: string) => {
      setSearchTermState(term);
      setCurrentPage(1);
      if (syncWithUrl) {
        syncUrlParams({ [urlSearchParamKey]: term.trim() ? term.trim() : null });
      }
    },
    [syncWithUrl, urlSearchParamKey]
  );

  const filteredItems = useMemo(() => {
    if (!items || !items.length) return [];

    let result = items;

    // 1. Tab Filter
    if (tabField && activeTab && activeTab !== "ALL" && activeTab !== "all") {
      result = result.filter((item) => {
        const val = typeof tabField === "function" ? tabField(item) : (item as any)[tabField];
        if (val === null || val === undefined) return false;
        return String(val).toUpperCase() === activeTab.toUpperCase();
      });
    }

    // 2. Custom Dropdown Filters
    const activeFilterKeys = Object.keys(filterValues);
    if (activeFilterKeys.length > 0) {
      result = result.filter((item) => {
        return activeFilterKeys.every((key) => {
          const filterVal = filterValues[key];
          if (!filterVal || filterVal === "ALL" || filterVal === "") return true;
          const itemVal = (item as any)[key];
          if (itemVal === null || itemVal === undefined) return false;
          return String(itemVal).toUpperCase() === filterVal.toUpperCase();
        });
      });
    }

    // 3. Search Filter (Multi-token match)
    const query = searchTerm.trim().toLowerCase();
    if (query && searchFields && searchFields.length > 0) {
      const tokens = query.split(/\s+/).filter(Boolean);
      result = result.filter((item) => {
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
    }

    // 4. Sort
    if (sortField) {
      result = [...result].sort((a, b) => {
        const valA = (a as any)[sortField];
        const valB = (b as any)[sortField];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [items, activeTab, tabField, filterValues, searchTerm, searchFields, sortField, sortOrder]);

  // Pagination calculation
  const totalCount = items ? items.length : 0;
  const filteredCount = filteredItems.length;
  const totalPages = Math.ceil(filteredCount / pageSize);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

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
    paginatedItems,
    currentPage,
    setCurrentPage,
    totalPages,
    pageSize,
    totalCount,
    filteredCount,
    isFiltered: Boolean(
      searchTerm.trim() ||
        Object.keys(filterValues).length > 0 ||
        (activeTab !== defaultTab && activeTab !== "ALL" && activeTab !== "all")
    ),
  };
}
