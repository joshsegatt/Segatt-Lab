"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GraduationCap } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { setLevel, useLevel } from "@/hooks/useLevel";
import { LEVELS, LEVEL_TEXT } from "@/lib/level";
import styles from "./LevelMenu.module.css";

/** The knowledge level chip in the top bar; changes it without redoing onboarding. */
export function LevelMenu() {
  const { t, language } = useLanguage();
  const { level, chosen } = useLevel();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (chosen === "pending") return null;

  return (
    <div className={styles.wrap} ref={root}>
      <button type="button" className={`pill ${styles.chip}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title={t("lv.chip_hint")}>
        <GraduationCap size={15} strokeWidth={1.75} aria-hidden="true" />
        {LEVEL_TEXT[level].name[language]}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label={t("lv.menu")}>
          <p className={styles.head}>{t("lv.menu")}</p>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={level === l}
              className={`${styles.item} ${level === l ? styles.on : ""}`}
              onClick={() => {
                setLevel(l);
                setOpen(false);
              }}
            >
              <span className={styles.check} aria-hidden="true">{level === l && <Check size={15} strokeWidth={2} />}</span>
              <span className={styles.text}>
                <b>{LEVEL_TEXT[l].name[language]}</b>
                <small>{LEVEL_TEXT[l].sees[language]}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
