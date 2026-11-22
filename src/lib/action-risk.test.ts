import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_RISK } from "./action-risk.ts";

test("every cleanup and fix that is not safe says what can go wrong, in both languages", () => {
  for (const [id, r] of Object.entries(ACTION_RISK)) {
    if (r.risk === "safe") continue;
    assert.ok(r.note?.pt && r.note.en, `${id} needs a note`);
  }
});

test("deleting Windows.old and emptying the Recycle Bin are risky", () => {
  assert.equal(ACTION_RISK.clean_windows_old.risk, "risky");
  assert.equal(ACTION_RISK.clean_recycle_bin.risk, "risky");
});
