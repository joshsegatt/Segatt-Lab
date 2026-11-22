"use client";

// Bootable USB: the ISO, the USB drives, and the one write that may run at a
// time. Kept outside React so leaving the screen does not lose the progress.

import { useSyncExternalStore } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface UsbVolume {
  letter: string;
  label: string;
}

export interface UsbDisk {
  number: number;
  name: string;
  serial: string;
  size: number;
  removable: boolean;
  volumes: UsbVolume[];
}

export interface IsoInfo {
  kind: "windows" | "linux";
  name: string;
  label: string;
  size: number;
  splits: boolean;
  path: string;
}

export type Stage = "erase" | "copy" | "split" | "verify";

export interface Job {
  disk: UsbDisk;
  iso: IsoInfo;
  stage: Stage;
  done: number;
  total: number;
  /** When the current stage started and where it started, for the time left. */
  stageAt: number;
  stageFrom: number;
  cancelling: boolean;
}

export interface Result {
  ok: boolean;
  disk: UsbDisk;
  iso: IsoInfo;
  error?: string;
}

export interface WinOptions {
  skipHardwareChecks: boolean;
  localAccount: string | null;
}

interface Store {
  disks: UsbDisk[] | null;
  reading: boolean;
  readError: string | null;
  iso: IsoInfo | null;
  inspecting: boolean;
  isoError: string | null;
  job: Job | null;
  result: Result | null;
  /** The user tried to close the app during a write. */
  closeBlocked: boolean;
}

const EMPTY: Store = { disks: null, reading: false, readError: null, iso: null, inspecting: false, isoError: null, job: null, result: null, closeBlocked: false };
let store: Store = EMPTY;
const listeners = new Set<() => void>();

function set(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

export function readDisks(): void {
  if (store.reading || store.job) return;
  set({ reading: true, readError: null });
  invoke<UsbDisk[]>("list_usb_disks")
    .then((disks) => set({ disks, reading: false }))
    .catch((e) => set({ reading: false, readError: String(e) }));
}

export async function pickIso(title: string): Promise<void> {
  if (store.job || store.inspecting) return;
  const path = await open({ title, multiple: false, directory: false, filters: [{ name: "ISO", extensions: ["iso"] }] });
  if (typeof path !== "string") return;
  set({ inspecting: true, isoError: null, result: null });
  try {
    const info = await invoke<Omit<IsoInfo, "path">>("inspect_iso", { path });
    set({ iso: { ...info, path }, inspecting: false });
  } catch (e) {
    set({ iso: null, inspecting: false, isoError: String(e) });
  }
}

export async function writeUsb(disk: UsbDisk, options: WinOptions): Promise<Result | null> {
  const iso = store.iso;
  if (!iso || store.job) return null;
  const onProgress = new Channel<{ stage: Stage; done: number; total: number }>();
  onProgress.onmessage = (p) => {
    const job = store.job;
    if (!job) return;
    const same = p.stage === job.stage;
    set({ job: { ...job, stage: p.stage, done: p.done, total: p.total, stageAt: same ? job.stageAt : Date.now(), stageFrom: same ? job.stageFrom : p.done } });
  };
  const first: Stage = iso.kind === "windows" && iso.splits ? "split" : "erase";
  set({ result: null, job: { disk, iso, stage: first, done: 0, total: 1, stageAt: Date.now(), stageFrom: 0, cancelling: false } });
  // Closing the app mid-write would leave the drive half written: the window
  // stays open until the write ends (Cancel stops it cleanly).
  const unlisten = await getCurrentWindow()
    .onCloseRequested((e) => {
      e.preventDefault();
      set({ closeBlocked: true });
    })
    .catch(() => null);
  let result: Result;
  try {
    await invoke("write_usb", { disk: disk.number, serial: disk.serial, size: disk.size, iso: iso.path, options, onProgress });
    result = { ok: true, disk, iso };
  } catch (e) {
    result = { ok: false, disk, iso, error: String(e) };
  }
  unlisten?.();
  set({ job: null, result, closeBlocked: false });
  readDisks();
  return result;
}

export function cancelUsb(): void {
  if (!store.job) return;
  set({ job: { ...store.job, cancelling: true } });
  void invoke("cancel_usb");
}

export function clearResult(): void {
  set({ result: null });
}

/** Seconds left at the current pace, once there is a pace to go by. */
export function secondsLeft(job: Job, now: number): number | null {
  const elapsed = (now - job.stageAt) / 1000;
  const moved = job.done - job.stageFrom;
  if (job.stage === "erase" || elapsed < 3 || moved <= 0 || job.done >= job.total) return null;
  return Math.round(((job.total - job.done) / moved) * elapsed);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.disks && !store.reading && !store.readError) readDisks();
  return () => {
    listeners.delete(listener);
  };
}

export function useUsb(): Store {
  return useSyncExternalStore(subscribe, () => store, () => EMPTY);
}
