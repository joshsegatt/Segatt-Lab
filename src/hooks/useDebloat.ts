"use client";

// Which Debloat apps are installed, and the removal run. Module-level so a run
// keeps going, and keeps its results, when you leave the screen.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface BloatState { id: string; installed: boolean }
export type RemoveResult = { status: "done" } | { status: "failed"; msg: string; at: number };

interface Store {
  /** Installed per id; null until the first read. */
  installed: Record<string, boolean> | null;
  reading: boolean;
  readError: string | null;
  running: string | null;
  progress: { i: number; n: number } | null;
  results: Record<string, RemoveResult>;
}

const EMPTY: Store = { installed: null, reading: false, readError: null, running: null, progress: null, results: {} };
let store: Store = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

const toMap = (list: BloatState[]) => Object.fromEntries(list.map((s) => [s.id, s.installed]));

/** `fresh`: the person asked to read again, so old results go. */
export function readBloat(fresh = false): void {
  if (store.reading || store.running) return;
  set({ reading: true, readError: null, ...(fresh ? { results: {} } : {}) });
  invoke<BloatState[]>("list_bloat")
    .then((list) => set({ installed: toMap(list), reading: false }))
    .catch((e) => set({ reading: false, readError: String(e) }));
}

/** Removes the apps one by one. Returns how many failed. */
export async function removeBloat(ids: string[]): Promise<{ ok: number; failed: number }> {
  if (store.running || !ids.length) return { ok: 0, failed: 0 };
  let failed = 0;
  for (const [i, id] of ids.entries()) {
    set({ running: id, progress: { i: i + 1, n: ids.length } });
    try {
      const list = await invoke<BloatState[]>("remove_bloat", { id });
      set({ installed: toMap(list), results: { ...store.results, [id]: { status: "done" } } });
    } catch (e) {
      failed++;
      set({ results: { ...store.results, [id]: { status: "failed", msg: String(e), at: Date.now() } } });
    }
  }
  set({ running: null, progress: null });
  return { ok: ids.length - failed, failed };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.installed && !store.reading && !store.readError) readBloat();
  return () => {
    listeners.delete(listener);
  };
}

export function useDebloat(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
