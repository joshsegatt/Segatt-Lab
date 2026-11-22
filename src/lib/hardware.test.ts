import { test } from "node:test";
import assert from "node:assert/strict";
import { binGb, cleanBoard, cleanCpu, diskKind, diskSize, hardwareHint, presetForPc, ramSummary, realMts, vendor, type Hardware } from "./hardware.ts";

// Real report from this PC (cargo test dump_hardware_json -- --ignored --nocapture).
const REAL: Hardware = {
  board: { maker: "Micro-Star International Co., Ltd.", model: "MAG Z790 TOMAHAWK WIFI (MS-7D91)", biosVersion: "H.J0", biosDate: "2026-09-14" },
  cpu: { name: "Intel(R) Core(TM) i7-14700K", cores: 20, threads: 28, baseMhz: 3400 },
  gpus: [{ name: "AMD Radeon RX 9070", driver: "32.0.32015.7029", vramBytes: 17095983104, refreshHz: 280, width: 1920, height: 1080 }],
  ram: [
    { bytes: 17179869184, ratedMts: 5600, configuredMts: 5600, kind: "DDR5", maker: "Kingston", part: "KF556C36-16", slot: "Controller0-DIMMA2" },
    { bytes: 17179869184, ratedMts: 5600, configuredMts: 5600, kind: "DDR5", maker: "Kingston", part: "KF556C36-16", slot: "Controller1-DIMMB2" },
  ],
  systemDisk: { model: "KINGSTON SNV3S1000G", media: "SSD", bus: "NVMe", bytes: 1000204886016 },
  os: { name: "Microsoft Windows 11 Pro", version: "26H2", build: "26300.10075" },
  laptop: false,
  onBattery: false,
};

test("reads names the way people say them", () => {
  assert.equal(cleanCpu("Intel(R) Core(TM) i7-14700K"), "Intel Core i7-14700K");
  assert.equal(cleanCpu("AMD Ryzen 7 7800X3D 8-Core Processor"), "AMD Ryzen 7 7800X3D");
  assert.equal(cleanCpu("Intel(R) Core(TM) i5-9400F CPU @ 2.90GHz"), "Intel Core i5-9400F");
  assert.equal(vendor("Micro-Star International Co., Ltd."), "MSI");
  assert.equal(vendor("ASUSTeK COMPUTER INC."), "ASUS");
  assert.equal(cleanBoard("MAG Z790 TOMAHAWK WIFI (MS-7D91)"), "MAG Z790 TOMAHAWK WIFI");
});

test("sizes match what the box says", () => {
  assert.equal(binGb(17095983104), "16 GB", "VRAM of a 16 GB card");
  assert.equal(diskSize(1000204886016), "1 TB");
  assert.equal(diskSize(512110190592), "512 GB");
  assert.equal(diskSize(2000398934016), "2 TB");
  assert.deepEqual(ramSummary(REAL.ram), { total: "32 GB DDR5", detail: "5600 MT/s · 2 × 16 GB" });
  assert.equal(diskKind(REAL.systemDisk!), "NVMe SSD");
  assert.equal(diskKind({ model: null, media: "HDD", bus: "SATA", bytes: null }), "HD");
});

test("a desktop on an SSD keeps the presets as they are", () => {
  assert.equal(hardwareHint("high_performance_plan", REAL), null);
  assert.equal(hardwareHint("disable_superfetch", REAL), null);
  assert.ok(presetForPc("gaming", REAL).some((tw) => tw.id === "high_performance_plan"));
});

test("a laptop never gets the high performance plan from a preset", () => {
  const laptop = { ...REAL, laptop: true };
  assert.ok(hardwareHint("high_performance_plan", laptop)?.skip);
  for (const key of ["essential", "gaming", "privacy"] as const) {
    assert.ok(!presetForPc(key, laptop).some((tw) => tw.id === "high_performance_plan"), key);
  }
});

test("Windows on a hard drive keeps SysMain on", () => {
  const hdd = { ...REAL, systemDisk: { model: "WDC WD10EZEX", media: "HDD", bus: "SATA", bytes: 1e12 } };
  assert.ok(hardwareHint("disable_superfetch", hdd)?.skip);
  assert.ok(!presetForPc("essential", hdd).some((tw) => tw.id === "disable_superfetch"));
});

test("older SMBIOS that reports MHz still reads in MT/s", () => {
  assert.equal(realMts(1600, "DDR4"), 3200);
  assert.equal(realMts(3200, "DDR4"), 3200);
  assert.equal(realMts(2800, "DDR5"), 5600);
  assert.equal(realMts(1333, "DDR3"), 1333, "no floor known: left as is");
});

test("without a report nothing is left out", () => {
  assert.equal(hardwareHint("high_performance_plan", null), null);
});
