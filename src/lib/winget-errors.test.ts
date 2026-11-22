import { test } from "node:test";
import assert from "node:assert/strict";
import { wingetReason } from "./winget-errors.ts";

test("maps winget install result codes", () => {
  assert.equal(wingetReason("winget exit code 0x8A150107.\nDownloading..."), "no_network");
  assert.equal(wingetReason("winget exit code 0x8a150105."), "disk_full");
  assert.equal(wingetReason("winget exit code 0x8A15010C."), "cancelled");
  assert.equal(wingetReason("winget exit code 0x8A15002B."), "no_update");
});

test("reads MSI exit codes passed through by winget", () => {
  assert.equal(wingetReason("winget exit code 0x8A150011.\nInstaller failed with exit code: 1603"), "installer");
  assert.equal(wingetReason("Installer failed with exit code: 1618"), "busy");
  assert.equal(wingetReason("Installer failed with exit code: 3010"), "reboot");
});

test("recognizes the backend timeout", () => {
  assert.equal(wingetReason("Stopped after 20 minutes without finishing."), "timeout");
});

test("unknown codes stay unknown", () => {
  assert.equal(wingetReason("winget exit code 0x80004005."), "unknown");
  assert.equal(wingetReason(""), "unknown");
});
