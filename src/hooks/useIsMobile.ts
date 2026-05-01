"use client";

import { useSyncExternalStore } from "react";

// Hydration-safe match-media subscription. Server snapshot is always false
// (no window), so SSR HTML matches the hydration client snapshot. After
// hydrate, the real value flows in via the subscribe callback.
function subscribe(query: string) {
  return (onStoreChange: () => void): (() => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onStoreChange);
    return () => mq.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  return useSyncExternalStore(
    subscribe(query),
    () => getSnapshot(query),
    getServerSnapshot,
  );
}
