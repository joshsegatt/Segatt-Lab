import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProfile, fileStamp, isPackageId, parseProfile, planImport, MAX_PROFILE_BYTES, type Profile } from "./profile.ts";
import type { Hardware } from "./hardware.ts";
import type { TweakState } from "../hooks/useTweakStates.ts";
import type { InstalledApp } from "../hooks/useApps.ts";

const st = (id: string, status: TweakState["status"]): TweakState => ({ id, status, scope: "user", reason: null, changes: [], restart: false });
const app = (id: string, name: string): InstalledApp => ({ id, name, version: "1.0", available: null });

const STATES = Object.fromEntries([st("dark_mode", "active"), st("disable_telemetry", "active"), st("show_hidden_files", "inactive")].map((s) => [s.id, s]));
const INSTALLED = { "git.git": app("Git.Git", "Git"), "7zip.7zip": app("7zip.7zip", "7-Zip") };

test("export carries the tweaks that are on and the winget apps, nothing else", () => {
  const p = buildProfile(STATES, INSTALLED, new Date("2026-11-22T12:00:00Z"));
  assert.equal(p.format, "segatt-tools-profile");
  assert.deepEqual(p.tweaks.sort(), ["dark_mode", "disable_telemetry"]);
  assert.deepEqual(p.apps, [{ id: "7zip.7zip", name: "7-Zip" }, { id: "Git.Git", name: "Git" }]);
  assert.equal(p.exportedAt, "2026-11-22T12:00:00.000Z");
});

test("an exported profile reads back as itself", () => {
  const p = buildProfile(STATES, INSTALLED, new Date("2026-11-22T12:00:00Z"));
  const r = parseProfile(JSON.stringify(p));
  assert.ok(r.ok);
  assert.deepEqual(r.profile, p);
  assert.equal(r.dropped, 0);
});

test("anything that is not a profile is refused with a reason", () => {
  assert.deepEqual(parseProfile("{not json"), { ok: false, error: "not_json" });
  assert.deepEqual(parseProfile("[]"), { ok: false, error: "not_profile" });
  assert.deepEqual(parseProfile(JSON.stringify({ format: "other", version: 1 })), { ok: false, error: "not_profile" });
  assert.deepEqual(parseProfile(JSON.stringify({ format: "segatt-tools-profile", version: 2, tweaks: ["dark_mode"] })), { ok: false, error: "newer" });
  for (const version of [0, -1, 1.5, "1"]) {
    assert.deepEqual(parseProfile(JSON.stringify({ format: "segatt-tools-profile", version, tweaks: ["dark_mode"] })), { ok: false, error: "not_profile" }, String(version));
  }
  assert.deepEqual(parseProfile(JSON.stringify({ format: "segatt-tools-profile", version: 1, tweaks: [], apps: [] })), { ok: false, error: "empty" });
  assert.deepEqual(parseProfile(" ".repeat(MAX_PROFILE_BYTES + 1)), { ok: false, error: "too_big" });
});

test("unknown tweaks and unsafe package ids never get through", () => {
  const r = parseProfile(JSON.stringify({
    format: "segatt-tools-profile",
    version: 1,
    tweaks: ["dark_mode", "dark_mode", "format_c", 42],
    apps: [
      { id: "Git.Git", name: "Git" },
      { id: "git.git", name: "dup" },
      { id: "Evil.App & calc", name: "x" },
      { id: "-flag", name: "x" },
      { id: "../x", name: "x" },
      { id: "Mozilla.Firefox.pt-BR" },
      "Git.Git",
    ],
  }));
  assert.ok(r.ok);
  assert.deepEqual(r.profile.tweaks, ["dark_mode"]);
  assert.deepEqual(r.profile.apps, [{ id: "Git.Git", name: "Git" }, { id: "Mozilla.Firefox.pt-BR", name: "Mozilla.Firefox.pt-BR" }]);
  assert.equal(r.dropped, 8);
  assert.equal(r.profile.exportedAt, "");
});

test("package id rule matches the backend", () => {
  for (const ok of ["Git.Git", "7zip.7zip", "Microsoft.VCRedist.2015+.x64", "Mozilla.Firefox.pt-BR", "a_b"]) assert.ok(isPackageId(ok), ok);
  for (const bad of ["", "-x", ".x", "a b", "a;b", "a\\b", "x".repeat(129)]) assert.ok(!isPackageId(bad), bad);
});

test("import plan skips what this PC already has and holds back risky and off-profile tweaks", () => {
  const profile: Profile = {
    format: "segatt-tools-profile",
    version: 1,
    exportedAt: "",
    tweaks: ["dark_mode", "show_hidden_files", "disable_windows_update", "high_performance_plan", "set_dns_cloudflare"],
    apps: [{ id: "Git.Git", name: "Git" }, { id: "Valve.Steam", name: "Steam" }],
  };
  const laptop = { laptop: true, systemDisk: null } as unknown as Hardware;
  const plan = planImport(profile, { ...STATES, set_dns_cloudflare: st("set_dns_cloudflare", "unknown") }, INSTALLED, laptop);
  assert.equal(plan.tweaksDone, 1);
  assert.deepEqual(plan.tweaks.map((p) => [p.tweak.id, p.pick, p.why]), [
    ["high_performance_plan", false, "not_for_pc"],
    ["set_dns_cloudflare", false, "unknown"],
    ["show_hidden_files", true, null],
    ["disable_windows_update", false, "risky"],
  ]);
  assert.deepEqual(plan.apps, [{ id: "Valve.Steam", name: "Steam" }]);
  assert.equal(plan.appsDone, 1);
});

test("file stamp is the local date", () => {
  assert.equal(fileStamp(new Date(2026, 10, 2, 23, 59)), "2026-11-02");
});
