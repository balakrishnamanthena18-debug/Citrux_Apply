"use client";

import React, { useRef } from "react";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  highlight?: boolean;
}

interface InstantTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function InstantTabs({
  tabs,
  activeTab,
  onChange,
  className = "",
  ariaLabel = "Workbench Status and Filter Tabs",
}: InstantTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== -1) {
      const targetTab = tabs[nextIndex];
      if (targetTab) {
        e.preventDefault();
        onChange(targetTab.key);
        const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
        buttons?.[nextIndex]?.focus();
      }
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.key}`}
            id={`tab-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12A150] select-none ${
              isActive
                ? "bg-[#0B3B2C] text-white shadow-sm"
                : "bg-transparent text-[#64748B] hover:bg-[#12A150]/[0.05] hover:text-[#0F1720]"
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors ${
                  isActive
                    ? "bg-[#12A150]/40 text-[#C6F432]"
                    : "bg-[#EDF1EF] text-[#64748B]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
