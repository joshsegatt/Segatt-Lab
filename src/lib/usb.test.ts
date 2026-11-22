import { test } from "node:test";
import assert from "node:assert/strict";
import { driveLabel, matchesName, usbErrorKey, validAccount, PRE_ERASE } from "./usb.ts";

test("account names follow the same rules as usb.rs", () => {
  for (const ok of ["Josh", "Player 1", "joão", "a.b-c_d"]) assert.ok(validAccount(ok), ok);
  for (const bad of ["", " ", " Josh", "Josh ", 'a"b', "a/b", "a\\b", "x@y", "dots.", "abcdefghijklmnopqrstu", "a<b", "a\tb"]) {
    assert.ok(!validAccount(bad), bad);
  }
});

test("the confirmation must be the drive's own name", () => {
  assert.ok(matchesName("kingston  datatraveler 3.0 ", "Kingston DataTraveler 3.0"));
  assert.ok(!matchesName("Kingston", "Kingston DataTraveler 3.0"), "part of the name is not enough");
  assert.ok(!matchesName("   ", ""), "an empty name never confirms");
});

test("drive labels name the letters", () => {
  assert.equal(driveLabel({ name: "SanDisk", volumes: [{ letter: "E", label: "USB" }] }), "SanDisk (E:)");
  assert.equal(driveLabel({ name: "SanDisk", volumes: [] }), "SanDisk");
});

test("backend codes become sentences, and only pre-erase ones keep the drive", () => {
  assert.equal(usbErrorKey("USB_TOO_SMALL:8000000000"), "err_too_small");
  assert.equal(usbErrorKey("USB_CHANGED"), "err_changed");
  assert.equal(usbErrorKey("Clear-Disk : Access denied"), "err_access");
  assert.equal(usbErrorKey("DISM could not split install.wim: Error 112"), null);
  assert.ok(PRE_ERASE.has("err_changed") && !PRE_ERASE.has("err_verify") && !PRE_ERASE.has("err_cancelled"));
});
