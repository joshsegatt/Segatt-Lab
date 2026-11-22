"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Loader2, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { installUpdate, openUpdate, useUpdate } from "@/hooks/useUpdate";
import { useUsb } from "@/hooks/useUsb";
import { APP_MASCOT, APP_NAME } from "@/lib/brand";
import { fmt } from "@/lib/fmt";
import styles from "./UpdateDialog.module.css";

export function UpdateDialog() {
  const { t } = useLanguage();
  const { open, status, version, current, notes, downloaded, total, error } = useUpdate();
  const usbBusy = useUsb().job !== null;
  const ref = useRef<HTMLDialogElement>(null);
  const busy = status === "downloading" || status === "installing";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const pct = total ? Math.min(100, Math.floor((downloaded / total) * 100)) : null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="up-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) openUpdate(false);
      }}
    >
      <Image className={styles.mascot} src={APP_MASCOT} alt="" width={88} height={88} />
      <h2 id="up-title" className={styles.title}>{fmt(t("up.title"), { app: APP_NAME, v: version ?? "" })}</h2>
      {current && <p className={styles.from}>{fmt(t("up.from"), { v: current })}</p>}

      <div className={styles.notes}>{notes ?? t("up.no_notes")}</div>

      {busy ? (
        <div className={styles.progress} role="status">
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={t("up.downloading")}>
            <div className={`${styles.fill} ${pct === null ? styles.indeterminate : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
          </div>
          <span>{status === "installing" ? t("up.installing") : pct === null ? t("up.downloading") : `${t("up.downloading")} ${pct}%`}</span>
        </div>
      ) : (
        <p className={styles.note}>{t("up.restart_note")}</p>
      )}

      {status === "failed" && (
        <p className={styles.error} role="alert"><TriangleAlert size={14} aria-hidden="true" />{fmt(t("up.failed"), { msg: error ?? "" })}</p>
      )}
      {usbBusy && !busy && <p className={styles.error}><TriangleAlert size={14} aria-hidden="true" />{t("up.busy_usb")}</p>}

      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" onClick={() => openUpdate(false)} disabled={busy}>{t("up.later")}</button>
        <button type="button" className="btn btn-primary" onClick={() => void installUpdate()} disabled={busy || usbBusy}>
          {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />&nbsp;{t("up.installing")}</> : t("up.install")}
        </button>
      </div>
    </dialog>
  );
}
