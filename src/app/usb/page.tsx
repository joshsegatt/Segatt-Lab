"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, CircleAlert, CircleCheck, Circle, Disc3, ExternalLink, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { useLevel } from "@/hooks/useLevel";
import { cancelUsb, clearResult, pickIso, readDisks, secondsLeft, useUsb, writeUsb, type Job, type Stage, type UsbDisk } from "@/hooks/useUsb";
import { formatBytes } from "@/lib/cleanup";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import { driveLabel, matchesName, usbErrorKey, validAccount, PRE_ERASE } from "@/lib/usb";
import screen from "@/components/ui/Screen.module.css";
import styles from "./usb.module.css";

const WINDOWS_DOWNLOAD = "https://www.microsoft.com/software-download/windows11";

function stagesFor(job: Job): Stage[] {
  if (job.iso.kind === "linux") return ["erase", "copy", "verify"];
  return job.iso.splits ? ["erase", "copy", "split", "verify"] : ["erase", "copy", "verify"];
}

export default function UsbPage() {
  const { t, language } = useLanguage();
  const admin = useIsAdmin();
  const { level } = useLevel();
  const { disks, reading, readError, iso, inspecting, isoError, job, result } = useUsb();
  const [chosen, setChosen] = useState<UsbDisk | null>(null);
  const [skipChecks, setSkipChecks] = useState(false);
  const [localOn, setLocalOn] = useState(false);
  const [account, setAccount] = useState("");
  const [typed, setTyped] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const size = (n: number) => formatBytes(n, language);

  // The chosen drive must still be in the list, the same disk.
  const drive = chosen && disks?.find((d) => d.number === chosen.number && d.serial === chosen.serial && d.size === chosen.size);

  // A drive plugged in while the app was in the background shows up on return.
  useEffect(() => {
    const onFocus = () => readDisks();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // The time left moves on its own between progress messages.
  useEffect(() => {
    if (!job) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [job]);

  const isWindows = iso?.kind === "windows";
  const accountOk = !localOn || validAccount(account);
  const ready = !!iso && !!drive && matchesName(typed, drive.name) && accountOk && admin !== false && !job;

  const start = async () => {
    if (!ready || !drive || !iso) return;
    setShowRaw(false);
    const r = await writeUsb(drive, {
      skipHardwareChecks: isWindows && skipChecks,
      localAccount: isWindows && localOn ? account : null,
    });
    if (!r) return;
    setTyped("");
    recordActivity({ label: fmt(t("usb.history"), { iso: iso.name }), status: r.ok ? "ok" : "failed", href: "/usb" });
  };

  const errKey = result && !result.ok ? usbErrorKey(result.error ?? "") : null;
  const isoErrKey = isoError ? usbErrorKey(isoError) : null;

  return (
    <div className={screen.page}>
      <div className={screen.col}>
        <header className={screen.head}>
          <div>
            <h1 className={screen.title}>{t("usb.title")}</h1>
            <p className={screen.lede}>{t("usb.lede")}</p>
          </div>
        </header>

        <details className={styles.how} open={level === "beginner" ? true : undefined}>
          <summary><ChevronRight size={16} aria-hidden="true" />{t("usb.how_title")}</summary>
          <ul>
            <li>{t("usb.how_1")}</li>
            <li>{t("usb.how_2")}</li>
            <li>{t("usb.how_3")}</li>
          </ul>
        </details>

        {result ? (
          <section className={`${styles.step} ${styles.panel} ${styles.result} ${result.ok ? styles.resultOk : styles.resultBad}`} role="status">
            <h2 className={styles.resultTitle}>
              {result.ok ? <CircleCheck size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}
              {result.ok ? t("usb.done_title") : errKey === "err_cancelled" ? t("usb.err_cancelled") : t("usb.failed_title")}
            </h2>
            {result.ok ? (
              <>
                <p>{fmt(t("usb.done_lede"), { drive: driveLabel(result.disk), iso: result.iso.name })}</p>
                <p className={styles.muted}>{t("usb.done_boot")}</p>
                {result.iso.kind === "linux" && <p className={styles.note}><TriangleAlert size={14} className={styles.warn} aria-hidden="true" />{t("usb.done_linux_note")}</p>}
              </>
            ) : (
              <>
                {errKey && errKey !== "err_cancelled" && <p>{fmt(t(`usb.${errKey}`), { size: size(Number(result.error?.split(":")[1] ?? 0)) })}</p>}
                {!PRE_ERASE.has(errKey ?? "") && <p className={styles.muted}>{t("usb.failed_partial")}</p>}
                {!errKey && (
                  <>
                    {level !== "advanced" && !showRaw && <button type="button" className={styles.link} onClick={() => setShowRaw(true)}>{t("tw.see_details")}</button>}
                    {(showRaw || level === "advanced") && <pre className={screen.raw} style={{ margin: 0 }}>{result.error}</pre>}
                  </>
                )}
              </>
            )}
            <div className={styles.panelRow}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearResult}>{result.ok ? t("usb.again") : t("usb.back")}</button>
            </div>
          </section>
        ) : job ? (
          <section className={`${styles.step} ${styles.panel}`} aria-live="polite">
            <p className={styles.panelRow}>
              <span className={styles.isoName}>{job.iso.name}</span>
              <span className={styles.muted}>→ {driveLabel(job.disk)}</span>
            </p>
            <ol className={styles.stages}>
              {stagesFor(job).map((s, i, all) => {
                const at = all.indexOf(job.stage);
                const state = i < at ? "done" : i === at ? "now" : "later";
                const pct = job.total > 0 ? Math.min(100, Math.floor((job.done / job.total) * 100)) : 0;
                const left = state === "now" ? secondsLeft(job, now) : null;
                const label = s === "copy" && job.iso.kind === "linux" ? t("usb.st_write") : t(`usb.st_${s}`);
                return (
                  <li key={s} className={`${styles.stage} ${state === "now" ? styles.stageNow : state === "done" ? styles.stageDone : ""}`}>
                    {state === "done" ? <Check size={16} aria-hidden="true" /> : state === "now" ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Circle size={10} aria-hidden="true" style={{ margin: "0 3px" }} />}
                    <span>{label}</span>
                    {state === "now" && (
                      <>
                        <div className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s === "erase" ? undefined : pct}>
                          <div className={`${styles.fill} ${s === "erase" ? styles.indeterminate : ""}`} style={s === "erase" ? undefined : { width: `${pct}%` }} />
                        </div>
                        <div className={styles.stageMeta}>
                          <span>{s === "erase" ? "" : `${size(job.done)} / ${size(job.total)} · ${pct}%`}</span>
                          <span>{left === null ? "" : left < 60 ? t("usb.left_sec") : fmt(t("usb.left_min"), { n: Math.ceil(left / 60) })}</span>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className={styles.panelRow}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelUsb} disabled={job.cancelling}>
                {job.cancelling ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />&nbsp;{t("usb.cancelling")}</> : t("usb.cancel")}
              </button>
              <span className={styles.muted}>{t("usb.keep_plugged")}</span>
            </div>
          </section>
        ) : (
          <>
            {/* 1. The ISO */}
            <section className={styles.step} aria-labelledby="usb-step-iso">
              <div className={styles.stepHead}>
                <span className={`${styles.num} ${iso ? styles.numDone : ""}`} aria-hidden="true">{iso ? <Check size={13} /> : 1}</span>
                <div>
                  <h2 id="usb-step-iso" className={styles.stepTitle}>{t("usb.step_iso")}</h2>
                  <p className={styles.stepSub}>{t("usb.step_iso_sub")}</p>
                </div>
              </div>
              <div className={styles.panel}>
                {iso && (
                  <div className={styles.panelRow}>
                    <Disc3 size={18} aria-hidden="true" style={{ color: "var(--ink-3)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.isoName}>{iso.name}</div>
                      <div className={styles.muted}>{t(`usb.kind_${iso.kind}`)} · {size(iso.size)}</div>
                    </div>
                  </div>
                )}
                {iso?.splits && <p className={styles.note}><CircleAlert size={14} aria-hidden="true" />{t("usb.splits")}</p>}
                {isoError && (
                  <p className={`${styles.note} ${styles.bad}`} role="alert">
                    <TriangleAlert size={14} aria-hidden="true" />{isoErrKey ? t(`usb.${isoErrKey}`) : isoError}
                  </p>
                )}
                <div className={styles.panelRow}>
                  <button type="button" className={`btn btn-sm ${iso ? "btn-secondary" : "btn-primary"}`} onClick={() => void pickIso(t("usb.pick_title"))} disabled={inspecting}>
                    {inspecting ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />&nbsp;{t("usb.inspecting")}</> : iso ? t("usb.pick_other") : t("usb.pick_iso")}
                  </button>
                  <button type="button" className={styles.link} onClick={() => void openUrl(WINDOWS_DOWNLOAD)}>
                    {t("usb.get_windows")}<ExternalLink size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>

            {/* 2. The drive */}
            <section className={styles.step} aria-labelledby="usb-step-drive">
              <div className={styles.stepHead}>
                <span className={`${styles.num} ${drive ? styles.numDone : ""}`} aria-hidden="true">{drive ? <Check size={13} /> : 2}</span>
                <div style={{ flex: 1 }}>
                  <h2 id="usb-step-drive" className={styles.stepTitle}>{t("usb.step_drive")}</h2>
                  <p className={styles.stepSub}>{t("usb.step_drive_sub")}</p>
                </div>
                <button type="button" className="icon-btn" onClick={readDisks} disabled={reading} aria-label={t("usb.reread")} title={t("usb.reread")}>
                  {reading ? <Loader2 size={17} className="animate-spin" /> : <RotateCw size={17} strokeWidth={1.75} />}
                </button>
              </div>
              {readError && !disks ? (
                <p className={screen.status} role="alert">
                  <TriangleAlert size={16} aria-hidden="true" />{t("usb.read_failed")}
                  <button type="button" className="btn btn-sm" onClick={readDisks}>{t("tw.retry_read")}</button>
                </p>
              ) : !disks ? (
                <p className={screen.status}><Loader2 size={15} className="animate-spin" aria-hidden="true" /> {t("usb.reading")}</p>
              ) : disks.length === 0 ? (
                <p className={`${styles.panel} ${styles.muted}`}>{t("usb.no_drives")}</p>
              ) : (
                <ul className={styles.drives} role="radiogroup" aria-labelledby="usb-step-drive">
                  {disks.map((d) => {
                    const on = drive?.number === d.number;
                    return (
                      <li key={`${d.number}-${d.serial}`}>
                        <label className={`${styles.drive} ${on ? styles.driveOn : ""}`}>
                          <input type="radio" name="usb-drive" checked={on} onChange={() => { setChosen(d); setTyped(""); }} />
                          <span className={styles.driveInfo}>
                            <span className={styles.driveName}>{d.name}</span>
                            <span className={styles.driveMeta}>
                              {d.volumes.length === 0 ? <span>{t("usb.no_letter")}</span> : d.volumes.map((v) => <span key={v.letter}>{v.letter}:{v.label ? ` ${v.label}` : ""}</span>)}
                              {!d.removable && <span className={styles.warn} title={t("usb.external_hint")}>{t("usb.external")}</span>}
                            </span>
                          </span>
                          <span className={styles.driveSize}>{size(d.size)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {drive && !drive.removable && <p className={styles.note} style={{ margin: "10px 4px 0" }}><TriangleAlert size={14} className={styles.warn} aria-hidden="true" />{t("usb.external_hint")}</p>}
            </section>

            {/* 3. Options and write */}
            <section className={styles.step} aria-labelledby="usb-step-write">
              <div className={styles.stepHead}>
                <span className={styles.num} aria-hidden="true">3</span>
                <div>
                  <h2 id="usb-step-write" className={styles.stepTitle}>{t("usb.step_write")}</h2>
                  <p className={styles.stepSub}>{isWindows ? t("usb.step_write_sub_windows") : t("usb.step_write_sub")}</p>
                </div>
              </div>
              <div className={styles.panel}>
                {isWindows && (
                  <>
                    <label className={styles.option}>
                      <input type="checkbox" checked={skipChecks} onChange={(e) => setSkipChecks(e.target.checked)} />
                      <b>{t("usb.opt_hardware")}</b>
                      <small>{t("usb.opt_hardware_hint")}</small>
                    </label>
                    <div className={styles.option}>
                      <input id="usb-local" type="checkbox" checked={localOn} onChange={(e) => setLocalOn(e.target.checked)} />
                      <label htmlFor="usb-local"><b>{t("usb.opt_account")}</b></label>
                      <small>{t("usb.opt_account_hint")}</small>
                      {localOn && (
                        <div className={styles.field}>
                          <label htmlFor="usb-account">{t("usb.account_name")}</label>
                          <input
                            id="usb-account"
                            className={styles.input}
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            maxLength={20}
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={account !== "" && !validAccount(account)}
                            aria-describedby={account !== "" && !validAccount(account) ? "usb-account-err" : undefined}
                          />
                          {account !== "" && !validAccount(account) && <span id="usb-account-err" className={styles.fieldError}>{t("usb.account_invalid")}</span>}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {!iso || !drive ? (
                  <p className={styles.muted}>{t("usb.choose_first")}</p>
                ) : (
                  <div className={isWindows ? styles.confirm : undefined} style={isWindows ? undefined : { display: "grid", gap: 8 }}>
                    <p className={styles.erase}><TriangleAlert size={16} aria-hidden="true" />{fmt(t("usb.erase_warning"), { drive: driveLabel(drive) })}</p>
                    <label htmlFor="usb-confirm">{t("usb.confirm_label")} <span className={styles.code}>{drive.name}</span></label>
                    <div className={styles.confirmRow}>
                      <input
                        id="usb-confirm"
                        className={styles.input}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void start(); }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={!ready}>{t("usb.write")}</button>
                    </div>
                  </div>
                )}
                {admin === false && <p className={`${styles.note} ${styles.warn}`}><TriangleAlert size={14} aria-hidden="true" />{t("usb.not_admin")}</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
