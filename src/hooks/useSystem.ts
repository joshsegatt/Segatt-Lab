"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SystemStats {
  cpu_usage: number;
  used_memory: number; // MB
  total_memory: number; // MB
  disk_free: number; // bytes
  disk_total: number; // bytes
  uptime_secs: number;
}

export interface PcInfo {
  host_name: string;
  os_version: string;
}

// Admin state and PC info do not change while the app runs: ask the backend once.
let adminPromise: Promise<boolean> | null = null;
let pcPromise: Promise<PcInfo | null> | null = null;

/** null while checking; false when not elevated or outside the Tauri window. */
export function useIsAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    adminPromise ??= invoke<boolean>("check_admin").catch(() => false);
    let live = true;
    adminPromise.then((v) => live && setAdmin(v));
    return () => {
      live = false;
    };
  }, []);
  return admin;
}

export function usePcInfo(): PcInfo | null {
  const [info, setInfo] = useState<PcInfo | null>(null);
  useEffect(() => {
    pcPromise ??= invoke<PcInfo>("get_pc_info").catch(() => null);
    let live = true;
    pcPromise.then((v) => live && setInfo(v));
    return () => {
      live = false;
    };
  }, []);
  return info;
}

/** Polls live stats while the calling screen is mounted. */
export function useSystemStats(intervalMs = 3000): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      invoke<SystemStats>("get_system_stats")
        .then((s) => live && setStats(s))
        .catch(() => undefined);
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return stats;
}
