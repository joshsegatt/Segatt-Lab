"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useLevel } from "@/hooks/useLevel";
import { readBloat, removeBloat, useDebloat } from "@/hooks/useDebloat";
import { enqueue, useAppQueue, key } from "@/hooks/useAppQueue";
import { BLOAT, startsPicked } from "@/lib/debloat";
import { showsAction } from "@/lib/level";
import { localize, localeTag } from "@/lib/i18n";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";

/** OneDrive comes back through winget; the AppX apps through their Store page. */
const WINGET_ID: Record<string, string> = { OneDrive: "Microsoft.OneDrive" };

export default function DebloatPage() {
  const { t, language } = useLanguage();
  const { level } = useLevel();
  const { installed, reading, readError, running, progress, results } = useDebloat();
  const queue = useAppQueue();
  // null = the starting picks, derived from what is installed until the person changes one.
  const [pickedOverride, setPicked] = useState<Set<string> | null>(null);
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const listed = BLOAT.filter((b) => showsAction(level, b.risk));
  const isInstalled = (id: string) => installed?.[id] === true;
  const picked = pickedOverride ?? new Set(installed ? listed.filter((b) => startsPicked(b, isInstalled(b.id))).map((b) => b.id) : []);
  const chosen = listed.filter((b) => picked.has(b.id) && isInstalled(b.id));
  const installedCount = listed.filter((b) => isInstalled(b.id)).length;
  const busy = running !== null;

  const flip = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const run = async () => {
    const names = chosen.map((b) => localize(b.name, language));
    const out = await removeBloat(chosen.map((b) => b.id));
    setPicked(new Set());
    setToast(out.failed ? { kind: "error", msg: fmt(t("db.done_some"), { ok: out.ok, n: out.failed }) } : { kind: "success", msg: fmt(t("db.done", out.ok), { n: out.ok }) });
    recordActivity({ label: t("db.history"), detail: names.join(", "), status: out.failed ? "failed" : "ok", href: "/debloat" });
  };

  const reinstall = (id: string, name: string) => {
    const winget = WINGET_ID[id];
    if (winget) enqueue([{ id: winget, name, action: "install" }]);
    else void invoke("open_store_page", { id }).catch(() => undefined);
  };

  const time = (at: number) => new Date(at).toLocaleTimeString(localeTag(language), { hour: "2-digit", minute: "2-digit" });
  const toggleRaw = (id: string) => setShowRaw((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("db.title")}</h1>
            <p className={styles.lede}>{t("db.lede")}</p>
          </div>
        </header>

        <div className={styles.tools}>
          <p className={styles.summary} role="status">
            {reading && !installed ? (
              <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> {t("db.reading")}</>
            ) : installed ? (
              <><b>{installedCount}</b> {t("db.installed_here", installedCount)}</>
            ) : null}
          </p>
          <button type="button" className="icon-btn" onClick={() => readBloat(true)} disabled={reading || busy} aria-label={t("db.reread")} title={t("db.reread")}>
            {reading ? <Loader2 size={17} className="animate-spin" /> : <RotateCw size={17} strokeWidth={1.75} />}
          </button>
        </div>

        {readError && !installed && (
          <div className={styles.status} role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("db.read_failed")}
            <button type="button" className="btn btn-sm" onClick={() => readBloat(true)}>{t("tw.retry_read")}</button>
          </div>
        )}

        <section className={styles.group} aria-label={t("db.title")}>
          <ul className={styles.list}>
            {listed.map((b) => {
              const name = localize(b.name, language);
              const here = isInstalled(b.id);
              const result = results[b.id];
              const queueKey = WINGET_ID[b.id] ? key(WINGET_ID[b.id]) : null;
              const reinstalling = queueKey !== null && (queue.running === queueKey || queue.queued.includes(queueKey));
              return (
                <li key={b.id} className={`${styles.row} ${picked.has(b.id) && here ? styles.changed : ""}`}>
                  <div className={styles.appLine}>
                    {here && !busy ? (
                      <input type="checkbox" className={styles.check} checked={picked.has(b.id)} onChange={() => flip(b.id)} aria-label={name} />
                    ) : <span aria-hidden="true" />}
                    <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                      <b>{name}</b>
                      <small>{localize(b.description, language)}</small>
                      <span className={styles.access}>
                        <span className={b.risk === "moderate" ? styles.riskModerate : b.risk === "risky" ? styles.riskRisky : undefined}>
                          {b.risk !== "safe" && <TriangleAlert size={12} aria-hidden="true" />}
                          {t(`tw.risk_${b.risk}`)}
                        </span>
                        {b.note && <span>{localize(b.note, language)}</span>}
                      </span>
                    </div>
                    <span className={styles.tagSlot}>
                      {running === b.id ? (
                        <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("db.removing")}</span>
                      ) : reinstalling ? (
                        <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("ap.st_installing")}</span>
                      ) : result?.status === "failed" ? (
                        <span className="tag bad">{t("tw.st_failed")}</span>
                      ) : !installed ? null : here ? (
                        <span className="tag on">{t("db.installed")}</span>
                      ) : (
                        <span className="tag off">{result?.status === "done" ? t("db.removed") : t("db.not_installed")}</span>
                      )}
                    </span>
                    <div className={styles.rowActions}>
                      {installed && !here && !busy && !reinstalling && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => reinstall(b.id, name)} title={WINGET_ID[b.id] ? undefined : t("db.store_hint")}>
                          {t("db.reinstall")}
                        </button>
                      )}
                    </div>
                  </div>
                  {result?.status === "failed" && running !== b.id && (
                    <>
                      <p className={styles.error} role="alert">
                        <TriangleAlert size={14} aria-hidden="true" />
                        {fmt(t("db.failed_at"), { time: time(result.at) })}
                        {/0x80073CFA|0x80073D19|part of Windows|cannot be uninstalled/i.test(result.msg) && ` ${t("db.err_protected")}`}
                        {level !== "advanced" && <button type="button" onClick={() => toggleRaw(b.id)}>{t("tw.see_details")}</button>}
                      </p>
                      {(showRaw.has(b.id) || level === "advanced") && <pre className={styles.raw}>{result.msg}</pre>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <p className={styles.hiddenNote}>{t("db.note_account")}</p>
      </div>

      {(chosen.length > 0 || busy) && (
        <div className={styles.dock} role="region" aria-label={t("db.title")}>
          <div className={styles.dockInfo}>
            {busy ? (
              <span className={styles.dockNote} role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {progress && fmt(t("db.progress"), { i: progress.i, n: progress.n, name: localize(BLOAT.find((b) => b.id === running)?.name, language) ?? "" })}
              </span>
            ) : (
              <span className={styles.dockCount}>{fmt(t("db.dock", chosen.length), { n: chosen.length })}</span>
            )}
          </div>
          {!busy && (
            <>
              <button type="button" className="btn" onClick={() => setPicked(new Set())}>{t("ap.dock_clear")}</button>
              <button type="button" className="btn btn-primary" onClick={() => void run()}>{t("db.remove")} {chosen.length}</button>
            </>
          )}
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind} ${chosen.length || busy ? styles.toastAbove : ""}`} role="status" aria-live="polite">{toast.msg}</div>}
    </div>
  );
}
