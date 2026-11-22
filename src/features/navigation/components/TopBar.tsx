"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { NAV } from "./Sidebar";
import { LevelMenu } from "./LevelMenu";
import { LanguageMenu } from "./LanguageMenu";
import { UpdateDialog } from "./UpdateDialog";
import { openUpdate, useUpdate } from "@/hooks/useUpdate";
import { fmt } from "@/lib/fmt";

export function TopBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const admin = useIsAdmin();
  const update = useUpdate();
  const updateReady = ["available", "downloading", "installing", "failed"].includes(update.status);
  const current = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)));

  return (
    <header className="topbar">
      <span className="topbar-title">{current ? t(`nav.${current.key}`) : ""}</span>
      <div className="topbar-actions">
        {updateReady && (
          <button type="button" className="pill pill-update" onClick={() => openUpdate(true)}>
            <span className="status-dot on" aria-hidden="true" />
            {fmt(t("up.available"), { v: update.version ?? "" })}
          </button>
        )}
        <LevelMenu />
        <span className="pill" title={admin === false ? t("shell.not_admin_hint") : undefined}>
          <span className={`status-dot ${admin ? "on" : admin === false ? "warn" : ""}`} aria-hidden="true" />
          {admin === null ? t("shell.checking") : admin ? t("shell.admin") : t("shell.not_admin")}
        </span>
        <LanguageMenu />
      </div>
      <UpdateDialog />
    </header>
  );
}
