"use client";

import { useState } from "react";
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { readControl, setFeature, setUpdateMode, useControl } from "@/hooks/useControl";
import { FEATURES, UPDATE_MODES, type UpdateModeDef } from "@/lib/control";
import type { Risk } from "@/lib/tweaks-catalog";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";

export default function ControlPage() {
  const { t, language } = useLanguage();
  const { update, features, readError, busy, errors, requested } = useControl();
  const [confirmMode, setConfirmMode] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());

  const time = (at: number) => new Date(at).toLocaleTimeString(language === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" });

  const access = (risk: Risk, extra?: string) => (
    <span className={styles.access}>
      <span title={t("tw.scope_machine_hint")}>{t("tw.scope_machine")}</span>
      <span className={risk === "risky" ? styles.riskRisky : risk === "moderate" ? styles.riskModerate : undefined}>
        {risk !== "safe" && <TriangleAlert size={12} aria-hidden="true" />}
        {t(`tw.risk_${risk}`)}
      </span>
      {extra && <span>{extra}</span>}
    </span>
  );

  // Windows servicing errors people actually hit, in words; the raw text stays under details.
  const reason = (msg: string) => {
    if (/0x800f081f|0x800f0950|0x800f0954|source files could not be found/i.test(msg)) return t("ct.err_source");
    if (/elevat|administrator|0x80070005|access is denied|acesso negado/i.test(msg)) return t("ct.err_admin");
    if (/restore point/i.test(msg)) return t("ct.err_restore");
    return "";
  };

  const failure = (target: string) => {
    const err = errors[target];
    if (!err) return null;
    return (
      <>
        <p className={styles.error} role="alert">
          <TriangleAlert size={14} aria-hidden="true" />
          {fmt(t("ct.failed_at"), { time: time(err.at) })} {reason(err.msg)}
          <button type="button" onClick={() => setShowRaw((p) => { const n = new Set(p); if (n.has(target)) n.delete(target); else n.add(target); return n; })}>
            {t("tw.see_details")}
          </button>
        </p>
        {showRaw.has(target) && <pre className={styles.raw}>{err.msg}</pre>}
      </>
    );
  };

  const pickMode = (m: UpdateModeDef) => {
    if (m.risk === "risky" && confirmMode !== m.id) {
      setConfirmMode(m.id);
      return;
    }
    setConfirmMode(null);
    void setUpdateMode(m.id, m.risk === "risky");
  };

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("ct.title")}</h1>
            <p className={styles.lede}>{t("ct.lede")}</p>
          </div>
        </header>

        {!update && !readError && (
          <p className={styles.status} role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />{t("ct.reading")}</p>
        )}
        {readError && (
          <div className={styles.status} role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("ct.read_failed")}
            <button type="button" className="btn btn-sm" onClick={readControl}><RotateCw size={13} aria-hidden="true" /> {t("tw.retry_read")}</button>
          </div>
        )}

        {update && (
          <section className={styles.group} aria-labelledby="ct-updates">
            <div className={styles.groupHead}>
              <h2 id="ct-updates">{t("ct.updates")}</h2>
              <span>{update.edition ? fmt(t("ct.edition"), { e: update.edition }) : ""}</span>
            </div>
            {update.mode === "custom" && <p className={styles.reason} style={{ margin: "0 4px 10px" }}>{t("ct.custom")}</p>}
            <ul className={styles.list}>
              {UPDATE_MODES.map((m) => {
                const current = update.mode === m.id;
                const blocked = m.id === "security" && !update.deferralSupported;
                const running = busy === `update:${m.id}`;
                return (
                  <li key={m.id} className={styles.row}>
                    <div className={`${styles.appLine} ${styles.appLineNoCheck}`}>
                      <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                        <b>{m.name[language]}</b>
                        <small>{blocked ? t("ct.home_no_security") : m.description[language]}</small>
                        {access(m.risk)}
                      </div>
                      <span className={styles.tagSlot}>
                        {running ? (
                          <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("ct.applying")}</span>
                        ) : current ? (
                          <span className="tag on">{t("ct.current")}</span>
                        ) : null}
                      </span>
                      <div className={styles.rowActions}>
                        {!current && !running && (
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => pickMode(m)} disabled={blocked || busy !== null}>
                            {t("ct.use")}
                          </button>
                        )}
                      </div>
                    </div>
                    {confirmMode === m.id && !running && (
                      <p className={`${styles.confirm} ${styles.confirmRisky}`} role="alert">
                        <TriangleAlert size={14} aria-hidden="true" />
                        <span className={styles.confirmText}>{fmt(t("ct.risky_confirm"), { note: m.riskNote?.[language] ?? "" })}</span>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => pickMode(m)}>{t("ct.use")}</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmMode(null)}>{t("tw.risky_no")}</button>
                      </p>
                    )}
                    {m.riskNote && confirmMode !== m.id && !blocked && (
                      <p className={`${styles.riskNote} ${m.risk === "risky" ? styles.riskRisky : styles.riskModerate}`} style={{ margin: "-4px 18px 12px" }}>
                        <TriangleAlert size={13} aria-hidden="true" />
                        {m.riskNote[language]}
                      </p>
                    )}
                    {failure(`update:${m.id}`)}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {features && (
          <section className={styles.group} aria-labelledby="ct-features">
            <div className={styles.groupHead}>
              <h2 id="ct-features">{t("ct.features")}</h2>
              <span>{fmt(t("ct.n_on"), { n: features.features.filter((f) => f.status === "enabled").length, m: features.features.length })}</span>
            </div>
            {features.restartPending && (
              <p className={styles.reason} role="status" style={{ margin: "0 4px 10px" }}>{t("ct.restart_pending")}</p>
            )}
            <ul className={styles.list}>
              {FEATURES.map((f) => {
                const st = features.features.find((x) => x.name === f.name)?.status ?? "unavailable";
                const running = busy === `feature:${f.name}`;
                // Asked for, not yet what Windows reports: it finishes on restart.
                const waiting = features.restartPending && f.name in requested && requested[f.name] !== (st === "enabled");
                const toggle = () => {
                  if (st === "enabled" && f.offNote && confirmOff !== f.name) {
                    setConfirmOff(f.name);
                    return;
                  }
                  setConfirmOff(null);
                  void setFeature(f.name, st !== "enabled");
                };
                return (
                  <li key={f.name} className={styles.row}>
                    <div className={`${styles.appLine} ${styles.appLineNoCheck}`}>
                      <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                        <b>{f.title[language]}</b>
                        <small>{f.description[language]}</small>
                        {access(f.risk, t("ct.needs_restart"))}
                      </div>
                      <span className={styles.tagSlot}>
                        {running ? (
                          <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("ct.working")}</span>
                        ) : waiting ? (
                          <span className="tag pending">{t(requested[f.name] ? "ct.on_at_restart" : "ct.off_at_restart")}</span>
                        ) : st === "enabled" ? (
                          <span className="tag on">{t("tw.st_active")}</span>
                        ) : st === "disabled" ? (
                          <span className="tag off">{t("ct.off")}</span>
                        ) : (
                          <span className="tag off">{t("ct.unavailable")}</span>
                        )}
                      </span>
                      <div className={styles.rowActions}>
                        {!running && !waiting && st !== "unavailable" && confirmOff !== f.name && (
                          <button type="button" className={`btn btn-sm ${st === "enabled" ? "btn-ghost" : "btn-secondary"}`} onClick={toggle} disabled={busy !== null}>
                            {st === "enabled" ? t("ct.turn_off") : t("ct.turn_on")}
                          </button>
                        )}
                      </div>
                    </div>
                    {running && <p className={styles.reason} style={{ margin: "-4px 18px 12px" }}>{t("ct.working_note")}</p>}
                    {confirmOff === f.name && !running && (
                      <p className={styles.confirm} role="alert">
                        <TriangleAlert size={14} aria-hidden="true" />
                        <span className={styles.confirmText}>{f.offNote?.[language]}</span>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={toggle}>{t("ct.turn_off")}</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmOff(null)}>{t("tw.risky_no")}</button>
                      </p>
                    )}
                    {f.riskNote && !running && (
                      <p className={`${styles.riskNote} ${styles.riskModerate}`} style={{ margin: "-4px 18px 12px" }}>
                        <TriangleAlert size={13} aria-hidden="true" />
                        {f.riskNote[language]}
                      </p>
                    )}
                    {failure(`feature:${f.name}`)}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
