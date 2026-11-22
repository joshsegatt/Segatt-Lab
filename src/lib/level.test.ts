import { test } from "node:test";
import assert from "node:assert/strict";
import { allows, forLevel, isLevel, levelFor, showsAction, showsTweak, LEVELS, LEVEL_TEXT } from "./level.ts";
import { TWEAKS } from "./tweaks-catalog.ts";

test("each level sees its own risks and everything below", () => {
  assert.deepEqual(LEVELS.map((l) => [allows(l, "safe"), allows(l, "moderate"), allows(l, "risky")]), [
    [true, false, false],
    [true, true, false],
    [true, true, true],
  ]);
  assert.equal(levelFor("moderate"), "intermediate");
  assert.equal(levelFor("risky"), "advanced");
});

test("a beginner gets only safe tweaks", () => {
  const seen = forLevel(TWEAKS, "beginner");
  assert.ok(seen.length > 0);
  assert.ok(seen.every((tw) => tw.risk === "safe"));
  assert.ok(forLevel(TWEAKS, "intermediate").every((tw) => tw.risk !== "risky"));
  assert.equal(forLevel(TWEAKS, "advanced").length, TWEAKS.length);
});

test("a tweak already on stays listed at every level, so it can be undone", () => {
  assert.equal(showsTweak("beginner", "risky", false), false);
  assert.equal(showsTweak("beginner", "risky", true), true);
});

test("actions only hide what is risky, and never the current choice", () => {
  assert.equal(showsAction("beginner", "moderate"), true, "Security-only update mode stays for beginners");
  assert.equal(showsAction("intermediate", "risky"), false);
  assert.equal(showsAction("beginner", "risky", true), true);
  assert.equal(showsAction("advanced", "risky"), true);
});

test("stored values are checked before use", () => {
  assert.ok(isLevel("advanced"));
  for (const bad of ["", "expert", null, 2]) assert.ok(!isLevel(bad));
});

test("every level is described in both languages", () => {
  for (const l of LEVELS) for (const lang of ["pt", "en"] as const) {
    assert.ok(LEVEL_TEXT[l].name[lang] && LEVEL_TEXT[l].who[lang] && LEVEL_TEXT[l].sees[lang], `${l} ${lang}`);
  }
});
