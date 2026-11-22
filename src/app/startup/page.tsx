"use client";

import { useState } from "react";
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useIsAdmin } from "@/hooks/useSystem";
import { useLevel } from "@/hooks/useLevel";
import { readStartup, switchStartup, useStartup } from "@/hooks/useStartup";
import { localeTag } from "@/lib/i18n";
import { recordActivity } from "@/lib/history";
import { fmt } from "@/lib/fmt";
import styles from "@/components/ui/Screen.module.css";

export default function StartupPage() {
  const { t, language } = useLanguage();
  const admin = useIsAdmin();
  const { level } = useLevel();
  const { items, reading, readError, busy, errors } = useStartup();
  const [showRaw, setShowRaw] = useState<Set<string>>(new Set());

  const on = items?.filter((i) => i.enabled).length ?? 0;
  const time = (at: number) => new Date(at).toLocaleTimeString(localeTag(language), { hour: "2-digit", minute: "2-digit" });
  const toggleRaw = (id: string) => setShowRaw((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const flip = async (id: string, name: string, enabled: boolean) => {
    const ok = await switchStartup(id, enabled);
    recordActivity({ label: fmt(t(enabled ? "su.history_on" : "su.history_off"), { name }), status: ok ? "ok" : "failed", href: "/startup" });
  };

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{t("su.title")}</h1>
            <p className={styles.lede}>{t("su.lede")}</p>
          </div>
        </header>

        <div className={styles.tools}>
          <p className={styles.summary} role="status">
            {reading && !items ? (
              <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> {t("su.reading")}</>
            ) : items ? (
              <><b>{on}</b> {fmt(t("su.summary", on), { m: items.length })}</>
            ) : null}
          </p>
          <button type="button" className="icon-btn" onClick={readStartup} disabled={reading || busy !== null} aria-label={t("su.reread")} title={t("su.reread")}>
            {reading ? <Loader2 size={17} className="animate-spin" /> : <RotateCw size={17} strokeWidth={1.75} />}
          </button>
        </div>

        {readError && !items && (
          <div className={styles.status} role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {t("su.read_failed")}
            <button type="button" className="btn btn-sm" onClick={readStartup}>{t("tw.retry_read")}</button>
          </div>
        )}

        {items && items.length === 0 && <p className={styles.status}>{t("su.empty")}</p>}

        {items && items.length > 0 && (
          <section className={styles.group} aria-label={t("su.title")}>
            <ul className={styles.list}>
              {items.map((item) => {
                const err = errors[item.id];
                const running = busy === item.id;
                return (
                  <li key={item.id} className={styles.row}>
                    <div className={styles.line}>
                      <div className={`${styles.info} ${styles.infoStatic}`}>
                        <b>{item.name}</b>
                        <small className={styles.command} title={item.command}>{item.command}</small>
                        <span className={styles.access}>
                          <span title={t(`tw.scope_${item.scope}_hint`)}>{t(`tw.scope_${item.scope}`)}</span>
                          {item.publisher && <span>{item.publisher}</span>}
                        </span>
                      </div>
                      {running ? (
                        <span className="tag pending"><Loader2 size={12} className="animate-spin" aria-hidden="true" />&nbsp;{t("su.changing")}</span>
                      ) : err ? (
                        <span className="tag bad">{t("tw.st_failed")}</span>
                      ) : (
                        <span className={`tag ${item.enabled ? "on" : "off"}`}>{item.enabled ? t("su.on") : t("su.off")}</span>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.enabled}
                        aria-label={item.name}
                        className={`${styles.switch} ${item.enabled ? styles.switchOn : ""}`}
                        onClick={() => void flip(item.id, item.name, !item.enabled)}
                        disabled={busy !== null}
                      />
                    </div>
                    {err && !running && (
                      <>
                        <p className={styles.error} role="alert">
                          <TriangleAlert size={14} aria-hidden="true" />
                          {fmt(t("su.failed_at"), { time: time(err.at) })} {/access denied|acesso negado/i.test(err.msg) ? t("tw.err_access") : ""}
                          {level !== "advanced" && <button type="button" onClick={() => toggleRaw(item.id)}>{t("tw.see_details")}</button>}
                        </p>
                        {(showRaw.has(item.id) || level === "advanced") && <pre className={styles.raw}>{err.msg}</pre>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {items && <p className={styles.hiddenNote}>{t("su.note")}</p>}
        {admin === false && items?.some((i) => i.scope === "machine") && <p className={styles.hiddenNote}>{t("su.not_admin")}</p>}
      </div>
    </div>
  );
}
