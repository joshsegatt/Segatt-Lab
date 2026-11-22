// A profile carries this PC's tweaks and winget apps to another PC. The file
// comes from outside the app on import, so nothing in it is trusted: unknown
// tweaks and malformed package ids are dropped. Pure functions: tested in Node.

import type { InstalledApp } from "@/hooks/useApps";
import type { TweakState } from "@/hooks/useTweakStates";
// Relative with extension so the Node test runner can load them too.
import { TWEAKS, type TweakDef } from "./tweaks-catalog.ts";
import { hardwareHint, type Hardware } from "./hardware.ts";

export const PROFILE_FORMAT = "segatt-tools-profile";
export const PROFILE_VERSION = 1;
/** A real profile is a few KB; anything far bigger is not one. */
export const MAX_PROFILE_BYTES = 512 * 1024;
const MAX_APPS = 1000;
const MAX_NAME = 200;

export interface ProfileApp { id: string; name: string }
export interface Profile {
  format: typeof PROFILE_FORMAT;
  version: number;
  exportedAt: string;
  tweaks: string[];
  apps: ProfileApp[];
}

/** Same rule as is_valid_package_id in src-tauri/src/features/utils.rs. */
export const isPackageId = (id: string) => id.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(id);

const KNOWN = new Set(TWEAKS.map((tw) => tw.id));

/** What this PC has now: the tweaks that are on and every app winget installed. */
export function buildProfile(
  states: Record<string, TweakState>,
  installed: Record<string, InstalledApp>,
  now: Date,
): Profile {
  return {
    format: PROFILE_FORMAT,
    version: PROFILE_VERSION,
    exportedAt: now.toISOString(),
    tweaks: TWEAKS.filter((tw) => states[tw.id]?.status === "active").map((tw) => tw.id),
    apps: Object.values(installed)
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** "2026-11-22" in local time, for the file name. */
export const fileStamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type ParseError = "too_big" | "not_json" | "not_profile" | "newer" | "empty";
export type Parsed = { ok: true; profile: Profile; dropped: number } | { ok: false; error: ParseError };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a profile file. `dropped` counts entries left out as unknown or malformed. */
export function parseProfile(text: string): Parsed {
  if (text.length > MAX_PROFILE_BYTES) return { ok: false, error: "too_big" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "not_json" };
  }
  if (!isObj(raw) || raw.format !== PROFILE_FORMAT || !Number.isInteger(raw.version) || (raw.version as number) < 1) return { ok: false, error: "not_profile" };
  const version = raw.version as number;
  if (version > PROFILE_VERSION) return { ok: false, error: "newer" };

  let dropped = 0;
  const tweaks: string[] = [];
  for (const id of Array.isArray(raw.tweaks) ? raw.tweaks : []) {
    if (typeof id === "string" && KNOWN.has(id) && !tweaks.includes(id)) tweaks.push(id);
    else dropped++;
  }
  const apps: ProfileApp[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(raw.apps) ? raw.apps : []) {
    const id = isObj(a) && typeof a.id === "string" ? a.id.trim() : "";
    if (!isPackageId(id) || seen.has(id.toLowerCase()) || apps.length >= MAX_APPS) {
      dropped++;
      continue;
    }
    seen.add(id.toLowerCase());
    const name = isObj(a) && typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, MAX_NAME) : id;
    apps.push({ id, name });
  }
  if (!tweaks.length && !apps.length) return { ok: false, error: "empty" };
  const exportedAt = typeof raw.exportedAt === "string" && !Number.isNaN(Date.parse(raw.exportedAt)) ? raw.exportedAt : "";
  return { ok: true, profile: { format: PROFILE_FORMAT, version, exportedAt, tweaks, apps }, dropped };
}

export interface PlannedTweak { tweak: TweakDef; pick: boolean; why: "risky" | "not_for_pc" | "unknown" | null }
export interface ImportPlan {
  tweaks: PlannedTweak[];
  apps: ProfileApp[];
  /** Already true on this PC: nothing to do. */
  tweaksDone: number;
  appsDone: number;
}

/**
 * What importing would change here. Risky tweaks, tweaks that do not fit this
 * hardware and tweaks this PC cannot read come unpicked: the user turns them
 * on knowingly.
 */
export function planImport(
  profile: Profile,
  states: Record<string, TweakState>,
  installed: Record<string, InstalledApp>,
  hw: Hardware | null,
): ImportPlan {
  const tweaks: PlannedTweak[] = [];
  let tweaksDone = 0;
  for (const tw of TWEAKS) {
    if (!profile.tweaks.includes(tw.id)) continue;
    if (states[tw.id]?.status === "active") {
      tweaksDone++;
      continue;
    }
    const why = tw.risk === "risky" ? "risky" : hardwareHint(tw.id, hw)?.skip ? "not_for_pc" : states[tw.id]?.status === "unknown" ? "unknown" : null;
    tweaks.push({ tweak: tw, pick: why === null, why });
  }
  const apps = profile.apps.filter((a) => !installed[a.id.toLowerCase()]);
  return { tweaks, apps, tweaksDone, appsDone: profile.apps.length - apps.length };
}
