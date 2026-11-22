"use client";

import { Check, Languages } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { LANGUAGES } from "@/lib/i18n";
import styles from "./LevelMenu.module.css";
import { useMenu } from "./useMenu";

/** The language picker in the top bar: every language by its own name. */
export function LanguageMenu() {
  const { t, language, setLanguage } = useLanguage();
  const { open, setOpen, root, itemRef, move } = useMenu(LANGUAGES.length, LANGUAGES.findIndex((l) => l.code === language));

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
              ref={itemRef(i)}
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
