"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server-rendered HTML and until React has hydrated, true afterwards. Controls that need JavaScript
 * (star ratings, Borrow) are disabled until then, because a tap before hydration is silently lost.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
