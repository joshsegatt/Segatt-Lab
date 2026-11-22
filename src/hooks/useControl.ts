"use client";

// Update mode and Windows features, read from Windows and changed one at a
// time. Module-level so a feature change that takes minutes survives leaving
// the screen.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateMode } from "@/lib/control";
import { refreshTweakStates } from "@/hooks/useTweakStates";

export interface UpdateState { mode: UpdateMode; deferralSupported: boolean; edition: string | null }
export interface FeatureState { name: string; status: "enabled" | "disabled" | "unavailable" }
export interface FeaturesReport { features: FeatureState[]; restartPending: boolean }

interface Store {
  update: UpdateState | null;
  features: FeaturesReport | null;
  readError: string | null;
  /** "update:security", "feature:NetFx3"... while it runs. */
  busy: string | null;
  /** Last failure per target, shown under its row. */
  errors: Record<string, { msg: string; at: number }>;
  /** State asked for per feature; Windows may report the old one until it restarts. */
  requested: Record<string, boolean>;
}

const EMPTY: Store = { update: null, features: null, readError: null, busy: null, errors: {}, requested: {} };
let store: Store = EMPTY;
let reading = false;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

export function readControl(): void {
  if (reading) return;
  reading = true;
  set({ readError: null });
  Promise.all([invoke<UpdateState>("get_update_mode"), invoke<FeaturesReport>("get_features")])
    .then(([update, features]) => set({ update, features }))
    .catch((e) => set({ readError: String(e) }))
    .finally(() => {
      reading = false;
    });
}

async function run(target: string, call: () => Promise<void>) {
  if (store.busy) return;
  const errors = { ...store.errors };
  delete errors[target];
  set({ busy: target, errors });
  try {
    await call();
  } catch (e) {
    set({ errors: { ...store.errors, [target]: { msg: String(e), at: Date.now() } } });
  } finally {
    set({ busy: null });
  }
}

/** Risky modes get a restore point first. */
export function setUpdateMode(mode: Exclude<UpdateMode, "custom">, restorePoint: boolean) {
  return run(`update:${mode}`, async () => {
    if (restorePoint) await invoke("create_restore_point");
    set({ update: await invoke<UpdateState>("set_update_mode", { mode }) });
    // "Manual" is the same value as the Tweaks switch; keep that list honest.
    void refreshTweakStates();
  });
}

export function setFeature(name: string, enabled: boolean) {
  return run(`feature:${name}`, async () => {
    const features = await invoke<FeaturesReport>("set_feature", { name, enabled });
    set({ features, requested: { ...store.requested, [name]: enabled } });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.update && !store.readError) readControl();
  return () => {
    listeners.delete(listener);
  };
}

export function useControl(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
