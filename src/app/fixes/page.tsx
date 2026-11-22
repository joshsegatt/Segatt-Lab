"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { useLevel } from "@/hooks/useLevel";
import { runFix, useFixes, type FixOutcome } from "@/hooks/useFixes";
import { FIXES, PANELS, fixReason } from "@/lib/fixes";
import { riskOfAction } from "@/lib/action-risk";
import { showsAction } from "@/lib/level";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";
import { localeTag, localize } from "@/lib/i18n";

const TAG: Record<FixOutcome, [string, string]> = {
  clean: ["on", "fx.tag_clean"],
  repaired: ["on", "fx.tag_repaired"],
  unrepaired: ["bad", "fx.tag_unrepaired"],
  done: ["on", "fx.tag_done"],
};

export default function FixesPage() {
  const { t, language } = useLanguage();
  const admin = useIsAdmin();
  const { level } = useLevel();
  const { running, startedAt, results } = useFixes();
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const [panelError, setPanelError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Results older than this screen do not flash again on every visit.
  const [openedAt] = useState(() => Date.now());

  // The elapsed time on the running row, refreshed every 15 s.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [running]);

  const listed = FIXES.filter((f) => showsAction(level, riskOfAction(f.id).risk));
  const time = (at: number) => new Date(at).toLocaleTimeString(localeTag(language), { hour: "2-digit", minute: "2-digit" });
  const toggleRaw = (id: string) => setShowRaw((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const start = async (id: string, name: string) => {
    const r = await runFix(id);
    if (!r) return;
    recordActivity(
      r.status === "done"
        ? { label: name, detail: t(TAG[r.outcome][1]), status: r.outcome === "unrepaired" ? "failed" : "ok", href: "/fixes" }
        : { label: name, detail: t("history.failed"), status: "failed", href: "/fixes" },
    );
  };

  const openPanel = (cmd: string) => {
    setPanelError(null);
    invoke("open_legacy_panel", { panel: cmd }).catch((e) => setPanelError(String(e)));
  };

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("fx.title")}</h1>
            <p className={styles.lede}>{t("fx.lede")}</p>
          </div>
        </header>

        {admin === false && <p className={styles.reason} style={{ margin: "18px 4px 0" }} role="status">{t("fx.not_admin")}</p>}

        <section className={styles.group} aria-labelledby="fx-repairs">
          <div className={styles.groupHead}><h2 id="fx-repairs">{t("fx.repairs")}</h2></div>
          <ul className={styles.list}>
            {listed.map((f) => {
              const risk = riskOfAction(f.id);
              const r = results[f.id];
              const isRunning = running === f.id;
              // `now` may predate the start until the first tick: never below zero.
              const minutes = isRunning && startedAt ? Math.max(0, Math.floor((now - startedAt) / 60_000)) : 0;
              return (
                <li key={f.id} className={`${styles.row} ${r?.status === "done" && r.at > openedAt ? styles.flash : ""}`}>
                  <div className={`${styles.appLine} ${styles.appLineNoCheck}`}>
                    <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                      <b>{localize(f.name, language)}</b>
                      <small>{localize(f.description, language)}</small>
                      <span className={styles.access}>
                        <span className={risk.risk === "moderate" ? styles.riskModerate : risk.risk === "risky" ? styles.riskRisky : undefined}>
                          {risk.risk !== "safe" && <TriangleAlert size={12} aria-hidden="true" />}
                          {t(`tw.risk_${risk.risk}`)}
                        </span>
                        <span>{localize(f.takes, language)}</span>
                      </span>
                    </div>
                    <span className={styles.tagSlot}>
                      {isRunning ? (
                        <span className="tag pending">
                          <Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;
                          {minutes > 0 ? fmt(t("fx.running_for"), { n: minutes }) : t("fx.running")}
                        </span>
                      ) : r?.status === "failed" ? (
                        <span className="tag bad">{t("tw.st_failed")}</span>
                      ) : r?.status === "done" ? (
                        <span className={`tag ${TAG[r.outcome][0]}`}>{t(TAG[r.outcome][1])}</span>
                      ) : null}
                    </span>
                    <div className={styles.rowActions}>
                      {!isRunning && (
                        <button type="button" className={`btn btn-sm ${r ? "btn-ghost" : "btn-secondary"}`} onClick={() => void start(f.id, localize(f.name, language))} disabled={running !== null}>
                          {r ? t("fx.run_again") : t("fx.run")}
                        </button>
                      )}
                    </div>
                  </div>
                  {risk.note && !r && !isRunning && (
                    <p className={`${styles.riskNote} ${styles.riskModerate}`} style={{ margin: "-4px 18px 12px" }}>
                      <TriangleAlert size={13} aria-hidden="true" />{localize(risk.note, language)}
                    </p>
                  )}
                  {isRunning && <p className={styles.reason} style={{ margin: "-4px 18px 12px" }}>{t("fx.running_note")}</p>}
                  {r?.status === "done" && !isRunning && (
                    <>
                      <p className={styles.reason} style={{ margin: "-4px 18px 12px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                        <span>{t(r.outcome === "done" ? `fx.done_${f.id}` : `fx.note_${r.outcome}`)}{r.restart ? ` ${t("fx.note_restart")}` : ""}</span>
                        {r.details && level !== "beginner" && <button type="button" className={styles.linkBtn} onClick={() => toggleRaw(f.id)}>{t("tw.see_details")}</button>}
                      </p>
                      {showRaw.has(f.id) && <pre className={styles.raw}>{r.details}</pre>}
                    </>
                  )}
                  {r?.status === "failed" && !isRunning && (
                    <>
                      <p className={styles.error} role="alert">
                        <TriangleAlert size={14} aria-hidden="true" />
                        {fmt(t("fx.failed_at"), { time: time(r.at) })} {fixReason(r.msg, admin) ? t(fixReason(r.msg, admin)!) : ""}
                        {level !== "advanced" && <button type="button" onClick={() => toggleRaw(f.id)}>{t("tw.see_details")}</button>}
                      </p>
                      {(showRaw.has(f.id) || level === "advanced") && <pre className={styles.raw}>{r.msg}</pre>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.group} aria-labelledby="fx-panels">
          <div className={styles.groupHead}><h2 id="fx-panels">{t("fx.panels")}</h2><span>{t("fx.panels_note")}</span></div>
          <ul className={`${styles.list} ${styles.panelGrid}`}>
            {PANELS.map((p) => (
              <li key={p.cmd}>
                <button type="button" className={styles.panelBtn} onClick={() => openPanel(p.cmd)}>
                  {localize(p.name, language)}
                  <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {panelError && <p className={styles.error} role="alert" style={{ margin: "10px 4px 0" }}><TriangleAlert size={14} aria-hidden="true" />{t("fx.panel_failed")}</p>}
        </section>
      </div>
    </div>
  );
}
