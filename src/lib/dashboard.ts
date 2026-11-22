// "Vale fazer agora" on Home: what is worth doing on this PC, from readings the
// app already has. Unknown readings (null) never produce a suggestion.
// Pure function: tested in Node.

export type SuggestionId =
  | "not_admin" | "restart" | "updates_off" | "disk_full"
  | "clean" | "app_updates" | "essential" | "gaming";

export interface Suggestion {
  id: SuggestionId;
  /** warn: something is off; tip: an improvement. Warnings come first. */
  kind: "warn" | "tip";
  href?: string;
  /** Values for the sentence ({n}, {size}...). */
  vars?: Record<string, number>;
}

export interface Readings {
  admin: boolean | null;
  restartPending: boolean | null;
  updateMode: string | null;
  diskFree: number | null;
  diskTotal: number | null;
  /** Bytes the safe cleanups would free. */
  cleanable: number | null;
  appUpdates: number | null;
  essentialPending: number | null;
  gamingPending: number | null;
}

const GB = 1024 ** 3;
/** Below this share of free space the system disk is "almost full". */
export const DISK_LOW = 0.1;
/** Cleanups smaller than this are not worth a line on Home. */
export const CLEAN_WORTH = 1 * GB;

export function suggestions(r: Readings): Suggestion[] {
  const out: Suggestion[] = [];
  if (r.admin === false) out.push({ id: "not_admin", kind: "warn" });
  if (r.restartPending) out.push({ id: "restart", kind: "warn" });
  if (r.updateMode === "manual") out.push({ id: "updates_off", kind: "warn", href: "/config" });
  const diskLow = r.diskFree !== null && r.diskTotal ? r.diskFree / r.diskTotal < DISK_LOW : false;
  if (diskLow) out.push({ id: "disk_full", kind: "warn", href: "/cleaner", vars: { free: r.diskFree! } });
  // A full disk already points at the Cleaner; the size line would repeat it.
  if (!diskLow && r.cleanable !== null && r.cleanable >= CLEAN_WORTH) out.push({ id: "clean", kind: "tip", href: "/cleaner", vars: { size: r.cleanable } });
  if (r.appUpdates) out.push({ id: "app_updates", kind: "tip", href: "/install?view=updates", vars: { n: r.appUpdates } });
  if (r.essentialPending) out.push({ id: "essential", kind: "tip", href: "/tweaks?preset=essential", vars: { n: r.essentialPending } });
  if (r.gamingPending) out.push({ id: "gaming", kind: "tip", href: "/tweaks?preset=gaming", vars: { n: r.gamingPending } });
  return out;
}
