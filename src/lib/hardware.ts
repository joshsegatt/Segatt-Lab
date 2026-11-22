// What get_hardware reports, turned into short lines a person reads, plus the
// rules that make suggestions fit this PC. Pure functions: tested in Node.

import type { Text } from "@/lib/i18n";
// Relative with extension so the Node test runner can load it too.
import { tweaksInPreset, type PresetKey, type TweakDef } from "./tweaks-catalog.ts";

export interface Gpu { name: string | null; driver: string | null; vramBytes: number | null; refreshHz: number | null; width: number | null; height: number | null }
export interface RamStick { bytes: number | null; ratedMts: number | null; configuredMts: number | null; kind: string | null; maker: string | null; part: string | null; slot: string | null }
export interface Disk { model: string | null; media: string | null; bus: string | null; bytes: number | null }
export interface Hardware {
  board: { maker: string | null; model: string | null; biosVersion: string | null; biosDate: string | null };
  cpu: { name: string | null; cores: number | null; threads: number | null; baseMhz: number | null };
  gpus: Gpu[];
  ram: RamStick[];
  systemDisk: Disk | null;
  os: { name: string | null; version: string | null; build: string | null };
  laptop: boolean;
  onBattery: boolean;
}

const GIB = 1024 ** 3;

/** RAM and VRAM are binary sizes; Windows shows them as "GB". 15.92 GiB reads 16 GB. */
export const binGb = (bytes: number) => `${Math.round(bytes / GIB)} GB`;

/** Drives are sold in decimal sizes: 1 000 204 886 016 bytes is a 1 TB drive. */
export function diskSize(bytes: number): string {
  const tb = bytes / 1e12;
  return tb >= 0.95 ? `${Math.round(tb * 10) / 10} TB`.replace(".0 ", " ") : `${Math.round(bytes / 1e9)} GB`;
}

/** "Intel(R) Core(TM) i7-14700K" -> "Intel Core i7-14700K"; drops "8-Core Processor" and "@ 3.60GHz". */
export function cleanCpu(name: string): string {
  return name
    .replace(/\((R|TM|C)\)/gi, "")
    .replace(/\s+CPU\s+@.*$/i, "")
    .replace(/\s+@.*$/, "")
    .replace(/\s+\d+-Core Processor$/i, "")
    .replace(/\s+Processor$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const VENDORS: [RegExp, string][] = [
  [/micro-star/i, "MSI"],
  [/asustek/i, "ASUS"],
  [/gigabyte/i, "Gigabyte"],
  [/asrock/i, "ASRock"],
  [/dell/i, "Dell"],
  [/hewlett|^hp\b/i, "HP"],
  [/lenovo/i, "Lenovo"],
  [/acer/i, "Acer"],
];

export function vendor(maker: string): string {
  const hit = VENDORS.find(([re]) => re.test(maker));
  return hit ? hit[1] : maker.replace(/,?\s*(Co\.|Inc\.|Ltd\.|Corporation|Corp\.).*$/i, "").trim();
}

/** "MAG Z790 TOMAHAWK WIFI (MS-7D91)" -> "MAG Z790 TOMAHAWK WIFI". */
export const cleanBoard = (model: string) => model.replace(/\s*\([^)]*\)\s*$/, "").trim();

// SMBIOS before 3.1.1 reports the speed in MHz (half the MT/s). Below these
// values a module is far more likely read in MHz than really that slow:
// DDR4-3200 in MHz reads 1600; DDR4 sold slower than 1866 is practically gone.
const MTS_FLOOR: Record<string, number> = { DDR4: 1866, DDR5: 3200, LPDDR5: 3200 };

export function realMts(value: number, kind: string | null): number {
  const floor = kind ? MTS_FLOOR[kind] : undefined;
  return floor && value < floor ? value * 2 : value;
}

/** Total, type, real speed and layout: "32 GB DDR5", "5600 MT/s · 2 × 16 GB". */
export function ramSummary(sticks: RamStick[]): { total: string; detail: string } | null {
  const sized = sticks.filter((s) => s.bytes);
  if (!sized.length) return null;
  const total = sized.reduce((sum, s) => sum + (s.bytes ?? 0), 0);
  const kind = sized.find((s) => s.kind)?.kind;
  const raw = sized.find((s) => s.configuredMts)?.configuredMts;
  const speed = raw ? realMts(raw, kind ?? null) : null;
  const sizes = [...new Set(sized.map((s) => binGb(s.bytes!)))];
  const layout = sizes.length === 1 ? `${sized.length} × ${sizes[0]}` : sized.map((s) => binGb(s.bytes!)).join(" + ");
  return { total: `${binGb(total)}${kind ? ` ${kind}` : ""}`, detail: [speed ? `${speed} MT/s` : null, layout].filter(Boolean).join(" · ") };
}

/** "NVMe SSD", "SATA SSD", "HD"... from Get-PhysicalDisk. */
export function diskKind(d: Disk): string | null {
  if (d.media === "HDD") return "HD";
  if (d.media === "SSD") return d.bus === "NVMe" ? "NVMe SSD" : `${d.bus ?? ""} SSD`.trim();
  return d.bus === "NVMe" ? "NVMe" : null;
}

export interface HardwareHint {
  note: Text;
  /** Left out of presets on this PC. */
  skip: boolean;
}

/**
 * What this PC changes about a tweak. Only clear cases: a rule here must be
 * true for every PC that matches it.
 */
export function hardwareHint(id: string, hw: Hardware | null): HardwareHint | null {
  if (!hw) return null;
  if (id === "high_performance_plan" && hw.laptop) {
    return {
      skip: true,
      note: {
        pt: "Seu PC é notebook: na bateria este plano gasta mais e esquenta. Ligue só na tomada.",
        en: "Your PC is a laptop: on battery this plan drains faster and runs hotter. Use it only when plugged in.",
      },
    };
  }
  if (id === "disable_superfetch" && hw.systemDisk?.media === "HDD") {
    return {
      skip: true,
      note: {
        pt: "Seu Windows está num HD: aqui o SysMain ajuda os apps a abrirem mais rápido. Melhor deixar ligado.",
        en: "Your Windows is on a hard drive: here SysMain helps apps open faster. Better to keep it on.",
      },
    };
  }
  return null;
}

/** A preset's tweaks minus the ones that do not fit this PC. */
export function presetForPc(key: PresetKey, hw: Hardware | null): TweakDef[] {
  return tweaksInPreset(key).filter((tw) => !hardwareHint(tw.id, hw)?.skip);
}
