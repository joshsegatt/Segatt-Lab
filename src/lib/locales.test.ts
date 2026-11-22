import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, translations, type Text } from "./i18n.ts";
import * as tweaks from "./tweaks-catalog.ts";
import * as control from "./control.ts";
import * as cleanup from "./cleanup.ts";
import * as fixes from "./fixes.ts";
import * as level from "./level.ts";
import * as risk from "./action-risk.ts";
import * as apps from "./app-categories.ts";
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
  [tweaks, control, cleanup, fixes, level, risk, apps].forEach(walk);
  walk(hardwareHint("high_performance_plan", { laptop: true, systemDisk: null } as unknown as Hardware));
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
