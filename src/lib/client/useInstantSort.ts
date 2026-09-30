"use client";

import { useState, useMemo, useCallback } from "react";
import { syncUrlParams, getInitialParam } from "./urlSync";

export type SortDirection = "asc" | "desc";

export interface SortFieldConfig<T> {
  key: string;
  label: string;
  accessor?: (item: T) => string | number | Date | boolean | null | undefined;
}

export interface UseInstantSortConfig<T> {
  fields: SortFieldConfig<T>[];
  defaultField?: string;
  defaultDirection?: SortDirection;
  urlFieldParamKey?: string;
  urlDirParamKey?: string;
  syncWithUrl?: boolean;
}

export function useInstantSort<T>(
  items: T[],
  config: UseInstantSortConfig<T>
) {
  const {
    fields,
    defaultField = fields[0]?.key ?? "id",
    defaultDirection = "desc",
    urlFieldParamKey = "sort",
    urlDirParamKey = "dir",
    syncWithUrl = false,
  } = config;

  const [sortField, setSortFieldState] = useState<string>(() => {
    if (syncWithUrl) {
      return getInitialParam(urlFieldParamKey, defaultField);
    }
    return defaultField;
  });

  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() => {
    if (syncWithUrl) {
      const initial = getInitialParam(urlDirParamKey, defaultDirection);
      return initial === "asc" || initial === "desc" ? initial : defaultDirection;
    }
    return defaultDirection;
  });

  const setSortField = useCallback(
    (field: string, direction?: SortDirection) => {
      setSortFieldState(field);
      const nextDir = direction ?? sortDirection;
      if (direction) {
        setSortDirectionState(direction);
      }
      if (syncWithUrl) {
        syncUrlParams({
          [urlFieldParamKey]: field === defaultField ? null : field,
          [urlDirParamKey]: nextDir === defaultDirection ? null : nextDir,
        });
      }
    },
    [defaultField, defaultDirection, sortDirection, syncWithUrl, urlFieldParamKey, urlDirParamKey]
  );

  const toggleDirection = useCallback(() => {
    const nextDir = sortDirection === "asc" ? "desc" : "asc";
    setSortDirectionState(nextDir);
    if (syncWithUrl) {
      syncUrlParams({
        [urlDirParamKey]: nextDir === defaultDirection ? null : nextDir,
      });
    }
  }, [sortDirection, defaultDirection, syncWithUrl, urlDirParamKey]);

  const sortedItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    const fieldConfig = fields.find((f) => f.key === sortField) || fields[0];
    if (!fieldConfig) return items;

    return [...items].sort((a, b) => {
      let valA: any;
      let valB: any;

      if (fieldConfig.accessor) {
        valA = fieldConfig.accessor(a);
        valB = fieldConfig.accessor(b);
      } else {
        valA = (a as any)[fieldConfig.key];
        valB = (b as any)[fieldConfig.key];
      }

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (valA instanceof Date && valB instanceof Date) {
        return sortDirection === "asc" ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: "base" });
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [items, sortField, sortDirection, fields]);

  return {
    sortField,
    sortDirection,
    setSortField,
    toggleDirection,
    sortedItems,
  };
}
