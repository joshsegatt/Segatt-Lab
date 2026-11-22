"use client";

// In-app updates from GitHub Releases. The updater plugin only installs a file
// signed with the key whose public half is in tauri.conf.json.

import { useSyncExternalStore } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "checking" | "none" | "available" | "downloading" | "installing" | "failed" | "check_failed";

interface Store {
  current: string | null;
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  open: boolean;
}

const EMPTY: Store = { current: null, status: "idle", version: null, notes: null, downloaded: 0, total: null, error: null, open: false };
let store: Store = EMPTY;
let pending: Update | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

/** Looks for a newer release. A silent check (at start) never shows an error. */
export async function checkForUpdate(silent = false): Promise<void> {
  if (store.status === "checking" || store.status === "downloading" || store.status === "installing") return;
  set({ status: "checking", error: null });
  try {
    const update = await check();
    pending = update;
    if (update) set({ status: "available", version: update.version, notes: update.body?.trim() || null, open: !silent || store.open });
    else set({ status: silent ? "idle" : "none" });
  } catch (e) {
    set({ status: silent ? "idle" : "check_failed", error: String(e) });
  }
}

/** Downloads, installs and restarts. On Windows the installer closes the app itself. */
export async function installUpdate(): Promise<void> {
  if (!pending || store.status === "downloading" || store.status === "installing") return;
  set({ status: "downloading", downloaded: 0, total: null, error: null });
  try {
    let got = 0;
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") set({ total: event.data.contentLength ?? null });
      else if (event.event === "Progress") {
        got += event.data.chunkLength;
        set({ downloaded: got });
      } else if (event.event === "Finished") set({ status: "installing" });
    });
    await relaunch();
  } catch (e) {
    set({ status: "failed", error: String(e) });
  }
}

export function openUpdate(open: boolean): void {
  set({ open });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    getVersion().then((current) => set({ current })).catch(() => {});
    // Once per launch, after the first screen has settled.
    window.setTimeout(() => void checkForUpdate(true), 4000);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdate(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
