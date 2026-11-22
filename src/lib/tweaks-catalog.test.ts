import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, TWEAKS, tweaksInPreset } from "./tweaks-catalog.ts";

test("every tweak that is not safe says what can go wrong, in both languages", () => {
  for (const tw of TWEAKS) {
    if (tw.risk === "safe") continue;
    assert.ok(tw.riskNote?.pt && tw.riskNote.en, `${tw.id} needs a riskNote`);
  }
});

test("no preset turns on a risky tweak by itself", () => {
  for (const p of PRESETS) {
    const risky = tweaksInPreset(p.key).filter((tw) => tw.risk === "risky").map((tw) => tw.id);
    assert.deepEqual(risky, [], `${p.key} preset`);
  }
});

test("turning off Windows Update is marked risky", () => {
  assert.equal(TWEAKS.find((tw) => tw.id === "disable_windows_update")?.risk, "risky");
});
