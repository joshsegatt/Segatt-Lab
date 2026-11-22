"use client";

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface InstalledApp {
  name: string;
  id: string;
  version: string;
  available: string | null;
}

interface Store {
  /** Keyed by lower-case winget id; null until the first read finishes. */
  installed: Record<string, InstalledApp> | null;
  loading: boolean;
  error: string | null;
}

// One store for every screen: Apps, Home, the search and the sidebar all read
// the same `winget list`, and a finished install refreshes all of them.
let store: Store = { installed: null, loading: false, error: null };
const listeners = new Set<() => void>();
const SERVER: Store = { installed: null, loading: false, error: null };

function emit(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

// A refresh asked for while a read is running (say, right after an install)
// runs once that read ends, since the running read may predate the change.
let again = false;

export function refreshApps(): Promise<void> {
  if (store.loading) {
    again = true;
    return Promise.resolve();
  }
  emit({ loading: true });
  return invoke<InstalledApp[]>("list_installed")
    .then((list) => emit({ installed: Object.fromEntries(list.map((a) => [a.id.toLowerCase(), a])), loading: false, error: null }))
    .catch((e) => emit({ loading: false, error: String(e) }))
    .then(() => {
      if (!again) return;
      again = false;
      return refreshApps();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.installed && !store.loading) void refreshApps();
  return () => {
    listeners.delete(listener);
  };
}

export function useApps(): Store {
  return useSyncExternalStore(subscribe, () => store, () => SERVER);
}

export function findInstalled(installed: Record<string, InstalledApp> | null, id: string): InstalledApp | undefined {
  return installed?.[id.toLowerCase()];
}

export function countUpdates(installed: Record<string, InstalledApp> | null): number {
  return installed ? Object.values(installed).filter((a) => a.available).length : 0;
}
