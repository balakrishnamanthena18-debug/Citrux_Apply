"use client";

import React, { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { usePathname } from "next/navigation";

interface NavigationPendingContextValue {
  isPending: boolean;
  pendingHref: string | null;
  beginNavigation: (href: string) => void;
  runTransition: (fn: () => void) => void;
}

const NavigationPendingContext = createContext<NavigationPendingContextValue | null>(null);

export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [pathSnapshot, setPathSnapshot] = useState(pathname);

  // Clear pending marker when the route actually changes (render-time adjust).
  if (pathname !== pathSnapshot) {
    setPathSnapshot(pathname);
    if (pendingHref) setPendingHref(null);
  }

  const beginNavigation = useCallback((href: string) => {
    setPendingHref(href);
  }, []);

  const runTransition = useCallback(
    (fn: () => void) => {
      startTransition(fn);
    },
    [startTransition]
  );

  const value = useMemo(
    () => ({
      isPending: isPending || Boolean(pendingHref && pendingHref !== pathname),
      pendingHref,
      beginNavigation,
      runTransition,
    }),
    [isPending, pendingHref, pathname, beginNavigation, runTransition]
  );

  return (
    <NavigationPendingContext.Provider value={value}>
      {children}
    </NavigationPendingContext.Provider>
  );
}

export function useNavigationPending(): NavigationPendingContextValue {
  const ctx = useContext(NavigationPendingContext);
  if (!ctx) {
    return {
      isPending: false,
      pendingHref: null,
      beginNavigation: () => {},
      runTransition: (fn) => fn(),
    };
  }
  return ctx;
}
