"use client";

import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/hooks/useLanguage";
import { useQueryParam } from "@/hooks/useQueryParam";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import { TWEAKS as CATALOG, PRESETS as PRESET_DEFS, tweaksInPreset, type PresetKey } from "@/lib/tweaks-catalog";
import {
  Loader2,
  Play,
  ShieldAlert,
  RotateCcw,
  CheckCheck,
  X,
  Zap,
  Shield,
  Monitor,
  Settings,
  LifeBuoy,
  Gamepad2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

// ─── Tweak Row Component ────────────────────────────────────
interface TweakDef {
  id: string;
  name: string;
  description: string;
  column: "privacy" | "performance" | "interface" | "system";
  preset?: ("essential" | "privacy" | "gaming")[];
}

interface TweakRowProps {
  tweak: TweakDef;
  isSelected: boolean;
  onToggle: () => void;
}

const TweakRow = ({ tweak, isSelected, onToggle }: TweakRowProps) => (
  <div
    className={`item-row ${isSelected ? "selected" : ""}`}
    onClick={onToggle}
    role="checkbox"
    aria-checked={isSelected}
    tabIndex={0}
    onKeyDown={(e) => e.key === " " && onToggle()}
  >
    <div className="item-checkbox" aria-hidden="true">
      {isSelected && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>

    <span className="item-name">{tweak.name}</span>

    <div className="tooltip-wrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", flexShrink: 0, cursor: "help" }}>
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
      </svg>
      <div className="tooltip-box">{tweak.description}</div>
    </div>
  </div>
);

import { PageHeader } from "@/components/ui/PageHeader";

// ─── Main Page ───────────────────────────────────────────────
export default function TweaksPage() {
  const { t, language } = useLanguage();
  // Arriving from the Home search (?preset=gaming or ?select=<id>) preselects those tweaks.
  const presetParam = useQueryParam("preset");
  const selectParam = useQueryParam("select");
  const fromQuery = useMemo(() => {
    if (presetParam && ["essential", "privacy", "gaming"].includes(presetParam)) {
      return new Set(tweaksInPreset(presetParam as PresetKey).map((tw) => tw.id));
    }
    return new Set(selectParam && CATALOG.some((tw) => tw.id === selectParam) ? [selectParam] : []);
  }, [presetParam, selectParam]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected = picked ?? fromQuery;
  const setSelected = (next: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    setPicked((prev) => (typeof next === "function" ? next(prev ?? fromQuery) : next));
  const [isAdmin, setIsAdmin]   = useState<boolean | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [notification, setNotification] = useState<{ type: "success"|"error"|"info"; msg: string } | null>(null);

  // Names and presets come from the shared catalog (also used by the Home search).
  const TWEAKS: TweakDef[] = CATALOG.map((tw) => ({
    id: tw.id,
    name: tw.name[language],
    description: tw.description[language],
    column: tw.group,
    preset: tw.presets,
  }));

  const COLUMNS: { key: TweakDef["column"]; label: string; icon: React.ElementType }[] = [
    { key: "privacy",     label: t("tweaks.categories.privacy"),     icon: Shield },
    { key: "performance", label: t("tweaks.categories.performance"), icon: Zap },
    { key: "interface",   label: t("tweaks.categories.interface"),   icon: Monitor },
    { key: "system",      label: t("tweaks.categories.system"),      icon: Settings },
  ];

  const PRESET_ICON = { essential: Sparkles, privacy: ShieldCheck, gaming: Gamepad2 } as const;
  const PRESETS = PRESET_DEFS.map((p) => ({ key: p.key, label: p.name[language], icon: PRESET_ICON[p.key] }));

  useEffect(() => {
    invoke("check_admin").then((v) => setIsAdmin(v as boolean)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(t);
  }, [notification]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const applyPreset = (key: PresetKey) => {
    const ids = TWEAKS.filter((t) => t.preset?.includes(key)).map((t) => t.id);
    setSelected(new Set(ids));
  };

  const openSystemRestore = async () => {
    try {
      await invoke("apply_tweak", { id: "open_system_restore" });
    } catch (err) {
      setNotification({ type: "error", msg: String(err) });
    }
  };

  const applySelected = async () => {
    if (!isAdmin) {
      setNotification({ type: "error", msg: "Admin privileges required." });
      return;
    }
    setIsApplying(true);
    // The restore point must exist before anything changes, so it runs first
    // and a failure stops the batch.
    const withRestorePoint = selected.has("create_restore_point");
    if (withRestorePoint) {
      try {
        await invoke("create_restore_point");
      } catch (e) {
        setIsApplying(false);
        setNotification({ type: "error", msg: `Restore point failed, nothing was changed. ${e}` });
        return;
      }
    }
    const ids = [...selected].filter((id) => id !== "create_restore_point");
    const failed: string[] = [];
    for (const id of ids) {
      try { await invoke("apply_tweak", { id }); }
      catch { failed.push(id); }
    }
    setIsApplying(false);
    const names = failed.map((id) => TWEAKS.find((tw) => tw.id === id)?.name ?? id);
    const restoreNote = withRestorePoint ? " Restore point created." : "";
    setNotification(failed.length === 0
      ? { type: "success", msg: `${ids.length} tweak(s) applied.${restoreNote}` }
      : { type: "error", msg: `${ids.length - failed.length} applied, ${failed.length} failed: ${names.join(", ")}.` });
    recordActivity({
      label: t("history.tweaks"),
      detail: failed.length ? `${fmt(t("history.n_of_m"), { n: ids.length - failed.length, m: ids.length })} · ${names.join(", ")} ${t("history.failed")}` : String(ids.length),
      status: failed.length ? "failed" : "ok",
      href: "/tweaks",
    });
    // Failed tweaks stay selected so they can be retried.
    setSelected(new Set(failed));
  };

  const createRestorePoint = async () => {
    setNotification({ type: "info", msg: "Creating restore point..." });
    try {
      const msg: string = await invoke("create_restore_point");
      setNotification({ type: "success", msg });
    } catch (e) {
      setNotification({ type: "error", msg: String(e) });
    }
  };

  return (
    <div className="checklist-page fade-in">
      <PageHeader 
        title={t("tabs.tweaks")} 
        description={t("tweaks.subtitle")}
        compact={true}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(TWEAKS.map(t => t.id)))}>
            <CheckCheck size={14} />
          </button>
          
          <div className="topbar-divider" />

          <button className="btn btn-secondary btn-sm" onClick={createRestorePoint}>
            <RotateCcw size={14} />
          </button>

          <button
            className="btn btn-sm btn-primary"
            style={{ height: 32 }}
            onClick={applySelected}
            disabled={selected.size === 0 || isApplying}
          >
            {isApplying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                <Play size={14} />
                {selected.size > 0 && <span className="badge-count-elite">{selected.size}</span>}
              </>
            )}
          </button>
        </div>
      </PageHeader>

      {isAdmin === false && (
        <div className="admin-banner glass-panel" style={{ marginBottom: 24, borderRadius: 'var(--r-md)' }}>
          <ShieldAlert size={14} />
          <span>{t("dashboard.admin_warn")}</span>
        </div>
      )}

      <div className="preset-strip">
        <button className="preset-btn preset-btn-warning" onClick={openSystemRestore}>
          <LifeBuoy size={14} /> {t("tweaks.restore_btn")}
        </button>
        {PRESETS.map((p) => (
          <button key={p.key} className="preset-btn" onClick={() => applyPreset(p.key)}>
            <p.icon size={14} strokeWidth={1.75} aria-hidden="true" /> {p.label}
          </button>
        ))}
      </div>

      <div className="elite-columns">
        {COLUMNS.map(({ key, label, icon: Icon }) => {
          const tweaks = TWEAKS.filter((t) => t.column === key);
          const colSelected = tweaks.filter((t) => selected.has(t.id)).length;

          return (
            <div key={key} className="category-col">
              <div className="category-header">
                <div className="category-title">
                  <Icon size={13} />
                  {label}
                </div>
                {colSelected > 0 && <span className="badge-count-elite">{colSelected}</span>}
              </div>

              {tweaks.map((tweak) => (
                <TweakRow
                  key={tweak.id}
                  tweak={tweak}
                  isSelected={selected.has(tweak.id)}
                  onToggle={() => toggle(tweak.id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {notification && (
        <div className={`toast toast-${notification.type} glass-panel fade-in`} role="status" aria-live="polite">
          <span>{notification.msg}</span>
        </div>
      )}
    </div>
  );
}
