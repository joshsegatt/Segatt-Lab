"use client";

import { useSyncExternalStore } from "react";

// Reads a URL query parameter on the client. The app is a static export, so the
// server snapshot is always null; useSearchParams would need a Suspense boundary.
// The value is read on every render and on back/forward; it is meant for the
// arrival from the Home search, where the target screen mounts fresh.
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
