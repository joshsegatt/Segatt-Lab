"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LifeBuoy, Loader2, RotateCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { useLevel } from "@/hooks/useLevel";
import { runCleanups, scanCleanup, useCleanup } from "@/hooks/useCleanup";
import { CLEANUPS, formatBytes, startsPicked } from "@/lib/cleanup";
import { riskOfAction } from "@/lib/action-risk";
import { showsAction } from "@/lib/level";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";
import { localeTag, localize } from "@/lib/i18n";

export default function CleanerPage() {
  const { t, language } = useLanguage();
  const admin = useIsAdmin();
  const { level } = useLevel();
  const { sizes, scanning, scanError, running, progress, restoring, results } = useCleanup();
  // null = the starting picks, derived from the sizes until the person changes one.
  const [pickedOverride, setPicked] = useState<Set<string> | null>(null);
  const [confirmRisky, setConfirmRisky] = useState<string | null>(null);
  const [restoreFirst, setRestoreFirst] = useState(true);
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // Risky cleanups wait for the Advanced level.
  const listed = CLEANUPS.filter((c) => showsAction(level, riskOfAction(c.id).risk));
  const hidden = CLEANUPS.length - listed.length;
  const picked = pickedOverride ?? new Set(sizes ? listed.filter((c) => startsPicked(c.id, sizes[c.id])).map((c) => c.id) : []);
  const chosen = listed.filter((c) => picked.has(c.id));
  const chosenBytes = chosen.reduce((sum, c) => sum + (sizes?.[c.id] ?? 0), 0);
  const total = listed.reduce((sum, c) => sum + (sizes?.[c.id] ?? 0), 0);
  const restoreForced = chosen.some((c) => riskOfAction(c.id).risk === "risky");
  const busy = running !== null || restoring;

  const flip = (id: string, confirmed = false) => {
    if (!picked.has(id) && riskOfAction(id).risk === "risky" && !confirmed) {
      setConfirmRisky(id);
      return;
    }
    setConfirmRisky(null);
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const run = async () => {
    const out = await runCleanups(chosen.map((c) => c.id), restoreFirst || restoreForced);
    if ("error" in out) {
      setToast({ kind: "error", msg: fmt(t("tw.restore_failed"), { msg: out.error }) });
      return;
    }
    setPicked(new Set());
    const size = formatBytes(out.freed, language);
    const one = out.failed === 1 ? "_one" : "";
    setToast(out.failed ? { kind: "error", msg: fmt(t(`cl.done_some${one}`), { size, n: out.failed }) } : { kind: "success", msg: fmt(t("cl.done"), { size }) });
    recordActivity({ label: t("cl.history"), detail: out.failed ? fmt(t(`cl.history_failed${one}`), { size, n: out.failed }) : size, status: out.failed ? "failed" : "ok", href: "/cleaner" });
  };

  const time = (at: number) => new Date(at).toLocaleTimeString(localeTag(language), { hour: "2-digit", minute: "2-digit" });
  const toggleRaw = (id: string) => setShowRaw((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("cl.title")}</h1>
            <p className={styles.lede}>{t("cl.lede")}</p>
          </div>
        </header>

        <div className={styles.tools}>
          <p className={styles.summary} role="status">
            {scanning && !sizes ? (
              <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> {t("cl.scanning")}</>
            ) : sizes ? (
              <>{t("cl.can_free")} <b>{formatBytes(total, language)}</b></>
            ) : null}
          </p>
          <button type="button" className="icon-btn" onClick={() => scanCleanup(true)} disabled={scanning || busy} aria-label={t("cl.rescan")} title={t("cl.rescan")}>
            {scanning ? <Loader2 size={17} className="animate-spin" /> : <RotateCw size={17} strokeWidth={1.75} />}
          </button>
          <button type="button" className="icon-btn" onClick={() => invoke("open_system_restore").catch(() => undefined)} aria-label={t("tw.system_restore")} title={t("tw.system_restore")}>
            <LifeBuoy size={17} strokeWidth={1.75} />
          </button>
        </div>

        {scanError && !sizes && (
          <div className={styles.status} role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("cl.scan_failed")}
            <button type="button" className="btn btn-sm" onClick={() => scanCleanup(true)}>{t("tw.retry_read")}</button>
          </div>
        )}

        <section className={styles.group} aria-label={t("cl.title")}>
          <ul className={styles.list}>
            {listed.map((c) => {
              const risk = riskOfAction(c.id);
              const bytes = sizes?.[c.id];
              const result = results[c.id];
              const empty = bytes === 0;
              return (
                <li key={c.id} className={`${styles.row} ${picked.has(c.id) ? styles.changed : ""} ${result?.status === "done" ? styles.flash : ""}`}>
                  <div className={`${styles.appLine} ${styles.appLineNoActions}`}>
                    {busy || !sizes ? <span aria-hidden="true" /> : (
                      <input type="checkbox" className={styles.check} checked={picked.has(c.id)} onChange={() => flip(c.id)} aria-label={localize(c.name, language)} />
                    )}
                    <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                      <b>{localize(c.name, language)}</b>
                      <small>{localize(c.description, language)}</small>
                      <span className={styles.access}>
                        <span className={risk.risk === "risky" ? styles.riskRisky : risk.risk === "moderate" ? styles.riskModerate : undefined}>
                          {risk.risk !== "safe" && <TriangleAlert size={12} aria-hidden="true" />}
                          {t(`tw.risk_${risk.risk}`)}
                        </span>
                        {risk.note && <span>{localize(risk.note, language)}</span>}
                      </span>
                    </div>
                    <span className={styles.tagSlot}>
                      {running === c.id ? (
                        <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("cl.cleaning")}</span>
                      ) : result?.status === "failed" ? (
                        <span className="tag bad">{t("tw.st_failed")}</span>
                      ) : result?.status === "done" ? (
                        <span className="tag on">{result.freed === null ? t("cl.done_tag") : fmt(t("cl.freed"), { size: formatBytes(result.freed, language) })}</span>
                      ) : bytes === undefined ? null : (
                        <span className={`${styles.size} ${empty ? styles.sizeEmpty : ""}`}>{bytes === null ? "—" : formatBytes(bytes, language)}</span>
                      )}
                    </span>
                  </div>
                  {confirmRisky === c.id && (
                    <p className={`${styles.confirm} ${styles.confirmRisky}`} role="alert">
                      <TriangleAlert size={14} aria-hidden="true" />
                      <span className={styles.confirmText}>{t("cl.risky_confirm")}</span>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => flip(c.id, true)}>{t("cl.risky_yes")}</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRisky(null)}>{t("tw.risky_no")}</button>
                    </p>
                  )}
                  {result?.status === "failed" && running !== c.id && (
                    <>
                      <p className={styles.error} role="alert">
                        <TriangleAlert size={14} aria-hidden="true" />
                        {fmt(t("cl.failed_at"), { time: time(result.at), msg: /access|acesso|denied|negado/i.test(result.msg) ? t("tw.err_access") : t("cl.err_generic") })}
                        {level !== "advanced" && <button type="button" onClick={() => toggleRaw(c.id)}>{t("tw.see_details")}</button>}
                      </p>
                      {(showRaw.has(c.id) || level === "advanced") && <pre className={styles.raw}>{result.msg}</pre>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {hidden > 0 && <p className={styles.hiddenNote}>{fmt(t("lv.hidden_actions", hidden), { n: hidden })}</p>}
        {admin === false && sizes && <p className={styles.hiddenNote}>{t("cl.not_admin_sizes")}</p>}
      </div>

      {(chosen.length > 0 || busy) && (
        <div className={styles.dock} role="region" aria-label={t("cl.title")}>
          <div className={styles.dockInfo}>
            {busy ? (
              <span className={styles.dockNote} role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {restoring ? t("tw.creating_restore") : progress && fmt(t("cl.progress"), { i: progress.i, n: progress.n, name: localize(CLEANUPS.find((c) => c.id === running)?.name, language) ?? "" })}
              </span>
            ) : (
              <>
                <span className={styles.dockCount}>{fmt(t(chosen.length === 1 ? "cl.dock_one" : "cl.dock_n"), { n: chosen.length, size: formatBytes(chosenBytes, language) })}</span>
                <label className={styles.dockCheck}>
                  <input type="checkbox" checked={restoreFirst || restoreForced} disabled={restoreForced} onChange={(e) => setRestoreFirst(e.target.checked)} />
                  <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
                  {t("tw.dock_restore")}
                  {restoreForced && <span className={styles.dockForced}>{t("tw.dock_restore_forced")}</span>}
                </label>
                {admin === false && <span className={styles.dockWarn}>{t("cl.not_admin")}</span>}
              </>
            )}
          </div>
          {!busy && (
            <>
              <button type="button" className="btn" onClick={() => { setPicked(new Set()); setConfirmRisky(null); }}>{t("ap.dock_clear")}</button>
              <button type="button" className="btn btn-primary" onClick={() => void run()}>{t("cl.clean")} {chosen.length}</button>
            </>
          )}
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind} ${chosen.length || busy ? styles.toastAbove : ""}`} role="status" aria-live="polite">{toast.msg}</div>}
    </div>
  );
}
