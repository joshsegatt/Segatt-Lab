"use client";

// The install / update / remove queue. It lives at module level, not in the
// Apps page, so leaving the screen mid-batch neither loses the run nor lets a
// second winget start next to the first (winget installs one package at a time).

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { refreshApps } from "@/hooks/useApps";
import { recordActivity } from "@/lib/history";
import { wingetReason } from "@/lib/winget-errors";
import { fmt } from "@/lib/fmt";

export type Action = "install" | "upgrade" | "uninstall";
export interface Job { id: string; name: string; action: Action }
export interface Result { status: "done" | "failed"; action: Action; msg?: string; at?: number }
export interface Progress { i: number; n: number; name: string; action: Action }

interface QueueState {
  running: string | null;
  queued: string[];
  progress: Progress | null;
  results: Record<string, Result>;
  toast: { kind: "success" | "error"; msg: string } | null;
}

type Translate = (path: string) => string;

export const key = (id: string) => id.toLowerCase();

/** A failed run as one line the user can act on. */
export function reasonText(msg: string, tr: Translate, admin: boolean | null): string {
  const r = wingetReason(msg);
  const text = r === "unknown" ? tr("ap.err_generic") : tr(`ap.reason_${r}`);
  return admin === false && (r === "unknown" || r === "installer" || r === "policy") ? `${text} ${tr("ap.admin_hint")}` : text;
}

const EMPTY: QueueState = { running: null, queued: [], progress: null, results: {}, toast: null };
let state: QueueState = EMPTY;
const listeners = new Set<() => void>();
const queue: Job[] = [];
const batch = { done: 0, total: 0, ok: 0 };
// Translator and admin flag of the screen that last rendered, for history lines.
let ctx: { tr: Translate; admin: boolean | null } = { tr: (p) => p, admin: null };

function set(next: Partial<QueueState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const queuedIds = () => queue.map((j) => key(j.id));

export function setQueueContext(tr: Translate, admin: boolean | null) {
  ctx = { tr, admin };
}

export function clearToast() {
  set({ toast: null });
}

async function drain() {
  while (queue.length) {
    const job = queue.shift()!;
    const k = key(job.id);
    batch.done++;
    set({ running: k, queued: queuedIds(), progress: { i: batch.done, n: batch.total, name: job.name, action: job.action } });
    try {
      await invoke("run_app_action", { id: job.id, action: job.action });
      batch.ok++;
      set({ results: { ...state.results, [k]: { status: "done", action: job.action } } });
      const label = job.action === "install" ? "history.installed" : job.action === "upgrade" ? "history.updated" : "history.uninstalled";
      recordActivity({ label: fmt(ctx.tr(label), { name: job.name }), status: "ok", href: "/install" });
    } catch (e) {
      const msg = String(e);
      set({ results: { ...state.results, [k]: { status: "failed", action: job.action, msg, at: Date.now() } } });
      const label = job.action === "install" ? "history.install_failed" : job.action === "upgrade" ? "history.update_failed" : "history.uninstall_failed";
      recordActivity({ label: fmt(ctx.tr(label), { name: job.name }), detail: reasonText(msg, ctx.tr, ctx.admin), status: "failed", href: "/install" });
    }
  }
  const { ok, total } = batch;
  batch.done = batch.total = batch.ok = 0;
  set({ running: null, progress: null, toast: { kind: ok === total ? "success" : "error", msg: fmt(ctx.tr("ap.done_batch"), { ok, n: total }) } });
  void refreshApps();
}

/** Adds jobs not already running or waiting; starts the queue when idle. */
export function enqueue(jobs: Job[]) {
  const fresh = jobs.filter((j) => key(j.id) !== state.running && !queue.some((x) => key(x.id) === key(j.id)));
  if (!fresh.length) return;
  queue.push(...fresh);
  batch.total += fresh.length;
  const results = { ...state.results };
  for (const j of fresh) delete results[key(j.id)];
  set({ queued: queuedIds(), results });
  if (!state.running) void drain();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppQueue(): QueueState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}
