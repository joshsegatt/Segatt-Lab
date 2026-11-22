"use client";

// What opens with Windows, and the on/off switch of each item.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface StartupItem {
  id: string;
  name: string;
  command: string;
  scope: "user" | "machine";
  enabled: boolean;
  publisher: string | null;
}

interface Store {
  items: StartupItem[] | null;
  reading: boolean;
  readError: string | null;
  /** The item being switched now. */
  busy: string | null;
  errors: Record<string, { msg: string; at: number }>;
}

const EMPTY: Store = { items: null, reading: false, readError: null, busy: null, errors: {} };
let store: Store = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

export function readStartup(): void {
  if (store.reading || store.busy) return;
  set({ reading: true, readError: null });
  invoke<StartupItem[]>("list_startup")
    .then((items) => set({ items, reading: false }))
    .catch((e) => set({ reading: false, readError: String(e) }));
}

export async function switchStartup(id: string, enabled: boolean): Promise<boolean> {
  if (store.busy) return false;
  const errors = { ...store.errors };
  delete errors[id];
  set({ busy: id, errors });
  try {
    const now = await invoke<boolean>("set_startup", { id, enabled });
    set({ items: store.items?.map((i) => (i.id === id ? { ...i, enabled: now } : i)) ?? null });
    return true;
  } catch (e) {
    set({ errors: { ...store.errors, [id]: { msg: String(e), at: Date.now() } } });
    return false;
  } finally {
    set({ busy: null });
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.items && !store.reading && !store.readError) readStartup();
  return () => {
    listeners.delete(listener);
  };
}

export function useStartup(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
