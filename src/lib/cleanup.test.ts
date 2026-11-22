import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEANUPS, formatBytes, startsPicked } from "./cleanup.ts";
import { ACTION_RISK } from "./action-risk.ts";

// Ids must match IDS in src-tauri/src/features/cleaner.rs.
const BACKEND = [
  "clean_temp", "clean_prefetch", "flush_dns", "clean_windows_update", "clean_shader_cache",
  "clean_recycle_bin", "clean_windows_old", "clean_delivery_optimization", "clean_thumbnails",
  "clean_logs_minidumps", "clean_browser_cache", "clean_discord_cache", "clean_steam_web_cache",
];

test("the list covers every backend cleanup, each with a risk", () => {
  assert.deepEqual(CLEANUPS.map((c) => c.id).sort(), [...BACKEND].sort());
  for (const c of CLEANUPS) {
    assert.ok(c.id in ACTION_RISK, `${c.id} has no risk`);
    assert.ok(c.name.pt && c.name.en && c.description.pt && c.description.en, c.id);
  }
});

test("only safe cleanups that free something start picked", () => {
  assert.equal(startsPicked("clean_temp", 5_557_537_384), true);
  assert.equal(startsPicked("clean_temp", 0), false, "nothing to free");
  assert.equal(startsPicked("flush_dns", null), true, "frees no files but is harmless");
  assert.equal(startsPicked("clean_shader_cache", 283_394_304), false, "moderate: games rebuild shaders");
  assert.equal(startsPicked("clean_recycle_bin", 10_000), false, "risky");
});

test("sizes read like Explorer", () => {
  // Real readings from this PC (cargo test dump_cleanup_sizes -- --ignored --nocapture).
  assert.equal(formatBytes(5_557_537_384, "pt"), "5,2 GB");
  assert.equal(formatBytes(5_557_537_384, "en"), "5.2 GB");
  assert.equal(formatBytes(283_394_304, "pt"), "270 MB");
  assert.equal(formatBytes(258, "pt"), "1 KB");
  assert.equal(formatBytes(0, "pt"), "0 KB");
  assert.equal(formatBytes(1024 ** 3, "pt"), "1 GB");
});
