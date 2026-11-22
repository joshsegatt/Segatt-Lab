import { test } from "node:test";
import assert from "node:assert/strict";
import { driveLabel, driveUntouched, errorArg, matchesName, usbErrorKey, validAccount } from "./usb.ts";

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
  assert.equal(usbErrorKey("USB_FILE_TOO_BIG:install.esd"), "err_file_too_big");
  assert.equal(errorArg("USB_FILE_TOO_BIG:install.esd"), "install.esd");
  assert.equal(usbErrorKey("USB_CANCELLED_EARLY"), "err_cancelled");
  assert.ok(driveUntouched("USB_CHANGED") && driveUntouched("USB_CANCELLED_EARLY") && driveUntouched("USB_NO_TEMP_SPACE:5000"));
  assert.ok(!driveUntouched("USB_VERIFY_FAILED") && !driveUntouched("USB_CANCELLED") && !driveUntouched("Clear-Disk failed"), "after the erase the drive is incomplete");
});
