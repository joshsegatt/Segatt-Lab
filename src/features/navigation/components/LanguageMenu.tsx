"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGES } from "@/lib/i18n";
import styles from "./LevelMenu.module.css";

/** The language picker in the top bar: every language by its own name. */
export function LanguageMenu() {
  const { t, language, setLanguage } = useLanguage();
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
    items.current[LANGUAGES.findIndex((l) => l.code === language)]?.focus();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
    // Focus goes to the current language once, when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    items.current[(i + step + LANGUAGES.length) % LANGUAGES.length]?.focus();
  };

  return (
    <div className={styles.wrap} ref={root}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        aria-label={t("shell.switch_language")}
        title={t("shell.switch_language")}
      >
        <Languages size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <div className={`${styles.menu} ${styles.menuNarrow}`} role="menu" aria-label={t("shell.switch_language")}>
          {LANGUAGES.map((l, i) => (
            <button
              key={l.code}
              ref={(el) => {
                items.current[i] = el;
              }}
              onKeyDown={(e) => move(e, i)}
              type="button"
              role="menuitemradio"
              aria-checked={language === l.code}
              lang={l.tag}
              className={`${styles.item} ${language === l.code ? styles.on : ""}`}
              onClick={() => {
                setLanguage(l.code);
                setOpen(false);
              }}
            >
              <span className={styles.check} aria-hidden="true">{language === l.code && <Check size={15} strokeWidth={2} />}</span>
              <span className={styles.text}><b>{l.name}</b></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
