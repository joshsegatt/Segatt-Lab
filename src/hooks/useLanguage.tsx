"use client";

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore, ReactNode } from "react";
import { Language, translations } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "segatt_lang";
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "pt" || saved === "en") return saved;
  } catch {
    // storage unavailable: fall back to the browser language
  }
  return navigator.language.split("-")[0] === "en" ? "en" : "pt";
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
    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // not persisted, still switch for this session
    }
    listeners.forEach((l) => l());
  }, []);

  const t = useCallback((path: string): string => {
    let current: unknown = translations[language];
    for (const key of path.split(".")) {
      if (current && typeof current === "object" && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return path;
      }
    }
    return typeof current === "string" ? current : path;
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
