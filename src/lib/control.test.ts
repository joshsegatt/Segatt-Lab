import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, UPDATE_MODES } from "./control.ts";

test("every choice that is not safe says what can go wrong, in both languages", () => {
  for (const x of [...UPDATE_MODES, ...FEATURES]) {
    if (x.risk === "safe") continue;
    assert.ok(x.riskNote?.pt && x.riskNote.en, `${"id" in x ? x.id : x.name} needs a riskNote`);
  }
});

test("manual updates are risky", () => {
  assert.equal(UPDATE_MODES.find((m) => m.id === "manual")?.risk, "risky");
});

test("the feature list matches the backend list", () => {
  // Same list as FEATURES in src-tauri/src/features/control.rs (a Rust test checks the other side).
  assert.deepEqual(FEATURES.map((f) => f.name), [
    "Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform", "Microsoft-Hyper-V-All", "Containers-DisposableClientVM", "NetFx3",
  ]);
});
