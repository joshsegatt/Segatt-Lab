"use client";

// Cleaner sizes and runs. Module-level so a cleanup that takes a while keeps
// going, and keeps its result, when you leave the screen.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface CleanupResult { taskId: string; freed: number | null }
export type RunState = { status: "done"; freed: number | null } | { status: "failed"; msg: string; at: number };

interface Store {
  /** Bytes each cleanup would free; null for tasks that free no files. Absent until measured. */
  sizes: Record<string, number | null> | null;
  scanning: boolean;
  scanError: string | null;
  /** The cleanup running now, and how far the batch is. */
  running: string | null;
  progress: { i: number; n: number } | null;
  /** True while the restore point is being made. */
  restoring: boolean;
  results: Record<string, RunState>;
}

const EMPTY: Store = { sizes: null, scanning: false, scanError: null, running: null, progress: null, restoring: false, results: {} };
let store: Store = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

/** `fresh`: the person asked to measure again, so old "Liberou" results go. */
export function scanCleanup(fresh = false): void {
  if (store.scanning || store.running) return;
  set({ scanning: true, scanError: null, ...(fresh ? { results: {} } : {}) });
  invoke<{ id: string; bytes: number | null }[]>("scan_cleanup")
    .then((list) => set({ sizes: Object.fromEntries(list.map((s) => [s.id, s.bytes])), scanning: false }))
    .catch((e) => set({ scanning: false, scanError: String(e) }));
}

/**
 * Runs the picked cleanups one by one, after a restore point when asked.
 * Returns what was freed in total, or an error when the restore point failed
 * (then nothing ran).
 */
export async function runCleanups(ids: string[], restorePoint: boolean): Promise<{ freed: number; failed: number } | { error: string }> {
  if (store.running || !ids.length) return { freed: 0, failed: 0 };
  if (restorePoint) {
    set({ restoring: true });
    try {
      await invoke("create_restore_point");
    } catch (e) {
      set({ restoring: false });
      return { error: String(e) };
    }
    set({ restoring: false });
  }
  let freed = 0;
  let failed = 0;
  const results = { ...store.results };
  for (const id of ids) delete results[id];
  set({ results });
  for (const [i, id] of ids.entries()) {
    set({ running: id, progress: { i: i + 1, n: ids.length } });
    try {
      const r = await invoke<CleanupResult>("run_cleanup", { id });
      freed += r.freed ?? 0;
      set({ results: { ...store.results, [id]: { status: "done", freed: r.freed } } });
    } catch (e) {
      failed++;
      set({ results: { ...store.results, [id]: { status: "failed", msg: String(e), at: Date.now() } } });
    }
  }
  set({ running: null, progress: null });
  // Sizes changed: read them again so the list shows what is left.
  scanCleanup();
  return { freed, failed };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.sizes && !store.scanning && !store.scanError) scanCleanup();
  return () => {
    listeners.delete(listener);
  };
}

export function useCleanup(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
