"use client";

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore, ReactNode } from "react";
import { isLanguage, LANGUAGES, localeTag, pluralForm, translations, type Language } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** With `count`, picks the plural form for that number when the language has one. */
  t: (path: string, count?: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "segatt_lang";
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // storage unavailable: fall back to the browser language
  }
  // Windows' language when the app speaks it; English otherwise.
  const base = navigator.language.split("-")[0];
  return LANGUAGES.find((l) => l.code === base)?.code ?? "en";
}

function lookup(dict: unknown, path: string): string | undefined {
  let current = dict;
  for (const key of path.split(".")) {
    if (current && typeof current === "object" && key in current) current = (current as Record<string, unknown>)[key];
    else return undefined;
  }
  return typeof current === "string" ? current : undefined;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server snapshot is "pt" so the static export hydrates without a mismatch.
  const language = useSyncExternalStore(subscribe, readLanguage, () => "pt" as Language);

  // Keep the document language in sync for screen readers and hyphenation.
  useEffect(() => {
    document.documentElement.lang = localeTag(language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // not persisted, still switch for this session
    }
    listeners.forEach((l) => l());
  }, []);

  // A key missing in this language falls back to English, then to the key itself.
  const t = useCallback((path: string, count?: number): string => {
    const form = count === undefined ? undefined : pluralForm(language, path, count);
    if (form) return form;
    return lookup(translations[language].ui, path) ?? lookup(translations.en.ui, path) ?? path;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
