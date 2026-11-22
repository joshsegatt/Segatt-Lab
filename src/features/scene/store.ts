"use client";

// The lab scene follows real work: each step is a tweak or a cleanup the app is
// really running, and its status comes from the backend's answer. The scene
// only illustrates; it never decides or fakes a result.

import { useSyncExternalStore } from "react";
import type { Station } from "@/lib/scene";

export type SceneKind = "tweaks" | "undo" | "cleanup";

/** The restore point taken before a batch shows as the first step. */
export const RESTORE_STEP = "restore_point";
export type StepStatus = "wait" | "run" | "ok" | "fail";

export interface SceneStep {
  id: string;
  station: Station;
  status: StepStatus;
  reason?: string;
}

export interface SceneState {
  /** Bumps on every new run, so the canvas restarts its story. */
  run: number;
  open: boolean;
  kind: SceneKind;
  steps: SceneStep[];
  finished: boolean;
  /** Cleanup only: bytes freed in total. */
  freed: number | null;
}

const EMPTY: SceneState = { run: 0, open: false, kind: "tweaks", steps: [], finished: false, freed: null };
let state: SceneState = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<SceneState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Batches of two or more open the scene; a single switch flip does not. */
export function startScene(kind: SceneKind, steps: { id: string; station: Station }[]): boolean {
  if (steps.length < 2) return false;
  set({ run: state.run + 1, open: true, kind, finished: false, freed: null, steps: steps.map((s) => ({ ...s, status: "wait" })) });
  return true;
}

/** Updates the current run even when it was skipped, so it still ends. */
export function stepScene(id: string, status: StepStatus, reason?: string): void {
  set({ steps: state.steps.map((s) => (s.id === id ? { ...s, status, reason } : s)) });
}

export function finishScene(freed: number | null = null): void {
  set({ finished: true, freed });
}

export function closeScene(): void {
  set({ open: false });
}

export function getScene(): SceneState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScene(): SceneState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}
