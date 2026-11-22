"use client";

// The knowledge level picked at the end of onboarding, kept in localStorage
// (a per-PC preference). Until one is picked the app behaves as Beginner.

import { useSyncExternalStore } from "react";
import { isLevel, type Level } from "@/lib/level";

const KEY = "segatt_level_v1";
const listeners = new Set<() => void>();
/** Read before hydration ends: render nothing that depends on the choice yet. */
const SERVER = "pending";
/** Fallback when storage is blocked. */
let memory: Level | null = null;

function read(): Level | "unset" {
  try {
    const v = localStorage.getItem(KEY);
    return isLevel(v) ? v : "unset";
  } catch {
    return "unset";
  }
}

export function setLevel(level: Level) {
  // Held in memory too: if storage is blocked the choice still holds for this session.
  memory = level;
  try {
    localStorage.setItem(KEY, level);
  } catch {
    // not persisted; onboarding comes back next launch
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `chosen` is null until the person picks (onboarding shows then),
 * "pending" during the first render, before storage can be read.
 */
export function useLevel(): { level: Level; chosen: Level | null | "pending" } {
  const raw = useSyncExternalStore(subscribe, () => memory ?? read(), () => SERVER as Level | "unset" | "pending");
  const chosen = raw === "pending" ? "pending" : raw === "unset" ? null : raw;
  return { level: chosen && chosen !== "pending" ? chosen : "beginner", chosen };
}
