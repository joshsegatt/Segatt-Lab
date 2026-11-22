"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, Gamepad2, Package, ShieldCheck, SlidersHorizontal, Trash2, Wrench, LayoutGrid, Sparkles,
  Activity, BellOff, Cpu, EyeOff, File, FileX, FolderOpen, Gauge, Globe, History, MapPinOff, Megaphone,
  Monitor, MousePointer2, Moon, Network, Power, RefreshCw, Search, Timer, Wifi, Mic, Zap, TriangleAlert,
} from "lucide-react";
import { TWEAKS, type Risk } from "@/lib/tweaks-catalog";
import { useLanguage } from "@/hooks/useLanguage";
import { useTweakStates } from "@/hooks/useTweakStates";
import { findInstalled, useApps } from "@/hooks/useApps";
import { useHardware } from "@/hooks/useHardware";
import screen from "@/components/ui/Screen.module.css";
import { flattenResult, searchActions, type Action, type ActionKind } from "@/lib/search";
import { fmt } from "@/lib/fmt";
import { buildActions } from "./actions";
import { useLevel } from "@/hooks/useLevel";
import styles from "./Home.module.css";

const KIND_ICON: Record<ActionKind, typeof Package> = {
  preset: Gamepad2,
  tweak: SlidersHorizontal,
  app: Package,
  cleanup: Trash2,
  fix: Wrench,
  screen: LayoutGrid,
};

// One icon per tweak, so a list of results is scannable at a glance.
const TWEAK_ICON: Record<string, typeof Package> = {
  disable_telemetry: Activity, disable_cortana: Mic, disable_activity_feed: History, remove_bing_search: Search,
  disable_location: MapPinOff, disable_advertising_id: Megaphone, disable_wifi_sense: Wifi, disable_feedback: BellOff,
  high_performance_plan: Zap, optimize_hpet: Timer, disable_game_bar: Gamepad2, disable_superfetch: Cpu,
  disable_search_indexing: FolderOpen, disable_visual_fx: Gauge, set_dns_cloudflare: Globe, dark_mode: Moon,
  classic_context_menu: MousePointer2, show_file_extensions: File, show_hidden_files: EyeOff,
  disable_mouse_accel: MousePointer2, enable_long_paths: FileX, enable_f8_boot: Power,
  disable_fast_startup: Power, disable_windows_update: RefreshCw, create_restore_point: ShieldCheck,
};

function iconFor(a: Action) {
  if (a.kind === "tweak") return TWEAK_ICON[a.id.slice("tweak:".length)] ?? SlidersHorizontal;
  if (a.kind === "fix" && a.id === "fix:net") return Network;
  if (a.kind === "screen" && a.id === "screen:control") return Monitor;
  return KIND_ICON[a.kind];
}

function TweakTag({ status, risk }: { status?: string; risk: Risk }) {
  const { t } = useLanguage();
  const tag =
    status === "active" ? <span className="tag on">{t("tw.st_active")}</span>
    : status === "inactive" ? <span className="tag off">{t("tw.st_inactive")}</span>
    : status === "unknown" ? <span className="tag off">{t("tw.st_unknown")}</span>
    : null;
  return (
    <span className={`${styles.itemTag} ${styles.tagGroup}`}>
      {risk !== "safe" && (
        <span className={`${styles.riskWord} ${risk === "risky" ? screen.riskRisky : screen.riskModerate}`}>
          <TriangleAlert size={12} aria-hidden="true" />
          {t(`tw.risk_${risk}`)}
        </span>
      )}
      {tag}
    </span>
  );
}

function AppTag({ app }: { app?: { version: string; available: string | null } }) {
  const { t } = useLanguage();
  if (!app) return null;
  // Same idiom as the Apps screen: old version struck, new one in jade.
  if (app.available)
    return (
      <span className={`${screen.values} ${styles.itemTag}`} aria-label={`${app.version} → ${app.available}`}>
        <s aria-hidden="true">{app.version}</s>
        <span aria-hidden="true">→</span>
        <b aria-hidden="true">{app.available}</b>
      </span>
    );
  return <span className={`tag on ${styles.itemTag}`}>{fmt(t("ap.tag_installed"), { v: app.version })}</span>;
}

export function Composer() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { states } = useTweakStates();
  const { installed } = useApps();

  const { hw } = useHardware();
  const { level } = useLevel();
  const actions = useMemo(() => buildActions(language, t, states, hw, level), [language, t, states, hw, level]);
  const result = useMemo(() => searchActions(query, actions), [query, actions]);
  const flat = useMemo(() => flattenResult(result), [result]);
  const open = query.trim().length > 0;
  const current = flat[Math.min(active, flat.length - 1)];

  // Keep the keyboard selection visible when the list scrolls.
  const currentId = open && current ? `${listId}-${current.id}` : null;
  useEffect(() => {
    if (currentId) document.getElementById(currentId)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  const go = (action: Action | undefined) => {
    if (action) router.push(action.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter also confirms an IME candidate (Chinese, Japanese, Korean): let it finish the word.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" && flat.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp" && flat.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(current);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  const optionId = (a: Action) => `${listId}-${a.id}`;
  const renderItem = (a: Action, lead = false) => {
    const Icon = iconFor(a);
    const selected = a === current;
    return (
      <li
        key={a.id}
        id={optionId(a)}
        role="option"
        aria-selected={selected}
        className={`${styles.item} ${lead ? styles.lead : ""} ${selected ? styles.selected : ""}`}
        onMouseEnter={() => setActive(flat.indexOf(a))}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => go(a)}
      >
        <span className={styles.itemIcon} aria-hidden="true"><Icon size={16} strokeWidth={1.75} /></span>
        <span className={styles.itemText}>
          <b>{a.title}</b>
          <small>{a.subtitle}</small>
        </span>
        {lead && <span className="kbd">Enter</span>}
        {a.kind === "tweak" && <TweakTag status={states?.[a.id.slice("tweak:".length)]?.status} risk={TWEAKS.find((tw) => `tweak:${tw.id}` === a.id)?.risk ?? "safe"} />}
        {a.kind === "app" && <AppTag app={findInstalled(installed, a.id.slice("app:".length))} />}
      </li>
    );
  };

  return (
    <div className={styles.composerWrap}>
      <div className={styles.composer} onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("home.placeholder")}
          aria-label={t("home.title")}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && current ? optionId(current) : undefined}
          aria-autocomplete="list"
          autoFocus
          spellCheck={false}
        />
        <div className={styles.composerRow}>
          <span className={styles.note}>
            <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
            {t("home.restore_chip")}
          </span>
          <button
            type="button"
            className={styles.send}
            onClick={() => go(current)}
            disabled={!current}
            aria-label={t("home.send")}
            title={t("home.send")}
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {open && (
        <div className={styles.results}>
          {result.total === 0 ? (
            <div className={styles.empty} role="status">
              <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
              <div>
                <b>{fmt(t("home.no_results"), { q: query.trim() })}</b>
                <small>{t("home.no_results_hint")}</small>
              </div>
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label={t("home.title")} className={`${styles.list} ${styles.scroll}`}>
              {result.lead && renderItem(result.lead, true)}
              {result.groups.map((g) => (
                <li key={g.kind} role="presentation">
                  <div className={styles.groupLabel} aria-hidden="true">{t(`home.group_${g.kind}`)}</div>
                  <ul role="group" aria-label={t(`home.group_${g.kind}`)} className={styles.list}>
                    {g.items.map((a) => renderItem(a))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.foot} aria-hidden="true">
            <span><span className="kbd">↑</span> <span className="kbd">↓</span> {t("home.hint_nav")}</span>
            <span><span className="kbd">Enter</span> {t("home.hint_open")}</span>
            <span><span className="kbd">Esc</span> {t("home.hint_close")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
