"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck, Gamepad2, HardDrive, RefreshCw, RotateCw, ShieldAlert, SlidersHorizontal, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin, useSystemStats } from "@/hooks/useSystem";
import { useTweakStates } from "@/hooks/useTweakStates";
import { countUpdates, useApps } from "@/hooks/useApps";
import { useHardware } from "@/hooks/useHardware";
import { useControl } from "@/hooks/useControl";
import { useCleanup } from "@/hooks/useCleanup";
import { presetForPc } from "@/lib/hardware";
import { CLEANUPS, formatBytes, startsPicked } from "@/lib/cleanup";
import { suggestions, type SuggestionId } from "@/lib/dashboard";
import type { PresetKey } from "@/lib/tweaks-catalog";
import { fmt } from "@/lib/fmt";
import styles from "./Home.module.css";

const ICON: Record<SuggestionId, LucideIcon> = {
  not_admin: ShieldAlert,
  restart: RotateCw,
  updates_off: TriangleAlert,
  disk_full: HardDrive,
  clean: Trash2,
  app_updates: RefreshCw,
  essential: SlidersHorizontal,
  gaming: Gamepad2,
};

/** "Vale fazer agora": the Home dashboard, built from what the app already reads. */
export function WorthDoing() {
  const { t, language } = useLanguage();
  const admin = useIsAdmin();
  const stats = useSystemStats();
  const { states } = useTweakStates();
  const { installed } = useApps();
  const { hw } = useHardware();
  const { update, features } = useControl();
  const { sizes, scanError } = useCleanup();

  // Only tweaks read as off count: one this PC cannot read ("unknown") would never clear the row.
  const pending = (key: PresetKey) => (states ? presetForPc(key, hw).filter((tw) => states[tw.id]?.status === "inactive").length : null);
  const list = suggestions({
    admin,
    restartPending: features?.restartPending ?? null,
    updateMode: update?.mode ?? null,
    diskFree: stats && stats.disk_total ? stats.disk_free : null,
    diskTotal: stats && stats.disk_total ? stats.disk_total : null,
    cleanable: sizes ? CLEANUPS.filter((c) => startsPicked(c.id, sizes[c.id])).reduce((sum, c) => sum + (sizes[c.id] ?? 0), 0) : null,
    appUpdates: installed ? countUpdates(installed) : null,
    essentialPending: pending("essential"),
    gamingPending: pending("gaming"),
  });
  // "All good" only once the main readings are in; before that, nothing.
  const allRead = states !== null && installed !== null && (sizes !== null || scanError !== null) && admin !== null;
  if (!list.length && !allRead) return null;

  const words = (vars: Record<string, number> = {}) =>
    Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, k === "size" || k === "free" ? formatBytes(v, language) : v]));

  return (
    <section className={styles.worth} aria-labelledby="worth-head">
      <div className={styles.worthHead}>
        <h2 id="worth-head">{t("dash.title")}</h2>
        <span>{t("dash.note")}</span>
      </div>
      <ul className={styles.worthList}>
        {list.length === 0 ? (
          <li className={styles.worthRow}>
            <span className={`${styles.worthIcon} ${styles.worthOk}`} aria-hidden="true"><CircleCheck size={16} strokeWidth={1.75} /></span>
            <span className={styles.worthText}><b>{t("dash.all_good")}</b><small>{t("dash.all_good_sub")}</small></span>
          </li>
        ) : (
          list.map((s) => {
            const Icon = ICON[s.id];
            const body = (
              <>
                <span className={`${styles.worthIcon} ${s.kind === "warn" ? styles.worthWarn : ""}`} aria-hidden="true"><Icon size={16} strokeWidth={1.75} /></span>
                <span className={styles.worthText}>
                  <b>{fmt(t(`dash.${s.id}`, s.vars?.n), words(s.vars))}</b>
                  <small>{fmt(t(`dash.${s.id}_sub`, s.vars?.n), words(s.vars))}</small>
                </span>
                {s.href && <ChevronRight size={16} strokeWidth={1.75} className={styles.worthGo} aria-hidden="true" />}
              </>
            );
            return (
              <li key={s.id}>
                {s.href ? <Link href={s.href} className={`${styles.worthRow} ${styles.worthLink}`}>{body}</Link> : <div className={styles.worthRow}>{body}</div>}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
