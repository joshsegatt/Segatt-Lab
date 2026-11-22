import { test } from "node:test";
import assert from "node:assert/strict";
import { STATIONS, partNames, stationOfCleanup, stationOfTweak } from "./scene.ts";
import { TWEAKS } from "./tweaks-catalog.ts";
import { CLEANUPS } from "./cleanup.ts";

test("every tweak and cleanup lands on a real station", () => {
  for (const tw of TWEAKS) assert.ok(STATIONS.includes(stationOfTweak(tw.id, tw.group)), tw.id);
  for (const c of CLEANUPS) assert.ok(STATIONS.includes(stationOfCleanup(c.id)), c.id);
  assert.equal(stationOfTweak("enable_hags", "performance"), "gpu");
  assert.equal(stationOfTweak("disable_telemetry", "privacy"), "net");
  assert.equal(stationOfCleanup("clean_temp"), "disk");
});

test("stations show the parts Windows reported", () => {
  const names = partNames({
    board: { maker: "ASUSTeK COMPUTER INC.", model: "ROG STRIX B650E-F", biosVersion: null, biosDate: null },
    cpu: { name: "AMD Ryzen 7 7800X3D 8-Core Processor", cores: 8, threads: 16, baseMhz: 4200 },
    gpus: [{ name: "NVIDIA GeForce RTX 4070 SUPER", driver: null, vramBytes: null, refreshHz: 165, width: 2560, height: 1440 }],
    ram: [{ bytes: 17179869184, ratedMts: 6000, configuredMts: 6000, kind: "DDR5", maker: null, part: null, slot: null },
          { bytes: 17179869184, ratedMts: 6000, configuredMts: 6000, kind: "DDR5", maker: null, part: null, slot: null }],
    systemDisk: { model: "Samsung SSD 990 PRO 2TB", media: "SSD", bus: "NVMe", bytes: 2000398934016 },
    os: { name: null, version: null, build: null },
    laptop: false,
    onBattery: false,
  });
  assert.equal(names.cpu, "AMD Ryzen 7 7800X3D");
  assert.equal(names.ram, "32 GB · 6000 MT/s");
  assert.equal(names.display, "2560×1440 · 165 Hz");
  assert.equal(names.board, "ASUS ROG STRIX B650E-F");
  assert.equal(names.net, undefined);
  assert.deepEqual(partNames(null), {});
});
