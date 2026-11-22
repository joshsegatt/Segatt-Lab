"use client";

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Cpu, FileUp, Loader2, RotateCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { useHardware } from "@/hooks/useHardware";
import { useLevel } from "@/hooks/useLevel";
import { allows, levelFor, LEVEL_TEXT } from "@/lib/level";
import { useApps } from "@/hooks/useApps";
import { applyTweaks, explainTweakError, useTweakStates, type TweakFailures } from "@/hooks/useTweakStates";
import { clearToast, enqueue, key, reasonText, setQueueContext, useAppQueue } from "@/hooks/useAppQueue";
import { buildProfile, fileStamp, MAX_PROFILE_BYTES, parseProfile, planImport, type ImportPlan, type ParseError } from "@/lib/profile";
import { hardwareHint } from "@/lib/hardware";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";
import { localeTag, localize } from "@/lib/i18n";

type Note = { kind: "success" | "error"; msg: string };

export default function ProfilePage() {
  const { t, language } = useLanguage();
  const { states } = useTweakStates();
  const { installed, error: appsError } = useApps();
  const { hw, error: hwError } = useHardware();
  const admin = useIsAdmin();
  const { level } = useLevel();
  const queue = useAppQueue();
  const fileInput = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<ParseError | "read" | null>(null);
  const [loaded, setLoaded] = useState<{ file: string; plan: ImportPlan; dropped: number; exportedAt: string; appsUnread: boolean } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmRisky, setConfirmRisky] = useState<string | null>(null);
  const [restoreFirst, setRestoreFirst] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [busyNote, setBusyNote] = useState<string | null>(null);
  const [failed, setFailed] = useState<TweakFailures>({});
  const [toast, setToast] = useState<Note | null>(null);
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const toggleRaw = (k: string) => setShowRaw((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  useEffect(() => {
    setQueueContext(t, admin);
  }, [t, admin]);

  // One toast at a time: this screen's own, else the app queue's.
  const shown = toast ?? queue.toast;
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => (toast ? setToast(null) : clearToast()), 6000);
    return () => clearTimeout(id);
  }, [shown, toast]);

  const activeCount = states ? Object.values(states).filter((s) => s.status === "active").length : 0;
  const appsRead = installed !== null || appsError !== null;
  const canExport = states !== null && appsRead && !saving;
  // The plan's picks depend on all three readings (tweaks, apps, hardware).
  const canImport = states !== null && appsRead && (hw !== null || hwError !== null);

  const exportProfile = async () => {
    if (!states) return;
    setSaving(true);
    setExportError(null);
    const now = new Date();
    try {
      const path = await invoke<string>("save_profile", { contents: JSON.stringify(buildProfile(states, installed ?? {}, now), null, 2), stamp: fileStamp(now) });
      setSaved(path);
      recordActivity({ label: t("pf.history_exported"), detail: path, status: "ok", href: "/profile" });
    } catch (e) {
      setSaved(null);
      setExportError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (file: File) => {
    setImportError(null);
    if (file.size > MAX_PROFILE_BYTES) {
      setImportError("too_big");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("read");
      return;
    }
    const parsed = parseProfile(text);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    // Without this PC's app list every app would look missing: leave apps out.
    const profile = installed ? parsed.profile : { ...parsed.profile, apps: [] };
    const plan = planImport(profile, states ?? {}, installed ?? {}, hw);
    setLoaded({ file: file.name, plan, dropped: parsed.dropped, exportedAt: parsed.profile.exportedAt, appsUnread: !installed && parsed.profile.apps.length > 0 });
    setPicked(new Set([...plan.tweaks.filter((p) => p.pick && allows(level, p.tweak.risk)).map((p) => `t:${p.tweak.id}`), ...plan.apps.map((a) => `a:${key(a.id)}`)]));
    setFailed({});
    setConfirmRisky(null);
  };

  const flip = (k: string, confirmed = false) => {
    const id = k.slice(2);
    const risky = loaded?.plan.tweaks.some((p) => p.tweak.id === id && p.why === "risky");
    if (!picked.has(k) && risky && !confirmed) {
      setConfirmRisky(id);
      return;
    }
    setConfirmRisky(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const tweakDone = (id: string) => states?.[id]?.status === "active";
  const appState = (id: string) => {
    const k = key(id);
    if (queue.running === k) return "running";
    if (queue.queued.includes(k)) return "queued";
    const r = queue.results[k];
    if (r?.status === "failed") return "failed";
    if (r?.status === "done" || installed?.[k]) return "done";
    return null;
  };

  // Above the person's level a tweak is listed but locked (story: "Precisa do nível Avançado").
  const tweakEntries = (loaded?.plan.tweaks ?? []).filter((p) => picked.has(`t:${p.tweak.id}`) && !tweakDone(p.tweak.id) && allows(level, p.tweak.risk));
  const appJobs = (loaded?.plan.apps ?? []).filter((a) => picked.has(`a:${key(a.id)}`) && appState(a.id) === null);
  const total = tweakEntries.length + appJobs.length;
  const restoreForced = tweakEntries.some((p) => p.tweak.risk === "risky");
  const busy = working !== null || busyNote !== null;

  const apply = async () => {
    if (!total || busy) return;
    if (tweakEntries.length) {
      if (restoreFirst || restoreForced) {
        setBusyNote(t("tw.creating_restore"));
        try {
          await invoke("create_restore_point");
        } catch (e) {
          // No tweak runs without its restore point; apps never needed one.
          setBusyNote(null);
          setToast({ kind: "error", msg: fmt(t("tw.restore_failed"), { msg: String(e) }) });
          if (appJobs.length) enqueue(appJobs.map((a) => ({ id: a.id, name: a.name, action: "install" as const })));
          return;
        }
      }
      setBusyNote(null);
      const entries: [string, boolean][] = tweakEntries.map((p) => [p.tweak.id, true]);
      const fails = await applyTweaks(entries, setWorking);
      setFailed(fails);
      const ok = entries.length - Object.keys(fails).length;
      setToast(ok === entries.length ? { kind: "success", msg: fmt(t("tw.done_all"), { n: ok }) } : { kind: "error", msg: fmt(t("tw.done_some"), { ok, n: entries.length }) });
      recordActivity({
        label: t("pf.history_imported"),
        detail: fmt(t("pf.history_tweaks"), { n: ok, m: entries.length }),
        status: ok === entries.length ? "ok" : "failed",
        href: "/profile",
      });
    }
    // Apps go to the shared queue: they keep installing if you leave this screen.
    if (appJobs.length) enqueue(appJobs.map((a) => ({ id: a.id, name: a.name, action: "install" as const })));
  };

  const time = (at: number) => new Date(at).toLocaleTimeString(localeTag(language), { hour: "2-digit", minute: "2-digit" });
  const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString(localeTag(language), { day: "numeric", month: "long", year: "numeric" }) : "");

  const plan = loaded?.plan;
  const dockOpen = total > 0 || busy || queue.progress !== null;

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("pf.title")}</h1>
            <p className={styles.lede}>{t("pf.lede")}</p>
          </div>
        </header>

        <section className={styles.group} aria-labelledby="pf-export">
          <div className={styles.groupHead}><h2 id="pf-export">{t("pf.export")}</h2></div>
          <ul className={styles.list}>
            <li className={styles.row}>
              <div className={`${styles.appLine} ${styles.appLineNoCheck}`}>
                <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                  <b>{t("pf.this_pc")}</b>
                  <small>
                    {!states || !appsRead
                      ? t("pf.reading")
                      : installed
                        ? fmt(t("pf.summary"), { n: activeCount, m: Object.keys(installed).length })
                        : fmt(t("pf.summary_no_apps"), { n: activeCount })}
                  </small>
                </div>
                <span className={styles.tagSlot}>
                  {saving ? <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("pf.saving")}</span> : saved ? <span className="tag on">{t("pf.saved")}</span> : null}
                </span>
                <div className={styles.rowActions}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => void exportProfile()} disabled={!canExport}>{t("pf.export_btn")}</button>
                </div>
              </div>
              {saved && (
                <p className={styles.reason} style={{ margin: "-4px 18px 12px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ overflowWrap: "anywhere" }}>{fmt(t("pf.saved_at"), { path: saved })}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void revealItemInDir(saved).catch(() => undefined)}>{t("pf.show_folder")}</button>
                </p>
              )}
              {exportError && (
                <>
                  <p className={styles.error} role="alert"><TriangleAlert size={14} aria-hidden="true" />{t("pf.export_failed")}</p>
                  <pre className={styles.raw}>{exportError}</pre>
                </>
              )}
            </li>
          </ul>
        </section>

        <section className={styles.group} aria-labelledby="pf-import">
          <div className={styles.groupHead}><h2 id="pf-import">{t("pf.import")}</h2></div>
          <ul className={styles.list}>
            <li className={styles.row}>
              <div className={`${styles.appLine} ${styles.appLineNoCheck}`}>
                <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                  <b>{loaded ? loaded.file : t("pf.file")}</b>
                  <small>{loaded ? (loaded.exportedAt ? fmt(t("pf.exported_on"), { d: date(loaded.exportedAt) }) : t("pf.no_date")) : t("pf.file_hint")}</small>
                </div>
                <span className={styles.tagSlot} />
                <div className={styles.rowActions}>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void openFile(f);
                    }}
                  />
                  <button type="button" className={`btn btn-sm ${loaded ? "btn-ghost" : "btn-secondary"}`} onClick={() => fileInput.current?.click()} disabled={!canImport || busy}>
                    <FileUp size={14} aria-hidden="true" /> {loaded ? t("pf.other_file") : t("pf.choose")}
                  </button>
                </div>
              </div>
              {importError && <p className={styles.error} role="alert"><TriangleAlert size={14} aria-hidden="true" />{t(`pf.err_${importError}`)}</p>}
              {loaded && loaded.dropped > 0 && <p className={styles.reason} style={{ margin: "-4px 18px 12px" }}>{fmt(t("pf.dropped"), { n: loaded.dropped })}</p>}
            </li>
          </ul>
        </section>

        {plan && (
          <section className={styles.group} aria-labelledby="pf-tweaks">
            <div className={styles.groupHead}>
              <h2 id="pf-tweaks">{t("pf.tweaks")}</h2>
              <span>{fmt(t("pf.already"), { n: plan.tweaksDone })}</span>
            </div>
            {plan.tweaks.length === 0 ? (
              <p className={styles.reason} style={{ margin: "0 4px" }}>{t("pf.tweaks_none")}</p>
            ) : (
              <ul className={styles.list}>
                {plan.tweaks.map(({ tweak: tw, why }) => {
                  const k = `t:${tw.id}`;
                  const done = tweakDone(tw.id);
                  const st = states?.[tw.id];
                  return (
                    <li key={tw.id} className={`${styles.row} ${picked.has(k) && !done && allows(level, tw.risk) ? styles.changed : ""}`}>
                      <div className={`${styles.appLine} ${styles.appLineNoActions}`}>
                        {done || busy || !allows(level, tw.risk) ? <span aria-hidden="true" /> : (
                          <input type="checkbox" className={styles.check} checked={picked.has(k)} onChange={() => flip(k)} aria-label={localize(tw.name, language)} />
                        )}
                        <div className={`${styles.appInfo} ${styles.appInfoWrap}`}>
                          <b>{localize(tw.name, language)}</b>
                          <small>{localize(tw.description, language)}</small>
                          <span className={styles.access}>
                            {st && <span title={t(`tw.scope_${st.scope}_hint`)}>{t(`tw.scope_${st.scope}`)}</span>}
                            <span className={tw.risk === "risky" ? styles.riskRisky : tw.risk === "moderate" ? styles.riskModerate : undefined}>
                              {tw.risk !== "safe" && <TriangleAlert size={12} aria-hidden="true" />}
                              {t(`tw.risk_${tw.risk}`)}
                            </span>
                            {why === "not_for_pc" && <span className={styles.riskModerate}><Cpu size={12} aria-hidden="true" />{t("pc.not_for_pc")}</span>}
                            {!done && !allows(level, tw.risk) && <span className={styles.riskModerate}>{fmt(t("lv.needs"), { level: localize(LEVEL_TEXT[levelFor(tw.risk)].name, language) })}</span>}
                          </span>
                        </div>
                        <span className={styles.tagSlot}>
                          {working === tw.id ? (
                            <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("tw.st_working")}</span>
                          ) : done ? (
                            <span className="tag on">{t("tw.st_active")}</span>
                          ) : failed[tw.id] ? (
                            <span className="tag bad">{t("tw.st_failed")}</span>
                          ) : null}
                        </span>
                      </div>
                      {confirmRisky === tw.id && (
                        <p className={`${styles.confirm} ${styles.confirmRisky}`} role="alert">
                          <TriangleAlert size={14} aria-hidden="true" />
                          <span className={styles.confirmText}>{fmt(t("tw.risky_confirm"), { note: localize(tw.riskNote, language) ?? "" })}</span>
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => flip(k, true)}>{t("tw.risky_yes")}</button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRisky(null)}>{t("tw.risky_no")}</button>
                        </p>
                      )}
                      {!done && why === "unknown" && st?.reason && (
                        <p className={styles.reason} style={{ margin: "-4px 18px 12px" }}>{st.reason}</p>
                      )}
                      {!done && why === "not_for_pc" && (
                        <p className={`${styles.riskNote} ${styles.riskModerate}`} style={{ margin: "-4px 18px 12px" }}>
                          <Cpu size={13} aria-hidden="true" />{localize(hardwareHint(tw.id, hw)?.note, language)}
                        </p>
                      )}
                      {failed[tw.id] && !done && working !== tw.id && (
                        <>
                          <p className={styles.error} role="alert">
                            <TriangleAlert size={14} aria-hidden="true" />
                            {fmt(t("tw.failed_at"), { time: time(failed[tw.id].at), msg: explainTweakError(failed[tw.id].msg, t) })}
                            <button type="button" onClick={() => toggleRaw(k)}>{t("tw.see_details")}</button>
                          </p>
                          {showRaw.has(k) && <pre className={styles.raw}>{failed[tw.id].msg}</pre>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {plan && (
          <section className={styles.group} aria-labelledby="pf-apps">
            <div className={styles.groupHead}>
              <h2 id="pf-apps">{t("pf.apps")}</h2>
              <span>{fmt(t("pf.already_apps"), { n: plan.appsDone })}</span>
            </div>
            {plan.apps.length === 0 ? (
              <p className={styles.reason} style={{ margin: "0 4px" }}>{t(loaded.appsUnread ? "pf.apps_unread" : "pf.apps_none")}</p>
            ) : (
              <ul className={styles.list}>
                {plan.apps.map((a) => {
                  const k = `a:${key(a.id)}`;
                  const s = appState(a.id);
                  const r = queue.results[key(a.id)];
                  return (
                    <li key={k} className={`${styles.row} ${picked.has(k) && !s ? styles.changed : ""}`}>
                      <div className={`${styles.appLine} ${styles.appLineNoActions}`}>
                        {s || busy ? <span aria-hidden="true" /> : (
                          <input type="checkbox" className={styles.check} checked={picked.has(k)} onChange={() => flip(k)} aria-label={a.name} />
                        )}
                        <div className={styles.appInfo}>
                          <b>{a.name}</b>
                          <small>{a.id}</small>
                        </div>
                        <span className={styles.tagSlot}>
                          {s === "running" ? (
                            <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("ap.st_installing")}</span>
                          ) : s === "queued" ? (
                            <span className="tag off">{t("ap.st_queued")}</span>
                          ) : s === "failed" ? (
                            <span className="tag bad">{t("ap.st_failed")}</span>
                          ) : s === "done" ? (
                            <span className="tag on">{t("ap.st_done_install")}</span>
                          ) : null}
                        </span>
                      </div>
                      {s === "failed" && r && (
                        <>
                          <p className={styles.error} role="alert">
                            <TriangleAlert size={14} aria-hidden="true" />
                            {fmt(t("ap.failed_at"), { time: time(r.at ?? 0), msg: reasonText(r.msg ?? "", t, admin) })}
                            <button type="button" onClick={() => toggleRaw(k)}>{t("tw.see_details")}</button>
                            <button type="button" onClick={() => enqueue([{ id: a.id, name: a.name, action: "install" }])}>
                              <RotateCw size={13} aria-hidden="true" /> {t("tw.retry")}
                            </button>
                          </p>
                          {showRaw.has(k) && <pre className={styles.raw}>{r.msg}</pre>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {dockOpen && (
        <div className={styles.dock} role="region" aria-label={t("pf.apply")}>
          <div className={styles.dockInfo}>
            {queue.progress && !busy ? (
              <span className={styles.dockNote} role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {fmt(t("ap.prog_install"), { i: queue.progress.i, n: queue.progress.n, name: queue.progress.name })}
              </span>
            ) : (
              <span className={styles.dockCount}>{total === 1 ? t("tw.dock_one") : fmt(t("tw.dock_changes"), { n: total })}</span>
            )}
            {tweakEntries.length > 0 && (
              <label className={styles.dockCheck}>
                <input type="checkbox" checked={restoreFirst || restoreForced} disabled={restoreForced || busy} onChange={(e) => setRestoreFirst(e.target.checked)} />
                <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
                {t("tw.dock_restore")}
                {restoreForced && <span className={styles.dockForced}>{t("tw.dock_restore_forced")}</span>}
              </label>
            )}
            {admin === false && <span className={styles.dockWarn}>{t("pf.not_admin")}</span>}
            {busyNote && <span className={styles.dockNote} role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> {busyNote}</span>}
          </div>
          {total > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {t("pf.apply")} {total}
            </button>
          )}
        </div>
      )}

      {shown && <div className={`toast toast-${shown.kind} ${dockOpen ? styles.toastAbove : ""}`} role="status" aria-live="polite">{shown.msg}</div>}
    </div>
  );
}
