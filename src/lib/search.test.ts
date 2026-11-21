import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenResult, normalize, searchActions, type Action } from "./search.ts";

const ACTIONS: Action[] = [
  { id: "preset-gaming", kind: "preset", title: "Aplicar o modo jogo", subtitle: "6 ajustes", href: "/tweaks?preset=gaming", keywords: "jogo game fps" },
  { id: "preset-privacy", kind: "preset", title: "Privacidade máxima", subtitle: "7 ajustes", href: "/tweaks?preset=privacy", keywords: "privacy telemetria" },
  { id: "t-power", kind: "tweak", title: "Plano de energia de alto desempenho", subtitle: "Mantém o clock da CPU alto", href: "/tweaks?select=high_performance_plan", keywords: "power jogo game fps" },
  { id: "t-telemetry", kind: "tweak", title: "Desativar telemetria", subtitle: "Para o envio de dados", href: "/tweaks?select=disable_telemetry" },
  { id: "a-steam", kind: "app", title: "Steam", subtitle: "Valve.Steam · Gaming platform", href: "/install?q=Steam", keywords: "jogo game" },
  { id: "c-shader", kind: "cleanup", title: "Cache de shaders", subtitle: "Pode reduzir travadas em jogos", href: "/cleaner" },
  { id: "s-fixes", kind: "screen", title: "Reparos", subtitle: "SFC, DISM, rede", href: "/fixes" },
];

test("normalize ignores accents and case", () => {
  assert.equal(normalize("Ação MÁXIMA"), "acao maxima");
});

test("typing 'jogo' leads with the gaming preset and groups the rest", () => {
  const r = searchActions("jogo", ACTIONS);
  assert.equal(r.lead?.id, "preset-gaming");
  assert.deepEqual(r.groups.map((g) => g.kind), ["tweak", "app", "cleanup"]);
  assert.equal(r.groups[0].items[0].id, "t-power");
});

test("matches without accents and by English keyword", () => {
  assert.equal(searchActions("privacidade maxima", ACTIONS).lead?.id, "preset-privacy");
  assert.equal(searchActions("privacy", ACTIONS).lead?.id, "preset-privacy");
});

test("every token must match", () => {
  assert.equal(searchActions("steam telemetria", ACTIONS).total, 0);
});

test("empty or blank query returns nothing", () => {
  assert.equal(searchActions("   ", ACTIONS).total, 0);
});

test("flatten keeps the lead first, for keyboard order", () => {
  const flat = flattenResult(searchActions("jogo", ACTIONS));
  assert.equal(flat[0].id, "preset-gaming");
  assert.equal(flat.length, searchActions("jogo", ACTIONS).total);
});
