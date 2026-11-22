import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXES, PANELS, fixReason } from "./fixes.ts";
import { ACTION_RISK } from "./action-risk.ts";

test("every repair has a risk, words in both languages and DISM before SFC", () => {
  assert.deepEqual(FIXES.map((f) => f.id), ["dism", "sfc", "net", "update", "cache"]);
  for (const f of FIXES) {
    assert.ok(f.id in ACTION_RISK, f.id);
    for (const lang of ["pt", "en"] as const) assert.ok(f.name[lang] && f.description[lang] && f.takes[lang], `${f.id} ${lang}`);
  }
});

test("panels match the backend allow-list", () => {
  // ALLOWED_PANELS in src-tauri/src/features/system.rs
  const allowed = ["compmgmt.msc", "devmgmt.msc", "diskmgmt.msc", "services.msc", "control", "ncpa.cpl", "powercfg.cpl", "sysdm.cpl"];
  assert.deepEqual(PANELS.map((p) => p.cmd).sort(), allowed.sort());
});

test("known failures get a reason", () => {
  assert.equal(fixReason("Administrator required.\nVocê precisa ser um administrador"), "fx.err_admin");
  assert.equal(fixReason("DISM exit code 0x2E4.\nErro: 740"), "fx.err_admin");
  assert.equal(fixReason("DISM exit code 0x800F081F.\nThe source files could not be found."), "fx.err_source");
  assert.equal(fixReason("Stopped after 90 minutes without finishing."), "fx.err_timeout");
  assert.equal(fixReason("something else"), null);
});
