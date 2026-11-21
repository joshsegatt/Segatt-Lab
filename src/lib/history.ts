// Activity history shown in the sidebar, like the conversation list of an AI app.
// Kept in localStorage: it is a per-PC convenience, and the app must render fine without it.

import { useSyncExternalStore } from "react";

export type ActivityStatus = "ok" | "failed";

export interface Activity {
  id: string;
  label: string;
  detail?: string;
  status: ActivityStatus;
  at: number; // epoch ms
  href?: string;
}

const KEY = "segatt_history_v1";
const LIMIT = 40;
const EMPTY: Activity[] = [];
const listeners = new Set<() => void>();
let cache: Activity[] | null = null;

function read(): Activity[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as Activity[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordActivity(entry: Omit<Activity, "id" | "at">): void {
  const next: Activity = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
  cache = [next, ...read()].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable: the entry still shows for this session
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActivity(): Activity[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Groups entries into Today / Yesterday / Earlier by local calendar day. */
export function groupByDay(items: Activity[], now = new Date()): { key: "today" | "yesterday" | "earlier"; items: Activity[] }[] {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const groups = { today: [] as Activity[], yesterday: [] as Activity[], earlier: [] as Activity[] };
  for (const item of items) {
    if (item.at >= startToday) groups.today.push(item);
    else if (item.at >= startYesterday) groups.yesterday.push(item);
    else groups.earlier.push(item);
  }
  return (["today", "yesterday", "earlier"] as const)
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, items: groups[k] }));
}
