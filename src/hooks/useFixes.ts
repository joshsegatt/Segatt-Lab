"use client";

// One repair at a time. Module-level so an SFC or DISM run (up to half an
// hour) keeps going, and keeps its verdict, when you leave the screen.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export type FixOutcome = "clean" | "repaired" | "unrepaired" | "done";
export type FixState =
  | { status: "done"; outcome: FixOutcome; restart: boolean; details: string; at: number }
  | { status: "failed"; msg: string; at: number };

interface Store {
  running: string | null;
  /** When the running repair started, for the elapsed time. */
  startedAt: number | null;
  results: Record<string, FixState>;
}

const EMPTY: Store = { running: null, startedAt: null, results: {} };
let store: Store = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

/** Runs one repair; ignored while another is running. Resolves with its state. */
export async function runFix(id: string): Promise<FixState | null> {
  if (store.running) return null;
  set({ running: id, startedAt: Date.now() });
  let state: FixState;
  try {
    const r = await invoke<{ outcome: FixOutcome; restart: boolean; details: string }>("run_system_fix", { id });
    state = { status: "done", ...r, at: Date.now() };
  } catch (e) {
    state = { status: "failed", msg: String(e), at: Date.now() };
  }
  set({ running: null, startedAt: null, results: { ...store.results, [id]: state } });
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFixes(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
