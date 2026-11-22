// Languages of the app. UI strings live in src/lib/locales/<code>.ts; catalog
// texts (tweaks, apps, cleanups...) are written in Portuguese and English in
// the catalogs, and every other language translates them from English in its
// locale's `catalog` map. locales.test.ts fails when anything is missing.

// Relative with extension so the Node test runner can load them too.
import en from "./locales/en.ts";
import pt from "./locales/pt.ts";
import es from "./locales/es.ts";
import fr from "./locales/fr.ts";
import de from "./locales/de.ts";
import ru from "./locales/ru.ts";
import zh from "./locales/zh.ts";
import ja from "./locales/ja.ts";
import ko from "./locales/ko.ts";
import tr from "./locales/tr.ts";

export type Language = "pt" | "en" | "es" | "fr" | "de" | "ru" | "zh" | "ja" | "ko" | "tr";

/** Each language by its own name, in menu order. */
export const LANGUAGES: { code: Language; name: string; tag: string }[] = [
  { code: "pt", name: "Português", tag: "pt-BR" },
  { code: "en", name: "English", tag: "en-US" },
  { code: "es", name: "Español", tag: "es-ES" },
  { code: "fr", name: "Français", tag: "fr-FR" },
  { code: "de", name: "Deutsch", tag: "de-DE" },
  { code: "ru", name: "Русский", tag: "ru-RU" },
  { code: "zh", name: "简体中文", tag: "zh-CN" },
  { code: "ja", name: "日本語", tag: "ja-JP" },
  { code: "ko", name: "한국어", tag: "ko-KR" },
  { code: "tr", name: "Türkçe", tag: "tr-TR" },
];

export const isLanguage = (v: unknown): v is Language => LANGUAGES.some((l) => l.code === v);

/** BCP 47 tag for dates and numbers ("pt-BR", "ja-JP"...). */
export const localeTag = (lang: Language) => LANGUAGES.find((l) => l.code === lang)?.tag ?? "en-US";

/** The shape every locale's UI strings must have: the English one. */
export type Dict = typeof en.ui;
/** Other plural forms of a UI string, by Intl.PluralRules category; the `ui` string is the "other" form. */
export type Plurals = Record<string, Partial<Record<Intl.LDMLPluralRule, string>>>;
export interface Locale {
  ui: Dict;
  /** English catalog text -> this language. Empty for pt and en. */
  catalog: Record<string, string>;
  /** Forms for counts that read differently ("1 tweak" vs "2 tweaks"), keyed by UI path. */
  plural?: Plurals;
}

export const translations: Record<Language, Locale> = { pt, en, es, fr, de, ru, zh, ja, ko, tr };

/** A catalog text: written in Portuguese and English where it is defined. */
export type Text = { pt: string; en: string };

/** A catalog text in this language; English when a translation is missing. */
export function localize(text: Text, lang: Language): string;
export function localize(text: Text | null | undefined, lang: Language): string | undefined;
export function localize(text: Text | null | undefined, lang: Language): string | undefined {
  if (!text) return undefined;
  if (lang === "pt" || lang === "en") return text[lang];
  return translations[lang].catalog[text.en] ?? text.en;
}

/** The plural form of a UI string for this count, when the language has one; else undefined. */
export function pluralForm(lang: Language, path: string, count: number): string | undefined {
  const rule = new Intl.PluralRules(localeTag(lang)).select(count);
  return translations[lang].plural?.[path]?.[rule];
}
