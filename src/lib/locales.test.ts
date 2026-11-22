import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, localeTag, pluralForm, translations, type Text } from "./i18n.ts";
import * as tweaks from "./tweaks-catalog.ts";
import * as control from "./control.ts";
import * as cleanup from "./cleanup.ts";
import * as fixes from "./fixes.ts";
import * as level from "./level.ts";
import * as risk from "./action-risk.ts";
import * as apps from "./app-categories.ts";
import * as debloat from "./debloat.ts";
import { hardwareHint, type Hardware } from "./hardware.ts";

const flat = (o: object, p = ""): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

// Every catalog text, the way locale files key them: by the English text.
function catalogTexts(): Text[] {
  const out = new Map<string, Text>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    const t = v as Partial<Text>;
    if (typeof t.pt === "string" && typeof t.en === "string") {
      out.set(t.en, t as Text);
      return;
    }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x);
  };
  [tweaks, control, cleanup, fixes, level, risk, apps, debloat].forEach(walk);
  walk(hardwareHint("high_performance_plan", { laptop: true, systemDisk: null } as unknown as Hardware));
  walk(hardwareHint("disable_power_throttling", { laptop: true, systemDisk: null } as unknown as Hardware));
  walk(hardwareHint("disable_superfetch", { laptop: false, systemDisk: { media: "HDD" } } as unknown as Hardware));
  return [...out.values()];
}

const EN = new Map(flat(translations.en.ui));
const CATALOG = catalogTexts();

test("the language list and the locales agree", () => {
  assert.deepEqual(LANGUAGES.map((l) => l.code).sort(), Object.keys(translations).sort());
});

for (const { code } of LANGUAGES) {
  const ui = new Map(flat(translations[code].ui));

  test(`${code}: every UI string, no extras, same placeholders`, () => {
    assert.deepEqual([...ui.keys()].sort(), [...EN.keys()].sort(), `${code} keys differ from en`);
    for (const [k, v] of ui) {
      assert.ok(v.trim(), `${code}.${k} is empty`);
      assert.equal(vars(v), vars(EN.get(k)!), `${code}.${k} placeholders`);
    }
  });

  test(`${code}: plural forms point at real strings, real rules and the same placeholders`, () => {
    const rules = new Intl.PluralRules(localeTag(code)).resolvedOptions().pluralCategories;
    for (const [path, forms] of Object.entries(translations[code].plural ?? {})) {
      assert.ok(ui.has(path), `${code} plural for unknown string ${path}`);
      for (const [rule, text] of Object.entries(forms)) {
        assert.ok((rules as string[]).includes(rule), `${code} has no "${rule}" plural (${path})`);
        assert.equal(vars(text!), vars(EN.get(path)!), `${code}.${path}[${rule}] placeholders`);
      }
    }
  });

  if (code === "pt" || code === "en") continue;

  test(`${code}: is translated, not a copy of English`, () => {
    const same = [...ui].filter(([k, v]) => v === EN.get(k) && /[a-z]{4}/i.test(v));
    // Brand and technical words (winget, DNS, SFC...) may stay; a copied locale may not.
    assert.ok(same.length < EN.size * 0.15, `${code}: ${same.length} strings equal to English`);
  });

  test(`${code}: every catalog text, no stale ones`, () => {
    const catalog = translations[code].catalog;
    for (const text of CATALOG) {
      const v = catalog[text.en];
      assert.ok(v && v.trim(), `${code} misses catalog text: ${text.en}`);
      assert.equal(vars(v), vars(text.en), `${code} placeholders in: ${text.en}`);
    }
    const known = new Set(CATALOG.map((t) => t.en));
    const stale = Object.keys(catalog).filter((k) => !known.has(k));
    assert.deepEqual(stale, [], `${code} has catalog entries for texts that no longer exist`);
  });
}

test("counts pick the right form", () => {
  // The screenshot case: one Game-mode tweak pending, German UI.
  assert.equal(pluralForm("de", "dash.gaming_sub", 1), "{n} Tweak noch aus. Sie prüfen vor dem Anwenden.");
  assert.equal(pluralForm("de", "dash.gaming_sub", 2), undefined, "2 uses the ui string");
  assert.equal(pluralForm("pt", "pf.already", 1), "{n} já ligado aqui");
  assert.equal(pluralForm("fr", "pf.already", 0), "{n} déjà activé ici", "French treats 0 as singular");
  assert.equal(pluralForm("ja", "dash.gaming_sub", 1), undefined, "no plural in Japanese");
});
