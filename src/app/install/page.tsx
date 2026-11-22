"use client";

import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, RefreshCw, RotateCw, Search, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useQueryParam } from "@/hooks/useQueryParam";
import { useIsAdmin } from "@/hooks/useSystem";
import { countUpdates, findInstalled, refreshApps, useApps, type InstalledApp } from "@/hooks/useApps";
import { clearToast, enqueue as enqueueJobs, key, reasonText, setQueueContext, useAppQueue, type Job } from "@/hooks/useAppQueue";
import { APP_CATEGORIES, ALL_APPS } from "@/lib/app-categories";
import { normalize } from "@/lib/search";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";
import { localeTag, localize } from "@/lib/i18n";

type View = "catalog" | "installed" | "updates";
interface WingetHit { name: string; id: string; version: string }

export default function AppsPage() {
  const { t, language } = useLanguage();
  const { installed, loading, error } = useApps();
  const { running, queued, progress, results, toast } = useAppQueue();
  const admin = useIsAdmin();
  const viewParam = useQueryParam("view");
  const queryParam = useQueryParam("q");

  const [viewPicked, setView] = useState<View | null>(null);
  const view: View = viewPicked ?? (viewParam === "installed" || viewParam === "updates" ? viewParam : "catalog");
  const [typed, setQuery] = useState<string | null>(null);
  const query = typed ?? queryParam ?? "";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [winget, setWinget] = useState<{ q: string; hits: WingetHit[] | null; loading: boolean; failed: boolean } | null>(null);

  // History lines written by the queue use this screen's language and admin state.
  useEffect(() => {
    setQueueContext(t, admin);
  }, [t, admin]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // A queued app leaves the selection, so the dock never queues it twice.
  const enqueue = (jobs: Job[]) => {
    const ids = new Set(jobs.map((j) => key(j.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !ids.has(key(id)))));
    enqueueJobs(jobs);
  };

  const searchWinget = () => {
    const term = query.trim();
    if (term.length < 2) return;
    setWinget({ q: term, hits: null, loading: true, failed: false });
    invoke<WingetHit[]>("search_packages", { query: term })
      .then((hits) => setWinget({ q: term, hits, loading: false, failed: false }))
      .catch(() => setWinget({ q: term, hits: null, loading: false, failed: true }));
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleRaw = (k: string) =>
    setShowRaw((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const time = (at?: number) => (at ? new Date(at).toLocaleTimeString(localeTag(language), { hour: "2-digit", minute: "2-digit" }) : "");

  const q = normalize(query.trim());
  const matches = (text: string) => !q || normalize(text).includes(q);
  const updates = countUpdates(installed);
  const installedList = useMemo(
    () => (installed ? Object.values(installed).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [installed],
  );

  /** One row for any app: catalog entry, installed app or winget hit. */
  const row = (opts: { id: string; name: string; sub: string; selectable?: boolean; removable?: boolean }) => {
    const { id, name, sub } = opts;
    const k = key(id);
    const inst: InstalledApp | undefined = findInstalled(installed, id);
    const result = results[k];
    const isRunning = running === k;
    const isQueued = queued.includes(k);
    const busyHere = isRunning || isQueued;
    // Until winget is read again, a finished job decides whether the app is there.
    const justRemoved = result?.status === "done" && result.action === "uninstall";
    const justAdded = result?.status === "done" && result.action !== "uninstall";
    const present = (!!inst || justAdded) && !justRemoved;
    const upgradable = present && !!inst?.available && !justAdded;

    let tag: React.ReactNode = null;
    if (isRunning) {
      const act = progress?.action;
      tag = <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t(act === "upgrade" ? "ap.st_updating" : act === "uninstall" ? "ap.st_removing" : "ap.st_installing")}</span>;
    } else if (isQueued) tag = <span className="tag off">{t("ap.st_queued")}</span>;
    else if (result?.status === "failed") tag = <span className="tag bad">{t("ap.st_failed")}</span>;
    else if (result?.status === "done") tag = <span className="tag on">{t(result.action === "upgrade" ? "ap.st_done_update" : result.action === "uninstall" ? "ap.st_done_remove" : "ap.st_done_install")}</span>;
    else if (upgradable) {
      // Updates read like a tweak change: old version struck, new one in jade.
      tag = (
        <span className={styles.values} aria-label={`${inst!.version} → ${inst!.available}`}>
          <s aria-hidden="true">{inst!.version}</s>
          <span aria-hidden="true">→</span>
          <b aria-hidden="true">{inst!.available}</b>
        </span>
      );
    }
    else if (inst && present) tag = <span className="tag on">{fmt(t("ap.tag_installed"), { v: inst.version })}</span>;

    const selectable = opts.selectable && !present && !busyHere;

    return (
      <li key={k} className={`${styles.row} ${selected.has(id) ? styles.changed : ""} ${result?.status === "done" ? styles.flash : ""}`}>
        <div className={opts.selectable ? styles.appLine : `${styles.appLine} ${styles.appLineNoCheck}`}>
          {opts.selectable && (
            selectable ? (
              <input type="checkbox" className={styles.check} checked={selected.has(id)} onChange={() => toggleSelect(id)} aria-label={name} />
            ) : <span aria-hidden="true" />
          )}
          <div className={styles.appInfo}>
            <b>{name}</b>
            <small>{sub}</small>
          </div>
          <span className={styles.tagSlot}>{tag}</span>
          <div className={styles.rowActions}>
            {upgradable && !busyHere && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => enqueue([{ id, name, action: "upgrade" }])}>{t("ap.update")}</button>
            )}
            {present && opts.removable && !busyHere && confirmRemove !== k && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(k)}>{t("ap.remove")}</button>
            )}
            {!present && !busyHere && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => enqueue([{ id, name, action: "install" }])}>{t("ap.install")}</button>
            )}
          </div>
        </div>
        {confirmRemove === k && !busyHere && (
          <p className={styles.confirm} role="alert">
            <TriangleAlert size={14} aria-hidden="true" />
            {fmt(t("ap.remove_confirm"), { name })}
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setConfirmRemove(null); enqueue([{ id, name, action: "uninstall" }]); }}>{t("ap.remove_yes")}</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(null)}>{t("ap.remove_no")}</button>
          </p>
        )}
        {result?.status === "failed" && !busyHere && (
          <>
            <p className={styles.error} role="alert">
              <TriangleAlert size={14} aria-hidden="true" />
              {fmt(t("ap.failed_at"), { time: time(result.at), msg: reasonText(result.msg ?? "", t, admin) })}
              <button type="button" onClick={() => toggleRaw(k)}>{t("tw.see_details")}</button>
              <button type="button" onClick={() => enqueue([{ id, name, action: result.action }])}>
                <RotateCw size={13} aria-hidden="true" /> {t("tw.retry")}
              </button>
            </p>
            {showRaw.has(k) && <pre className={styles.raw}>{result.msg}</pre>}
          </>
        )}
      </li>
    );
  };

  const catalogGroups = APP_CATEGORIES.map((cat) => ({
    cat,
    apps: cat.apps.filter((a) => matches(`${a.name} ${a.id} ${a.description.pt} ${a.description.en} ${cat.label.pt} ${cat.label.en}`)),
  })).filter((g) => g.apps.length);
  const catalogIds = new Set(ALL_APPS.map((a) => key(a.id)));

  const dockOpen = progress !== null || (selected.size > 0 && view === "catalog");

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("ap.title")}</h1>
            <p className={styles.lede}>{t("ap.lede")}</p>
          </div>
        </header>

        <div className={styles.tools}>
          <div className={styles.seg} role="tablist" aria-label={t("ap.title")}>
            {(["catalog", "installed", "updates"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? styles.segOn : undefined} onClick={() => setView(v)}>
                {t(`ap.view_${v}`)}
                {v === "installed" && installed && <span className={styles.segCount}>{installedList.length}</span>}
                {v === "updates" && installed && updates > 0 && <span className={styles.segCount}>{updates}</span>}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setWinget(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && view === "catalog") searchWinget(); }}
              placeholder={t("ap.search")}
              aria-label={t("ap.search")}
              spellCheck={false}
            />
          </label>
          <button type="button" className="icon-btn" onClick={() => void refreshApps()} disabled={loading} aria-label={t("ap.refresh")} title={t("ap.refresh")}>
            <RefreshCw size={16} strokeWidth={1.75} className={loading ? "animate-spin" : undefined} />
          </button>
        </div>

        {!installed && loading && (
          <p className={styles.status} role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />{t("ap.reading")}</p>
        )}
        {!installed && !loading && error && (
          <div className={styles.status} role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("ap.read_failed")}
            <button type="button" className="btn btn-sm" onClick={() => void refreshApps()}>{t("ap.retry_read")}</button>
          </div>
        )}

        {view === "catalog" && (
          <>
            {catalogGroups.length === 0 && <p className={styles.status}>{fmt(t("ap.no_match"), { q: query.trim() })}</p>}
            {catalogGroups.map(({ cat, apps }) => (
              <section key={cat.key} className={styles.group} aria-labelledby={`c-${cat.key}`}>
                <div className={styles.groupHead}>
                  <h2 id={`c-${cat.key}`}>{localize(cat.label, language)}</h2>
                  {installed && <span>{fmt(t("ap.n_installed"), { n: apps.filter((a) => findInstalled(installed, a.id)).length, m: apps.length })}</span>}
                </div>
                <ul className={styles.list}>
                  {apps.map((a) => row({ id: a.id, name: a.name, sub: localize(a.description, language), selectable: true, removable: true }))}
                </ul>
              </section>
            ))}

            {query.trim().length >= 2 && (
              <section className={styles.group}>
                <div className={styles.groupHead}><h2>{t("ap.winget_title")}</h2></div>
                {!winget && (
                  <button type="button" className="btn btn-sm btn-secondary" onClick={searchWinget}>
                    <Search size={14} aria-hidden="true" /> {fmt(t("ap.winget_search"), { q: query.trim() })}
                  </button>
                )}
                {winget?.loading && <p className={styles.status} role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />{t("ap.winget_searching")}</p>}
                {winget?.failed && <p className={styles.status} role="alert"><TriangleAlert size={16} aria-hidden="true" />{t("ap.winget_failed")}</p>}
                {winget?.hits && winget.hits.length === 0 && <p className={styles.status}>{fmt(t("ap.winget_none"), { q: winget.q })}</p>}
                {winget?.hits && winget.hits.length > 0 && (
                  <ul className={styles.list}>
                    {winget.hits.filter((h) => !catalogIds.has(key(h.id))).slice(0, 25).map((h) =>
                      row({ id: h.id, name: h.name, sub: `${h.id} · ${fmt(t("ap.version"), { v: h.version })}`, removable: true }),
                    )}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        {view !== "catalog" && installed && (() => {
          const list = installedList.filter((a) => (view === "updates" ? !!a.available : true) && matches(`${a.name} ${a.id}`));
          if (!list.length) return <p className={styles.status}>{view === "updates" ? t("ap.no_updates") : t("ap.none_installed")}</p>;
          return (
            <section className={styles.group}>
              {view === "updates" && (
                <div className={styles.groupHead}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => enqueue(list.map((a) => ({ id: a.id, name: a.name, action: "upgrade" as const })))}
                    disabled={progress !== null}
                  >
                    {fmt(t("ap.update_all"), { n: list.length })}
                  </button>
                </div>
              )}
              <ul className={styles.list}>
                {list.map((a) => row({ id: a.id, name: a.name, sub: view === "updates" ? a.id : `${a.id} · ${fmt(t("ap.version"), { v: a.version })}`, removable: view === "installed" }))}
              </ul>
            </section>
          );
        })()}
      </div>

      {dockOpen && (
        <div className={styles.dock} role="region" aria-label={t("ap.title")}>
          <div className={styles.dockInfo}>
            {progress ? (
              <span className={styles.dockNote} role="status">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {fmt(t(progress.action === "upgrade" ? "ap.prog_upgrade" : progress.action === "uninstall" ? "ap.prog_uninstall" : "ap.prog_install"), { i: progress.i, n: progress.n, name: progress.name })}
              </span>
            ) : (
              <span className={styles.dockCount}>{selected.size === 1 ? t("ap.dock_one") : fmt(t("ap.dock_selected"), { n: selected.size })}</span>
            )}
            {admin === false && <span className={styles.dockWarn}>{t("ap.dock_not_admin")}</span>}
          </div>
          {selected.size > 0 && view === "catalog" && (
            <>
              <button type="button" className="btn" onClick={() => setSelected(new Set())}>{t("ap.dock_clear")}</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const jobs = [...selected].map((id) => ({ id, name: ALL_APPS.find((a) => a.id === id)?.name ?? id, action: "install" as const }));
                  setSelected(new Set());
                  enqueue(jobs);
                }}
              >
                {t("ap.dock_install")} {selected.size}
              </button>
            </>
          )}
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind} ${dockOpen ? styles.toastAbove : ""}`} role="status" aria-live="polite">{toast.msg}</div>}
    </div>
  );
}
