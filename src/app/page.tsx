"use client";

import Link from "next/link";
import { Gamepad2, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useSystemStats } from "@/hooks/useSystem";
import { countActive, useTweakStates } from "@/hooks/useTweakStates";
import { Composer } from "@/features/home/Composer";
import { TWEAKS, tweaksInPreset } from "@/lib/tweaks-catalog";
import { fmt } from "@/lib/fmt";
import styles from "@/features/home/Home.module.css";

const GB = 1024 ** 3;


export default function Home() {
  const { t, language } = useLanguage();
  const stats = useSystemStats();
  const { states } = useTweakStates();
  const activeTweaks = countActive(states, TWEAKS.map((tw) => tw.id));
  // Pills say how many tweaks of the preset are still off on this PC.
  const presetDetail = (key: "gaming" | "privacy") => {
    const ids = tweaksInPreset(key).map((tw) => tw.id);
    if (!states) return fmt(t("home.n_tweaks"), { n: ids.length });
    const pending = ids.length - countActive(states, ids);
    return pending === 0 ? t("home.all_done") : fmt(t("home.n_pending"), { n: pending });
  };
  const num = new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 });

  const memUsed = stats ? stats.used_memory / 1024 : 0;
  const memTotal = stats ? stats.total_memory / 1024 : 0;
  const diskFree = stats ? stats.disk_free / GB : 0;
  const diskTotal = stats ? stats.disk_total / GB : 0;

  const suggestions = [
    { href: "/tweaks?preset=gaming", icon: Gamepad2, label: t("home.sug_gaming"), detail: presetDetail("gaming") },
    { href: "/tweaks?preset=privacy", icon: ShieldCheck, label: t("home.sug_privacy"), detail: presetDetail("privacy") },
    { href: "/cleaner", icon: Trash2, label: t("home.sug_clean") },
    { href: "/fixes", icon: Wrench, label: t("home.sug_repair") },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <section className={styles.center}>
        <h1 className={styles.title}>{t("home.title")}</h1>
        <p className={styles.lede}>{t("home.lede")}</p>

        <Composer />

        <div className={styles.suggestions}>
          {suggestions.map((s) => (
            <Link key={s.href} href={s.href} className={styles.suggestion}>
              <s.icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <b>{s.label}</b>
              {s.detail && <span>{s.detail}</span>}
            </Link>
          ))}
        </div>

        <dl className={styles.state} aria-live="off">
          <div>
            <dt>{t("home.cpu")}</dt>
            <dd><b>{stats ? `${Math.round(stats.cpu_usage)}%` : "—"}</b></dd>
            <Meter value={stats ? stats.cpu_usage / 100 : 0} />
          </div>
          <div>
            <dt>{t("home.memory")}</dt>
            <dd><b>{stats ? num.format(memUsed) : "—"}</b> {stats && <span>/ {Math.round(memTotal)} GB</span>}</dd>
            <Meter value={memTotal ? memUsed / memTotal : 0} />
          </div>
          <div>
            <dt>{t("home.disk")} C:</dt>
            <dd><b>{stats && diskTotal ? Math.round(diskFree) : "—"}</b> <span>{stats && diskTotal ? `GB ${t("home.free")}` : ""}</span></dd>
            <Meter value={diskTotal ? 1 - diskFree / diskTotal : 0} />
          </div>
          <div>
            <dt>{t("home.active_tweaks")}</dt>
            <dd><b>{states ? activeTweaks : "—"}</b> {states && <span>{fmt(t("home.of_n"), { n: TWEAKS.length })}</span>}</dd>
            <Meter value={states ? activeTweaks / TWEAKS.length : 0} brand />
          </div>
        </dl>
      </section>
    </div>
  );
}

function Meter({ value, brand = false }: { value: number; brand?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`${styles.meter} ${brand ? styles.meterBrand : ""}`} aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
