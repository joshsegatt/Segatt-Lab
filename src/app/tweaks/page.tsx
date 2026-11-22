"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cpu, LifeBuoy, Loader2, RotateCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useQueryParam } from "@/hooks/useQueryParam";
import { useIsAdmin } from "@/hooks/useSystem";
import { applyTweaks, explainTweakError, refreshTweakStates, useTweakStates, type TweakState } from "@/hooks/useTweakStates";
import { PRESETS, TWEAKS, type PresetKey, type TweakGroup } from "@/lib/tweaks-catalog";
import { hardwareHint, presetForPc, type Hardware } from "@/lib/hardware";
import { useHardware } from "@/hooks/useHardware";
import { normalize } from "@/lib/search";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";

const GROUPS: TweakGroup[] = ["performance", "privacy", "interface", "system"];
type Pending = Record<string, boolean>;

function presetPending(key: PresetKey, states: Record<string, TweakState> | null, hw: Hardware | null): Pending {
  return Object.fromEntries(
    presetForPc(key, hw)
      .filter((tw) => states?.[tw.id]?.status !== "active")
      .map((tw) => [tw.id, true]),
  );
}

export default function TweaksPage() {
  const { t, language } = useLanguage();
  const { states, loading, error } = useTweakStates();
  const { hw } = useHardware();
  const admin = useIsAdmin();
  const presetParam = useQueryParam("preset") as PresetKey | null;
  const selectParam = useQueryParam("select");

  const [pendingOverride, setPending] = useState<Pending | null>(null);
  const [preset, setPreset] = useState<PresetKey | "current" | "custom" | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, { msg: string; at: number }>>({});
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [busyNote, setBusyNote] = useState<string | null>(null);
  const [restoreFirst, setRestoreFirst] = useState(true);
  const [confirmRisky, setConfirmRisky] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  // Arriving from the Home search: ?preset=gaming marks that preset, ?select=<id> opens that row.
  const validPreset = presetParam && PRESETS.some((p) => p.key === presetParam) ? presetParam : null;
  const activePreset = preset ?? validPreset ?? "current";
  // A preset chosen before the hardware report arrived drops what the rules leave out;
  // a tweak the user switched on by hand (custom) stays.
  const pending: Pending = Object.fromEntries(
    Object.entries(pendingOverride ?? (validPreset ? presetPending(validPreset, states, hw) : {})).filter(
      ([id, on]) => !(on && activePreset !== "custom" && hardwareHint(id, hw)?.skip),
    ),
  );
  const isOpen = (id: string) => open.has(id) || (selectParam === id && !open.has(`-${id}`));

  // Bring the row picked in the Home search into view once, not on every state update.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!selectParam || scrolledTo.current === selectParam) return;
    const row = document.getElementById(`tweak-${selectParam}`);
    if (row) {
      row.scrollIntoView({ block: "center" });
      scrolledTo.current = selectParam;
    }
  }, [selectParam, states]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return TWEAKS.filter((tw) => !q || normalize(`${tw.name[language]} ${tw.description[language]} ${tw.keywords ?? ""}`).includes(q));
  }, [query, language]);

  const isActive = (id: string) => states?.[id]?.status === "active";
  const target = (id: string) => (id in pending ? pending[id] : isActive(id));

  const riskOf = (id: string) => TWEAKS.find((tw) => tw.id === id)?.risk ?? "safe";

  const toggle = (id: string, confirmed = false) => {
    const next = { ...pending };
    const want = !target(id);
    // Turning on a risky tweak waits for a confirmation on its own row.
    if (want && !confirmed && riskOf(id) === "risky") {
      setConfirmRisky(id);
      return;
    }
    setConfirmRisky(null);
    if (want === isActive(id)) delete next[id];
    else next[id] = want;
    setPending(next);
    setPreset("custom");
  };

  const choosePreset = (key: PresetKey | "current") => {
    setConfirmRisky(null);
    setPreset(key);
    setPending(key === "current" ? {} : presetPending(key, states, hw));
  };

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      const shown = isOpen(id);
      next.delete(id);
      next.delete(`-${id}`);
      if (!shown) next.add(id);
      else if (selectParam === id) next.add(`-${id}`);
      return next;
    });

  const run = async (entries: [string, boolean][]) => {
    if (!entries.length) return;
    // A risky change always gets a restore point, whatever the checkbox says.
    if (restoreFirst || entries.some(([id, on]) => on && riskOf(id) === "risky")) {
      setBusyNote(t("tw.creating_restore"));
      try {
        await invoke("create_restore_point");
      } catch (e) {
        setBusyNote(null);
        setToast({ kind: "error", msg: fmt(t("tw.restore_failed"), { msg: String(e) }) });
        return;
      }
    }
    setBusyNote(null);
    const failed = await applyTweaks(entries, setWorking);
    setErrors((prev) => {
      const next = { ...prev };
      for (const [id] of entries) delete next[id];
      return { ...next, ...failed };
    });
    setPending(Object.fromEntries(Object.entries(pending).filter(([id]) => failed[id] || !entries.some(([e]) => e === id))));

    const ok = entries.length - Object.keys(failed).length;
    const names = Object.keys(failed).map((id) => TWEAKS.find((tw) => tw.id === id)?.name[language] ?? id);
    setToast(
      ok === entries.length
        ? { kind: "success", msg: fmt(t("tw.done_all"), { n: ok }) }
        : { kind: "error", msg: fmt(t("tw.done_some"), { ok, n: entries.length }) },
    );
    recordActivity({
      label: ok === 0 ? t("history.tweaks_none") : t("history.tweaks"),
      detail: names.length ? `${fmt(t("history.n_of_m"), { n: ok, m: entries.length })} · ${names.join(", ")} ${t("history.failed")}` : String(ok),
      status: names.length ? "failed" : "ok",
      href: "/tweaks",
    });
  };

  // The engine reports a few plain English words (states, labels); show them translated.
  const word = (value: string) => {
    if (value === "—") return t("tw.unset");
    const key = `tw.v.${value.replace(/[^a-z]/gi, "_").toLowerCase()}`;
    const translated = t(key);
    return translated === key ? value : translated;
  };

  const explain = (msg: string) => explainTweakError(msg, t);

  const pendingEntries = Object.entries(pending);
  const busy = working !== null || busyNote !== null;
  const restartCount = pendingEntries.filter(([id]) => states?.[id]?.restart).length;
  const restoreForced = pendingEntries.some(([id, on]) => on && riskOf(id) === "risky");

  const tagFor = (id: string) => {
    if (working === id) return <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("tw.st_working")}</span>;
    if (errors[id] && id in pending) return <span className="tag bad">{t("tw.st_failed")}</span>;
    if (id in pending) return <span className="tag pending">{pending[id] ? t("tw.st_will_on") : t("tw.st_will_off")}</span>;
    const st = states?.[id]?.status;
    if (st === "active") return <span className="tag on">{t("tw.st_active")}</span>;
    if (st === "inactive") return <span className="tag off">{t("tw.st_inactive")}</span>;
    if (st === "unknown") return <span className="tag off" title={states?.[id]?.reason ?? undefined}>{t("tw.st_unknown")}</span>;
    return null;
  };

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("tw.title")}</h1>
            <p className={styles.lede}>{t("tw.lede")}</p>
          </div>
        </header>

        <div className={styles.tools}>
          <div className={styles.seg} role="radiogroup" aria-label={t("tw.title")}>
            {(["current", "essential", "gaming", "privacy", "custom"] as const).map((key) => (
              key === "custom" ? (
                <button key={key} type="button" role="radio" aria-checked={activePreset === key} aria-disabled="true" tabIndex={-1}
                  className={activePreset === key ? styles.segOn : styles.segPassive}>
                  {t("tw.preset_custom")}
                </button>
              ) : (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={activePreset === key}
                className={activePreset === key ? styles.segOn : undefined}
                onClick={() => choosePreset(key)}
                disabled={!states || busy}
              >
                {key === "current" ? t("tw.preset_current") : PRESETS.find((p) => p.key === key)?.name[language]}
              </button>
              )
            ))}
          </div>
          <label className={styles.search}>
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("tw.search")} aria-label={t("tw.search")} spellCheck={false} />
          </label>
          <button type="button" className="icon-btn" onClick={() => invoke("open_system_restore").catch(() => undefined)} aria-label={t("tw.system_restore")} title={t("tw.system_restore")}>
            <LifeBuoy size={17} strokeWidth={1.75} />
          </button>
        </div>

        {!states && loading && (
          <p className={styles.status} role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />{t("tw.reading")}</p>
        )}
        {!states && !loading && error && (
          <div className={styles.status} role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("tw.read_failed")}
            <button type="button" className="btn btn-sm" onClick={() => void refreshTweakStates()}>{t("tw.retry_read")}</button>
          </div>
        )}
        {visible.length === 0 && <p className={styles.status}>{fmt(t("tw.no_match"), { q: query.trim() })}</p>}

        {GROUPS.map((group) => {
          const items = visible.filter((tw) => tw.group === group);
          if (!items.length) return null;
          const all = TWEAKS.filter((tw) => tw.group === group);
          const activeCount = all.filter((tw) => isActive(tw.id)).length;
          return (
            <section key={group} className={styles.group} aria-labelledby={`g-${group}`}>
              <div className={styles.groupHead}>
                <h2 id={`g-${group}`}>{t(`tweaks.categories.${group}`)}</h2>
                {states && <span>{fmt(t("tw.n_active"), { n: activeCount, m: all.length })}</span>}
              </div>
              <ul className={styles.list}>
                {items.map((tw) => {
                  const st = states?.[tw.id];
                  const on = target(tw.id);
                  const expanded = isOpen(tw.id);
                  return (
                    <li key={tw.id} id={`tweak-${tw.id}`} className={`${styles.row} ${tw.id in pending ? styles.changed : ""} ${selectParam === tw.id ? styles.flash : ""}`}>
                      <div className={styles.line}>
                        <button type="button" className={styles.info} onClick={() => toggleOpen(tw.id)} aria-expanded={expanded} aria-controls={`d-${tw.id}`}>
                          <b>{tw.name[language]}</b>
                          <small>{tw.description[language]}</small>
                          <span className={styles.access}>
                            {st && <span title={t(`tw.scope_${st.scope}_hint`)}>{t(`tw.scope_${st.scope}`)}</span>}
                            <span className={tw.risk === "risky" ? styles.riskRisky : tw.risk === "moderate" ? styles.riskModerate : undefined}>
                              {tw.risk !== "safe" && <TriangleAlert size={12} aria-hidden="true" />}
                              {t(`tw.risk_${tw.risk}`)}
                            </span>
                            {hardwareHint(tw.id, hw)?.skip && (
                              <span className={styles.riskModerate}><Cpu size={12} aria-hidden="true" />{t("pc.not_for_pc")}</span>
                            )}
                          </span>
                        </button>
                        {tagFor(tw.id)}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={tw.name[language]}
                          className={`${styles.switch} ${on ? styles.switchOn : ""}`}
                          onClick={() => toggle(tw.id)}
                          disabled={!states || busy}
                        />
                      </div>
                      {confirmRisky === tw.id && (
                        <p className={`${styles.confirm} ${styles.confirmRisky}`} role="alert">
                          <TriangleAlert size={14} aria-hidden="true" />
                          <span className={styles.confirmText}>{fmt(t("tw.risky_confirm"), { note: tw.riskNote?.[language] ?? "" })}</span>
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => toggle(tw.id, true)}>{t("tw.risky_yes")}</button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRisky(null)}>{t("tw.risky_no")}</button>
                        </p>
                      )}
                      {errors[tw.id] && (
                        <p className={styles.error} role="alert">
                          <TriangleAlert size={14} aria-hidden="true" />
                          {fmt(t("tw.failed_at"), { time: new Date(errors[tw.id].at).toLocaleTimeString(language === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" }), msg: explain(errors[tw.id].msg) })}
                          <button type="button" onClick={() => setShowRaw((prev) => { const n = new Set(prev); if (n.has(tw.id)) n.delete(tw.id); else n.add(tw.id); return n; })}>
                            {t("tw.see_details")}
                          </button>
                          <button type="button" onClick={() => void run([[tw.id, target(tw.id)]])} disabled={busy}>
                            <RotateCw size={13} aria-hidden="true" /> {t("tw.retry")}
                          </button>
                        </p>
                      )}
                      {errors[tw.id] && showRaw.has(tw.id) && <pre className={styles.raw}>{errors[tw.id].msg}</pre>}
                      {expanded && (
                        <div id={`d-${tw.id}`} className={styles.detail}>
                          {st?.status === "unknown" && st.reason && <p className={styles.reason}>{st.reason}</p>}
                          {hardwareHint(tw.id, hw) && (
                            <p className={`${styles.riskNote} ${styles.riskModerate}`}>
                              <Cpu size={13} aria-hidden="true" />
                              {hardwareHint(tw.id, hw)!.note[language]}
                            </p>
                          )}
                          {tw.riskNote && (
                            <p className={`${styles.riskNote} ${tw.risk === "risky" ? styles.riskRisky : styles.riskModerate}`}>
                              <TriangleAlert size={13} aria-hidden="true" />
                              {tw.riskNote[language]}
                            </p>
                          )}
                          {st?.changes.map((c) => (
                            <div key={c.target} className={styles.change}>
                              <code>{c.target}</code>
                              <span className={styles.values} aria-label={`${t("tw.current")}: ${word(c.current)}. ${t("tw.wanted")}: ${word(c.wanted)}.`}>
                                {c.current === "—" ? <span aria-hidden="true">{word(c.current)}</span> : <s aria-hidden="true">{word(c.current)}</s>}
                                <span aria-hidden="true">→</span>
                                <b aria-hidden="true">{word(c.wanted)}</b>
                              </span>
                            </div>
                          ))}
                          <p className={styles.meta}>
                            <span>{st ? `${t(`tw.scope_${st.scope}_hint`)} ` : ""}{st?.restart ? t("tw.restart") : t("tw.no_restart")}</span>
                            <span>
                              {st && st.status !== "active" && st.changes.length === 1
                                ? st.changes[0].current === "—"
                                  ? t("tw.revert_to_default")
                                  : fmt(t("tw.revert_to"), { v: word(st.changes[0].current) })
                                : t("tw.revert_note")}
                            </span>
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {pendingEntries.length > 0 && (
        <div className={styles.dock} role="region" aria-label={t("tw.dock_apply")}>
          <div className={styles.dockInfo}>
          <span className={styles.dockCount}>{pendingEntries.length === 1 ? t("tw.dock_one") : fmt(t("tw.dock_changes"), { n: pendingEntries.length })}</span>
          <label className={styles.dockCheck}>
            <input type="checkbox" checked={restoreFirst || restoreForced} disabled={restoreForced} onChange={(e) => setRestoreFirst(e.target.checked)} />
            <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
            {t("tw.dock_restore")}
            {restoreForced && <span className={styles.dockForced}>{t("tw.dock_restore_forced")}</span>}
          </label>
          {restartCount > 0 && <span className={styles.dockNote}>{restartCount === 1 ? t("tw.dock_restart_one") : fmt(t("tw.dock_restart"), { n: restartCount })}</span>}
          {admin === false && <span className={styles.dockWarn}>{t("tw.dock_not_admin")}</span>}
          {busyNote && <span className={styles.dockNote} role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> {busyNote}</span>}
          </div>
          <button type="button" className="btn" onClick={() => { setPending({}); setPreset("current"); setConfirmRisky(null); }} disabled={busy}>{t("tw.dock_discard")}</button>
          <button type="button" className="btn btn-primary" onClick={() => void run(pendingEntries)} disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {t("tw.dock_apply")} {pendingEntries.length}
          </button>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.kind} ${pendingEntries.length ? styles.toastAbove : ""}`} role="status" aria-live="polite">{toast.msg}</div>
      )}
    </div>
  );
}
