// Where each change happens inside the PC, for the lab scene. Pure: tested in Node.

import type { Hardware } from "./hardware.ts";
import { binGb, cleanCpu, diskSize, vendor } from "./hardware.ts";

export const STATIONS = ["board", "cpu", "ram", "gpu", "display", "disk", "net"] as const;
export type Station = (typeof STATIONS)[number];

const TWEAK_STATION: Record<string, Station> = {
  high_performance_plan: "cpu",
  disable_power_throttling: "cpu",
  optimize_hpet: "board",
  disable_game_bar: "gpu",
  enable_game_mode: "gpu",
  enable_hags: "gpu",
  disable_visual_fx: "display",
  disable_superfetch: "ram",
  disable_edge_background: "ram",
  disable_search_indexing: "disk",
  set_dns_cloudflare: "net",
  enable_long_paths: "disk",
  enable_f8_boot: "board",
  disable_fast_startup: "board",
  disable_windows_update: "net",
};

const GROUP_STATION: Record<string, Station> = {
  privacy: "net",
  interface: "display",
  services: "ram",
  system: "board",
  performance: "cpu",
};

/** The station a tweak works on: by id when it is specific, else by its group. */
export function stationOfTweak(id: string, group: string): Station {
  return TWEAK_STATION[id] ?? GROUP_STATION[group] ?? "board";
}

const CLEANUP_STATION: Record<string, Station> = {
  flush_dns: "net",
  clean_shader_cache: "gpu",
  clean_browser_cache: "net",
};

export function stationOfCleanup(id: string): Station {
  return CLEANUP_STATION[id] ?? "disk";
}

/** The real part on this PC under each station, when Windows reported it. */
export function partNames(hw: Hardware | null): Partial<Record<Station, string>> {
  if (!hw) return {};
  const gpu = hw.gpus[0];
  const ram = hw.ram.reduce((sum, s) => sum + (s.bytes ?? 0), 0);
  const mts = hw.ram.find((s) => s.configuredMts)?.configuredMts;
  const board = [hw.board.maker && vendor(hw.board.maker), hw.board.model].filter(Boolean).join(" ");
  return {
    cpu: hw.cpu.name ? cleanCpu(hw.cpu.name) : undefined,
    gpu: gpu?.name ?? undefined,
    ram: ram ? `${binGb(ram)}${mts ? ` · ${mts} MT/s` : ""}` : undefined,
    disk: hw.systemDisk?.model ? `${hw.systemDisk.model}${hw.systemDisk.bytes ? ` · ${diskSize(hw.systemDisk.bytes)}` : ""}` : undefined,
    display: gpu?.width && gpu.height ? `${gpu.width}×${gpu.height}${gpu.refreshHz ? ` · ${gpu.refreshHz} Hz` : ""}` : undefined,
    board: board || undefined,
  };
}
