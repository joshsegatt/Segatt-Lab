"use client";

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export type TweakStatus = "active" | "inactive" | "unknown";

export interface TweakChange {
  target: string;
  current: string;
  wanted: string;
}

export interface TweakState {
  id: string;
  status: TweakStatus;
  /** What the tweak reaches: this user only, the whole PC, or Windows boot. */
  scope: "user" | "machine" | "boot";
  reason: string | null;
  changes: TweakChange[];
  restart: boolean;
}

interface Store {
  /** null until the first read finishes (or when the backend is unavailable). */
  states: Record<string, TweakState> | null;
  loading: boolean;
  error: string | null;
}

// One store for every screen: Tweaks, Home, the search and the sidebar read the
// same real state, and an apply on one screen updates all of them.
let store: Store = { states: null, loading: false, error: null };
const listeners = new Set<() => void>();
const SERVER: Store = { states: null, loading: false, error: null };

function emit(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

export function refreshTweakStates(): Promise<void> {
  if (store.loading) return Promise.resolve();
  emit({ loading: true });
  return invoke<TweakState[]>("get_tweak_states")
    .then((list) => emit({ states: Object.fromEntries(list.map((s) => [s.id, s])), loading: false, error: null }))
    .catch((e) => emit({ loading: false, error: String(e) }));
}

/** Stores the state the backend verified after a change. */
export function updateTweakState(state: TweakState) {
  emit({ states: { ...(store.states ?? {}), [state.id]: state } });
}

/** Known engine errors in the user's language; anything else is shown as is. */
export function explainTweakError(msg: string, t: (path: string) => string): string {
  if (/access denied|acesso negado|administrator/i.test(msg)) return t("tw.err_access");
  if (/did not keep/i.test(msg)) return t("tw.err_not_kept");
  if (/may be left changed/i.test(msg)) return t("tw.err_partial");
  if (/could not be restored/i.test(msg)) return t("tw.err_restore");
  if (/no active network adapter/i.test(msg)) return t("tw.err_no_adapter");
  if (/not available on this pc/i.test(msg)) return t("tw.err_power");
  return msg;
}

export type TweakFailures = Record<string, { msg: string; at: number }>;

/**
 * Applies changes one at a time (the engine is not built for parallel writes),
 * storing each verified state. Returns the ones that failed.
 */
export async function applyTweaks(entries: [string, boolean][], onWorking: (id: string | null) => void): Promise<TweakFailures> {
  const failed: TweakFailures = {};
  for (const [id, enabled] of entries) {
    onWorking(id);
    try {
      updateTweakState(await invoke<TweakState>("set_tweak", { id, enabled }));
    } catch (e) {
      failed[id] = { msg: String(e), at: Date.now() };
    }
  }
  onWorking(null);
  void refreshTweakStates();
  return failed;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.states && !store.loading) void refreshTweakStates();
  return () => {
    listeners.delete(listener);
  };
}

export function useTweakStates(): Store {
  return useSyncExternalStore(subscribe, () => store, () => SERVER);
}

export function countActive(states: Record<string, TweakState> | null, ids: string[]): number {
  if (!states) return 0;
  return ids.filter((id) => states[id]?.status === "active").length;
}
