import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestions, type Readings } from "./dashboard.ts";

const GB = 1024 ** 3;
const UNKNOWN: Readings = { admin: null, restartPending: null, updateMode: null, diskFree: null, diskTotal: null, cleanable: null, appUpdates: null, essentialPending: null, gamingPending: null };
const ids = (r: Partial<Readings>) => suggestions({ ...UNKNOWN, ...r }).map((s) => s.id);

test("nothing known, nothing suggested", () => {
  assert.deepEqual(ids({}), []);
});

test("this PC as read today: admin, 1 TB with room, 5 GB to clean, presets partly on", () => {
  // Real numbers: 5.2 GB in temp files, the Essential preset 2 tweaks short.
  assert.deepEqual(
    ids({ admin: true, restartPending: false, updateMode: "default", diskFree: 600 * GB, diskTotal: 931 * GB, cleanable: 5_557_537_384, appUpdates: 16, essentialPending: 2, gamingPending: 0 }),
    ["clean", "app_updates", "essential"],
  );
});

test("warnings come before tips", () => {
  const list = suggestions({ ...UNKNOWN, admin: false, restartPending: true, updateMode: "manual", appUpdates: 3 });
  assert.deepEqual(list.map((s) => [s.id, s.kind]), [["not_admin", "warn"], ["restart", "warn"], ["updates_off", "warn"], ["app_updates", "tip"]]);
});

test("a nearly full disk replaces the cleanup line", () => {
  assert.deepEqual(ids({ diskFree: 20 * GB, diskTotal: 256 * GB, cleanable: 3 * GB }), ["disk_full"]);
  assert.deepEqual(ids({ diskFree: 100 * GB, diskTotal: 256 * GB, cleanable: 3 * GB }), ["clean"]);
});

test("small cleanups and zero counts stay quiet", () => {
  assert.deepEqual(ids({ cleanable: 300 * 1024 ** 2, appUpdates: 0, essentialPending: 0, diskTotal: 0, diskFree: 0 }), []);
});
