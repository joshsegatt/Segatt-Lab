// Turns a failed winget run into a reason the user can act on. The backend error
// carries winget's exit code ("winget exit code 0x8A150107.") and the last lines
// winget printed; the raw text stays available under "details".

export type WingetReason =
  | "in_use"
  | "disk_full"
  | "no_network"
  | "reboot"
  | "cancelled"
  | "policy"
  | "busy"
  | "installer"
  | "timeout"
  | "no_update"
  | "unknown";

// winget install result codes (APPINSTALLER_CLI_ERROR_INSTALL_*).
const CODES: Record<string, WingetReason> = {
  "0X8A150101": "in_use",
  "0X8A150102": "busy",
  "0X8A150103": "in_use",
  "0X8A150105": "disk_full",
  "0X8A150107": "no_network",
  "0X8A150109": "reboot",
  "0X8A15010A": "reboot",
  "0X8A15010C": "cancelled",
  "0X8A15010F": "policy",
  "0X8A150111": "in_use",
  // UPDATE_NOT_APPLICABLE on an upgrade: winget lists an update it cannot apply.
  "0X8A15002B": "no_update",
};

export function wingetReason(message: string): WingetReason {
  if (/stopped after \d+ minutes/i.test(message)) return "timeout";
  const code = message.match(/0x[0-9a-f]{8}/i)?.[0].toUpperCase();
  if (code && CODES[code]) return CODES[code];
  // MSI installer exit codes winget passes through.
  if (/exit code:?\s*1618\b/i.test(message)) return "busy";
  if (/exit code:?\s*(3010|1641)\b/i.test(message)) return "reboot";
  if (/exit code:?\s*1603\b/i.test(message)) return "installer";
  return "unknown";
}
