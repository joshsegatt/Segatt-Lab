// Pure helpers of the bootable USB screen. The rules mirror usb.rs.

import type { UsbDisk } from "@/hooks/useUsb";

/** Windows local account names: 1 to 20 characters, none of the reserved ones. */
export function validAccount(name: string): boolean {
  return (
    name.length > 0 &&
    name.trim() === name &&
    [...name].length <= 20 &&
    !name.endsWith(".") &&
    !/["/\\[\]:;|=,+*?<>@%\u0000-\u001f\u007f]/.test(name)
  );
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The typed confirmation: the drive's name, ignoring case and extra spaces. */
export function matchesName(typed: string, name: string): boolean {
  return norm(typed) !== "" && norm(typed) === norm(name);
}

/** "SanDisk Cruzer (E:)" or just the name when it has no letter. */
export function driveLabel(d: Pick<UsbDisk, "name" | "volumes">): string {
  const letters = d.volumes.map((v) => `${v.letter}:`).join(", ");
  return letters ? `${d.name} (${letters})` : d.name;
}

const CODES: Record<string, string> = {
  USB_CHANGED: "err_changed",
  USB_CANCELLED: "err_cancelled",
  USB_CANCELLED_EARLY: "err_cancelled",
  USB_ISO_ON_TARGET: "err_iso_on_target",
  USB_UNSUPPORTED: "err_unsupported",
  USB_NOT_ISO: "err_not_iso",
  USB_TOO_SMALL: "err_too_small",
  USB_FILE_TOO_BIG: "err_file_too_big",
  USB_NO_TEMP_SPACE: "err_no_temp_space",
  USB_VERIFY_FAILED: "err_verify",
  USB_BUSY: "err_busy",
};

/** The usb.* key for a backend error, or null to show the raw text. */
export function usbErrorKey(error: string): string | null {
  const code = error.split(":")[0].trim();
  if (CODES[code]) return CODES[code];
  if (/access (is )?denied|acesso negado|0x80070005/i.test(error)) return "err_access";
  return null;
}

/** Errors raised before anything was erased: the drive is as it was. */
const UNTOUCHED = new Set(["USB_CHANGED", "USB_ISO_ON_TARGET", "USB_UNSUPPORTED", "USB_NOT_ISO", "USB_TOO_SMALL", "USB_FILE_TOO_BIG", "USB_NO_TEMP_SPACE", "USB_BUSY", "USB_CANCELLED_EARLY"]);

export function driveUntouched(error: string): boolean {
  return UNTOUCHED.has(error.split(":")[0].trim());
}

/** The value a code carries after its colon: a size in bytes or a file name. */
export function errorArg(error: string): string {
  return error.split(":").slice(1).join(":");
}
