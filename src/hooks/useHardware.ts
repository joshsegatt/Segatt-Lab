"use client";

// The hardware report, read once per app run (it takes a few seconds) and
// shared by Home and Tweaks. Read-only; nothing leaves the PC.

import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Hardware } from "@/lib/hardware";

interface Store {
  hw: Hardware | null;
  loading: boolean;
  error: string | null;
}

let store: Store = { hw: null, loading: false, error: null };
const SERVER: Store = { hw: null, loading: false, error: null };
const listeners = new Set<() => void>();

function emit(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((l) => l());
}

export function readHardware(): void {
  if (store.loading) return;
  emit({ loading: true, error: null });
  invoke<Hardware>("get_hardware")
    .then((hw) => emit({ hw, loading: false }))
    .catch((e) => emit({ loading: false, error: String(e) }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!store.hw && !store.loading && !store.error) readHardware();
  return () => {
    listeners.delete(listener);
  };
}

export function useHardware(): Store {
  return useSyncExternalStore(subscribe, () => store, () => SERVER);
}
