"use client";

import { useEffect, useRef, useState } from "react";
import { HardDrive, Package, ShieldCheck, SlidersHorizontal, Undo2, Wrench, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { setLevel, useLevel } from "@/hooks/useLevel";
import { LEVELS, LEVEL_TEXT, type Level } from "@/lib/level";
import Image from "next/image";
import { APP_MASCOT, APP_NAME } from "@/lib/brand";
import { fmt } from "@/lib/fmt";
import styles from "./Onboarding.module.css";
import { localize } from "@/lib/i18n";

const STEPS: { title: string; lede: string; rows?: [LucideIcon, string, string][] }[] = [
  {
    title: "ob.welcome_title",
    lede: "ob.welcome_lede",
    rows: [
      [SlidersHorizontal, "ob.tweaks", "ob.tweaks_sub"],
      [Package, "ob.apps", "ob.apps_sub"],
      [Wrench, "ob.fix", "ob.fix_sub"],
    ],
  },
  {
    title: "ob.safe_title",
    lede: "ob.safe_lede",
    rows: [
      [HardDrive, "ob.local", "ob.local_sub"],
      [Undo2, "ob.undo", "ob.undo_sub"],
      [ShieldCheck, "ob.risk", "ob.risk_sub"],
    ],
  },
  { title: "ob.level_title", lede: "ob.level_lede" },
];

/** First run: what the app does, why it is safe, and the knowledge level. */
export function Onboarding() {
  const { chosen } = useLevel();
  const { t, language } = useLanguage();
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<Level>("beginner");
  const heading = useRef<HTMLHeadingElement>(null);
  const open = chosen === null;

  // The app behind stays out of reach of Tab and screen readers while this is up.
  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector(".app-shell");
    shell?.setAttribute("inert", "");
    return () => shell?.removeAttribute("inert");
  }, [open]);

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step]);

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className={styles.col}>
        <div key={step} className={styles.body}>
          {step === 0 && <Image className={styles.mark} src={APP_MASCOT} alt="" width={112} height={112} priority />}
          <h1 id="ob-title" ref={heading} tabIndex={-1} className={styles.title}>{fmt(t(s.title), { app: APP_NAME })}</h1>
          <p className={styles.lede}>{t(s.lede)}</p>

          {s.rows && (
            <ul className={styles.list}>
              {s.rows.map(([Icon, title, sub]) => (
                <li key={title} className={styles.row}>
                  <span className={styles.icon} aria-hidden="true"><Icon size={17} strokeWidth={1.75} /></span>
                  <span className={styles.text}>
                    <b>{t(title)}</b>
                    <small>{t(sub)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {last && (
            <div className={styles.list} role="radiogroup" aria-labelledby="ob-title">
              {LEVELS.map((l) => (
                <label key={l} className={`${styles.row} ${styles.choice} ${pick === l ? styles.picked : ""}`}>
                  <input type="radio" name="level" value={l} checked={pick === l} onChange={() => setPick(l)} className={styles.radio} />
                  <span className={styles.text}>
                    <b>{localize(LEVEL_TEXT[l].name, language)}</b>
                    <small>{localize(LEVEL_TEXT[l].who, language)}</small>
                    <small className={styles.sees}>{localize(LEVEL_TEXT[l].sees, language)}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className={styles.foot}>
          {last ? <span className={styles.spacer} /> : (
            <button type="button" className="btn btn-ghost" onClick={() => setLevel("beginner")} title={t("ob.skip_hint")}>{t("ob.skip")}</button>
          )}
          <span className={styles.dots} aria-label={fmt(t("ob.step"), { n: step + 1, m: STEPS.length })}>
            {STEPS.map((_, i) => <span key={i} className={i === step ? styles.dotOn : styles.dot} />)}
          </span>
          <span className={styles.nav}>
            {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t("ob.back")}</button>}
            <button type="button" className="btn btn-primary" onClick={() => (last ? setLevel(pick) : setStep(step + 1))}>
              {last ? t("ob.start") : t("ob.next")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
