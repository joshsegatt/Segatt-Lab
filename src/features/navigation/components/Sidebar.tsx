"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Package, SlidersHorizontal, Trash2, Wrench, Settings2, FolderSync, Monitor } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { usePcInfo } from "@/hooks/useSystem";
import { countActive, useTweakStates } from "@/hooks/useTweakStates";
import { countUpdates, useApps } from "@/hooks/useApps";
import { TWEAKS } from "@/lib/tweaks-catalog";
import { groupByDay, useActivity } from "@/lib/history";
import { APP_MARK, APP_NAME } from "@/lib/brand";
import styles from "./Sidebar.module.css";

export const NAV = [
  { key: "home", href: "/", icon: House },
  { key: "apps", href: "/install", icon: Package },
  { key: "tweaks", href: "/tweaks", icon: SlidersHorizontal },
  { key: "cleaner", href: "/cleaner", icon: Trash2 },
  { key: "fixes", href: "/fixes", icon: Wrench },
  { key: "control", href: "/config", icon: Settings2 },
  { key: "profile", href: "/profile", icon: FolderSync },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const pc = usePcInfo();
  const history = groupByDay(useActivity());
  const { states } = useTweakStates();
  const tweakCount = states ? `${countActive(states, TWEAKS.map((tw) => tw.id))}/${TWEAKS.length}` : null;
  const updates = countUpdates(useApps().installed);

  return (
    <aside className={styles.side}>
      <Link href="/" className={styles.brand} aria-label={APP_NAME}>
        <span className={styles.mark} aria-hidden="true">{APP_MARK}</span>
        <span className={styles.name}>{APP_NAME}</span>
      </Link>

      <nav className={styles.nav} aria-label={APP_NAME}>
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`${styles.item} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{t(`nav.${item.key}`)}</span>
              {item.key === "tweaks" && tweakCount && <span className={styles.count}>{tweakCount}</span>}
              {item.key === "apps" && updates > 0 && <span className={styles.count} title={t("ap.view_updates")}>{updates}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={styles.history}>
        {history.length === 0 ? (
          <p className={styles.empty}>{t("shell.history_empty")}</p>
        ) : (
          history.map((group) => (
            <section key={group.key}>
              <h2 className={styles.group}>{t(`shell.${group.key}`)}</h2>
              <ul>
                {group.items.map((a) => (
                  <li key={a.id} className={`${styles.entry} ${a.status === "failed" ? styles.failed : ""}`} title={a.detail ? `${a.label} · ${a.detail}` : a.label}>
                    <span className={styles.clamp}>
                      {a.label}
                      {a.detail && <span className={styles.detail}> · {a.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className={styles.pc}>
        <span className={styles.pcIcon} aria-hidden="true"><Monitor size={16} strokeWidth={1.75} /></span>
        <div className={styles.pcText}>
          <span>{pc?.host_name ?? "—"}</span>
          <small>{pc?.os_version ?? ""}</small>
        </div>
      </div>
    </aside>
  );
}
