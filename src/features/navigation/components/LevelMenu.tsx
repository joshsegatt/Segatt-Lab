"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, GraduationCap } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { setLevel, useLevel } from "@/hooks/useLevel";
import { LEVELS, LEVEL_TEXT } from "@/lib/level";
import styles from "./LevelMenu.module.css";
import { localize } from "@/lib/i18n";

/** The knowledge level chip in the top bar; changes it without redoing onboarding. */
export function LevelMenu() {
  const { t, language } = useLanguage();
  const { level, chosen } = useLevel();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus();
      }
    };
    items.current[LEVELS.indexOf(level)]?.focus();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
    // Focus goes to the current level once, when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    items.current[(i + step + LEVELS.length) % LEVELS.length]?.focus();
  };

  if (chosen === "pending") return null;

  return (
    <div className={styles.wrap} ref={root}>
      <button type="button" className={`pill ${styles.chip}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title={t("lv.chip_hint")}>
        <GraduationCap size={15} strokeWidth={1.75} aria-hidden="true" />
        {localize(LEVEL_TEXT[level].name, language)}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label={t("lv.menu")}>
          <p className={styles.head}>{t("lv.menu")}</p>
          {LEVELS.map((l, i) => (
            <button
              key={l}
              ref={(el) => {
                items.current[i] = el;
              }}
              onKeyDown={(e) => move(e, i)}
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
                <b>{localize(LEVEL_TEXT[l].name, language)}</b>
                <small>{localize(LEVEL_TEXT[l].sees, language)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
