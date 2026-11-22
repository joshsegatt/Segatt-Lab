"use client";

import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { NAV } from "./Sidebar";
import { LevelMenu } from "./LevelMenu";

export function TopBar() {
  const pathname = usePathname();
  const { t, language, setLanguage } = useLanguage();
  const admin = useIsAdmin();
  const current = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)));

  return (
    <header className="topbar">
      <span className="topbar-title">{current ? t(`nav.${current.key}`) : ""}</span>
      <div className="topbar-actions">
        <LevelMenu />
        <span className="pill" title={admin === false ? t("shell.not_admin_hint") : undefined}>
          <span className={`status-dot ${admin ? "on" : admin === false ? "warn" : ""}`} aria-hidden="true" />
          {admin === null ? t("shell.checking") : admin ? t("shell.admin") : t("shell.not_admin")}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setLanguage(language === "pt" ? "en" : "pt")}
          aria-label={t("shell.switch_language")}
          title={t("shell.switch_language")}
        >
          <Languages size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
