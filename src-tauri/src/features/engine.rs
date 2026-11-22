//! Tweak engine: every tweak knows how to read its real state, apply itself and
//! revert to the value the PC had before. Registry tweaks use the registry API
//! directly (no console windows); services, power plan, DNS and boot settings use
//! the Windows tools without a window. The original value is saved to a local
//! snapshot file before the first change, so a revert restores exactly that.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::features::utils::{ps_quote, run_hidden, run_hidden_powershell};

// ── Specs ────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Hive {
    Hklm,
    Hkcu,
}

impl Hive {
    fn label(self) -> &'static str {
        match self {
            Hive::Hklm => "HKLM",
            Hive::Hkcu => "HKCU",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum RegData {
    Dword(u32),
    Sz(String),
}

impl RegData {
    fn display(&self) -> String {
        match self {
            RegData::Dword(v) => v.to_string(),
            RegData::Sz(s) if s.is_empty() => "\"\"".to_string(),
            RegData::Sz(s) => s.clone(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct RegValueSpec {
    pub hive: Hive,
    pub path: &'static str,
    /// Empty string = the key's default value.
    pub name: &'static str,
    pub want: RegData,
    /// Windows default, used to revert when no snapshot exists. None = value absent.
    pub default: Option<RegData>,
}

#[derive(Clone, Debug)]
pub enum Kind {
    Registry { values: Vec<RegValueSpec>, delete_key_on_revert: Option<(Hive, &'static str)> },
    Service { name: &'static str, default_start: u32 },
    PowerPlan,
    Dns,
    Hpet,
    BootMenu,
}

#[derive(Clone, Debug)]
pub struct TweakSpec {
    pub id: &'static str,
    pub kind: Kind,
    /// True when the change only takes full effect after a restart or sign-out.
    pub restart: bool,
}

fn dword(hive: Hive, path: &'static str, name: &'static str, want: u32, default: Option<u32>) -> RegValueSpec {
    RegValueSpec { hive, path, name, want: RegData::Dword(want), default: default.map(RegData::Dword) }
}

fn sz(hive: Hive, path: &'static str, name: &'static str, want: &str, default: Option<&str>) -> RegValueSpec {
    RegValueSpec { hive, path, name, want: RegData::Sz(want.into()), default: default.map(|d| RegData::Sz(d.into())) }
}

fn reg(id: &'static str, restart: bool, values: Vec<RegValueSpec>) -> TweakSpec {
    TweakSpec { id, kind: Kind::Registry { values, delete_key_on_revert: None }, restart }
}

const DATA_COLLECTION: &str = r"SOFTWARE\Policies\Microsoft\Windows\DataCollection";
const EXPLORER_ADVANCED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced";
const PERSONALIZE: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize";
const CLASSIC_MENU_CLSID: &str = r"Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}";
const CLASSIC_MENU_KEY: &str = r"Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32";
pub const HIGH_PERF_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
pub const BALANCED_GUID: &str = "381b4222-f694-41f0-9685-ff5bb260df2e";

/// Every tweak the app offers. The frontend catalog (src/lib/tweaks-catalog.ts)
/// must list the same ids; a test below checks it.
pub fn specs() -> Vec<TweakSpec> {
    use Hive::*;
    vec![
        // Privacy
        reg("disable_telemetry", false, vec![dword(Hklm, DATA_COLLECTION, "AllowTelemetry", 0, None)]),
        reg("disable_cortana", false, vec![dword(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\Windows Search", "AllowCortana", 0, None)]),
        reg("disable_activity_feed", false, vec![dword(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\System", "EnableActivityFeed", 0, None)]),
        reg("remove_bing_search", true, vec![dword(Hkcu, r"Software\Policies\Microsoft\Windows\Explorer", "DisableSearchBoxSuggestions", 1, None)]),
        reg("disable_location", false, vec![sz(Hklm, r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value", "Deny", Some("Allow"))]),
        reg("disable_advertising_id", false, vec![dword(Hkcu, r"SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo", "Enabled", 0, Some(1))]),
        reg("disable_wifi_sense", false, vec![dword(Hklm, r"SOFTWARE\Microsoft\WcmSvc\wifinetworkmanager\config", "AutoConnectAllowedOEM", 0, None)]),
        reg("disable_feedback", false, vec![dword(Hklm, DATA_COLLECTION, "DoNotShowFeedbackNotifications", 1, None)]),
        // Performance
        TweakSpec { id: "high_performance_plan", kind: Kind::PowerPlan, restart: false },
        TweakSpec { id: "optimize_hpet", kind: Kind::Hpet, restart: true },
        reg("disable_game_bar", false, vec![
            dword(Hkcu, r"SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled", 0, Some(1)),
            dword(Hkcu, r"System\GameConfigStore", "GameDVR_Enabled", 0, Some(1)),
        ]),
        TweakSpec { id: "disable_superfetch", kind: Kind::Service { name: "SysMain", default_start: 2 }, restart: false },
        TweakSpec { id: "disable_search_indexing", kind: Kind::Service { name: "WSearch", default_start: 2 }, restart: false },
        reg("disable_visual_fx", true, vec![dword(Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting", 2, None)]),
        TweakSpec { id: "set_dns_cloudflare", kind: Kind::Dns, restart: false },
        // Interface
        reg("dark_mode", false, vec![
            dword(Hkcu, PERSONALIZE, "AppsUseLightTheme", 0, Some(1)),
            dword(Hkcu, PERSONALIZE, "SystemUsesLightTheme", 0, Some(1)),
        ]),
        TweakSpec {
            id: "classic_context_menu",
            kind: Kind::Registry {
                values: vec![sz(Hkcu, CLASSIC_MENU_KEY, "", "", None)],
                delete_key_on_revert: Some((Hkcu, CLASSIC_MENU_CLSID)),
            },
            restart: true,
        },
        reg("show_file_extensions", false, vec![dword(Hkcu, EXPLORER_ADVANCED, "HideFileExt", 0, Some(1))]),
        reg("show_hidden_files", false, vec![dword(Hkcu, EXPLORER_ADVANCED, "Hidden", 1, Some(2))]),
        reg("disable_mouse_accel", true, vec![
            sz(Hkcu, r"Control Panel\Mouse", "MouseSpeed", "0", Some("1")),
            sz(Hkcu, r"Control Panel\Mouse", "MouseThreshold1", "0", Some("6")),
            sz(Hkcu, r"Control Panel\Mouse", "MouseThreshold2", "0", Some("10")),
        ]),
        // System
        reg("enable_long_paths", false, vec![dword(Hklm, r"SYSTEM\CurrentControlSet\Control\FileSystem", "LongPathsEnabled", 1, Some(0))]),
        TweakSpec { id: "enable_f8_boot", kind: Kind::BootMenu, restart: true },
        reg("disable_fast_startup", false, vec![dword(Hklm, r"SYSTEM\CurrentControlSet\Control\Session Manager\Power", "HiberbootEnabled", 0, Some(1))]),
        reg("disable_windows_update", false, vec![dword(Hklm, r"SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU", "NoAutoUpdate", 1, None)]),
    ]
}

fn spec(id: &str) -> Option<TweakSpec> {
    specs().into_iter().find(|s| s.id == id)
}

// ── State reported to the UI ─────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Active,
    Inactive,
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
pub struct Change {
    pub target: String,
    pub current: String,
    pub wanted: String,
}

/// What a tweak reaches, read from what it actually changes: only the signed-in
/// user (HKCU), the whole PC (HKLM, services, power, network, needs admin) or
/// the Windows boot configuration (bcdedit, needs admin and a restart).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    User,
    Machine,
    Boot,
}

impl TweakSpec {
    pub fn scope(&self) -> Scope {
        match &self.kind {
            Kind::Registry { values, delete_key_on_revert } => {
                let machine = values.iter().any(|v| v.hive == Hive::Hklm)
                    || matches!(delete_key_on_revert, Some((Hive::Hklm, _)));
                if machine { Scope::Machine } else { Scope::User }
            }
            Kind::Service { .. } | Kind::PowerPlan | Kind::Dns => Scope::Machine,
            Kind::Hpet | Kind::BootMenu => Scope::Boot,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct TweakState {
    pub id: String,
    pub status: Status,
    pub scope: Scope,
    /// Why the state could not be read, when status is unknown.
    pub reason: Option<String>,
    pub changes: Vec<Change>,
    pub restart: bool,
}

impl TweakState {
    fn new(spec: &TweakSpec, status: Status, changes: Vec<Change>, reason: Option<String>) -> Self {
        TweakState { id: spec.id.to_string(), status, scope: spec.scope(), reason, changes, restart: spec.restart }
    }
}

// ── Snapshot of original values ──────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SavedValue {
    pub hive: Hive,
    pub path: String,
    pub name: String,
    pub data: Option<RegData>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SavedDns {
    pub guid: String,
    pub index: u32,
    /// Static servers before the change; empty = the adapter used DHCP.
    pub name_server: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TweakSnapshot {
    #[serde(default)]
    pub values: Vec<SavedValue>,
    #[serde(default)]
    pub key_existed: Option<bool>,
    #[serde(default)]
    pub service_start: Option<u32>,
    #[serde(default)]
    pub service_delayed: Option<u32>,
    #[serde(default)]
    pub power_guid: Option<String>,
    #[serde(default)]
    pub applied_power_guid: Option<String>,
    #[serde(default)]
    pub dns: Vec<SavedDns>,
    #[serde(default)]
    pub hpet_forced: Option<bool>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Snapshots {
    #[serde(default)]
    pub tweaks: HashMap<String, TweakSnapshot>,
}

static SNAPSHOT_LOCK: Mutex<()> = Mutex::new(());

fn snapshot_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("No app data folder: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))?;
    Ok(dir.join("tweak-originals.json"))
}

pub fn load_snapshots(path: &Path) -> Snapshots {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Writes through a temp file so a crash never leaves a half-written snapshot.
pub fn save_snapshots(path: &Path, snaps: &Snapshots) -> Result<(), String> {
    let json = serde_json::to_string_pretty(snaps).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Cannot save originals: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Cannot save originals: {e}"))
}

// ── Registry access ──────────────────────────────────────────────────────────

#[cfg(windows)]
pub(crate) mod regio {
    use super::{Hive, RegData};
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
    use winreg::{RegKey, RegValue};

    fn root(h: Hive) -> RegKey {
        RegKey::predef(match h {
            Hive::Hklm => HKEY_LOCAL_MACHINE,
            Hive::Hkcu => HKEY_CURRENT_USER,
        })
    }

    fn is_not_found(e: &std::io::Error) -> bool {
        e.kind() == std::io::ErrorKind::NotFound
    }

    /// Ok(None) when the key or value does not exist.
    pub fn read(h: Hive, path: &str, name: &str) -> std::io::Result<Option<RegData>> {
        let key = match root(h).open_subkey_with_flags(path, KEY_READ) {
            Ok(k) => k,
            Err(e) if is_not_found(&e) => return Ok(None),
            Err(e) => return Err(e),
        };
        match key.get_raw_value(name) {
            Ok(raw) => Ok(decode(&raw)),
            Err(e) if is_not_found(&e) => Ok(None),
            Err(e) => Err(e),
        }
    }

    fn decode(raw: &RegValue) -> Option<RegData> {
        use winreg::enums::RegType::*;
        match raw.vtype {
            REG_DWORD if raw.bytes.len() >= 4 => Some(RegData::Dword(u32::from_le_bytes([raw.bytes[0], raw.bytes[1], raw.bytes[2], raw.bytes[3]]))),
            REG_SZ | REG_EXPAND_SZ => {
                let wide: Vec<u16> = raw.bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
                let s = String::from_utf16_lossy(&wide);
                Some(RegData::Sz(s.trim_end_matches('\0').to_string()))
            }
            _ => None,
        }
    }

    pub fn write(h: Hive, path: &str, name: &str, data: &RegData) -> std::io::Result<()> {
        let (key, _) = root(h).create_subkey_with_flags(path, KEY_READ | KEY_WRITE)?;
        match data {
            RegData::Dword(v) => key.set_value(name, v),
            RegData::Sz(s) => key.set_value(name, s),
        }
    }

    pub fn delete_value(h: Hive, path: &str, name: &str) -> std::io::Result<()> {
        let key = match root(h).open_subkey_with_flags(path, KEY_READ | KEY_WRITE) {
            Ok(k) => k,
            Err(e) if is_not_found(&e) => return Ok(()),
            Err(e) => return Err(e),
        };
        match key.delete_value(name) {
            Err(e) if is_not_found(&e) => Ok(()),
            other => other,
        }
    }

    pub fn key_exists(h: Hive, path: &str) -> bool {
        root(h).open_subkey_with_flags(path, KEY_READ).is_ok()
    }

    pub fn delete_tree(h: Hive, path: &str) -> std::io::Result<()> {
        match root(h).delete_subkey_all(path) {
            Err(e) if is_not_found(&e) => Ok(()),
            other => other,
        }
    }
}

#[cfg(not(windows))]
pub(crate) mod regio {
    use super::{Hive, RegData};
    fn no() -> std::io::Error {
        std::io::Error::new(std::io::ErrorKind::Unsupported, "registry is Windows-only")
    }
    pub fn read(_: Hive, _: &str, _: &str) -> std::io::Result<Option<RegData>> { Err(no()) }
    pub fn write(_: Hive, _: &str, _: &str, _: &RegData) -> std::io::Result<()> { Err(no()) }
    pub fn delete_value(_: Hive, _: &str, _: &str) -> std::io::Result<()> { Err(no()) }
    pub fn key_exists(_: Hive, _: &str) -> bool { false }
    pub fn delete_tree(_: Hive, _: &str) -> std::io::Result<()> { Err(no()) }
}

fn io_message(e: &std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::PermissionDenied {
        "Access denied: open Segatt Tools as administrator.".to_string()
    } else {
        e.to_string()
    }
}

fn target(hive: Hive, path: &str, name: &str) -> String {
    let n = if name.is_empty() { "(Default)" } else { name };
    format!("{}\\{}\\{}", hive.label(), path, n)
}

fn show(data: &Option<RegData>) -> String {
    data.as_ref().map(RegData::display).unwrap_or_else(|| "—".to_string())
}

// ── Output parsing (pure, tested) ────────────────────────────────────────────

/// GUID and name from `powercfg /getactivescheme` (localized text around them).
pub fn parse_active_scheme(output: &str) -> Option<(String, String)> {
    let guid = first_guid(output)?;
    let name = output
        .rfind('(')
        .and_then(|open| output[open + 1..].find(')').map(|close| output[open + 1..open + 1 + close].trim().to_string()))
        .unwrap_or_default();
    Some((guid.to_lowercase(), name))
}

/// First GUID in any text (used for `powercfg -duplicatescheme`).
pub fn first_guid(text: &str) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_hexdigit() || c == '-'))
        .find(|w| w.len() == 36 && w.matches('-').count() == 4)
        .map(str::to_lowercase)
}

/// Value of a BCD element in `bcdedit /enum` output, or None when it is not set.
pub fn bcd_element<'a>(output: &'a str, element: &str) -> Option<&'a str> {
    output.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        (parts.next()? .eq_ignore_ascii_case(element)).then(|| parts.next().unwrap_or(""))
    })
}

/// bcdedit prints booleans in the display language.
pub fn bcd_is_yes(value: &str) -> bool {
    let v = value.to_lowercase();
    ["yes", "sim", "sí", "si", "oui", "ja", "да", "是", "はい", "예", "evet"].iter().any(|y| v == *y)
}

// ── Detection ────────────────────────────────────────────────────────────────

fn detect(spec: &TweakSpec, snap: Option<&TweakSnapshot>) -> TweakState {
    match &spec.kind {
        Kind::Registry { values, .. } => {
            let mut changes = Vec::new();
            let mut all = true;
            for v in values {
                match regio::read(v.hive, v.path, v.name) {
                    Ok(current) => {
                        if current.as_ref() != Some(&v.want) {
                            all = false;
                        }
                        changes.push(Change { target: target(v.hive, v.path, v.name), current: show(&current), wanted: v.want.display() });
                    }
                    Err(e) => return TweakState::new(spec, Status::Unknown, changes, Some(io_message(&e))),
                }
            }
            TweakState::new(spec, if all { Status::Active } else { Status::Inactive }, changes, None)
        }
        Kind::Service { name, .. } => {
            let path = format!(r"SYSTEM\CurrentControlSet\Services\{name}");
            match regio::read(Hive::Hklm, &path, "Start") {
                Ok(Some(RegData::Dword(start))) => {
                    let change = Change { target: format!("sc config {name} start= disabled"), current: start_label(start).into(), wanted: "disabled".into() };
                    TweakState::new(spec, if start == 4 { Status::Active } else { Status::Inactive }, vec![change], None)
                }
                Ok(_) => TweakState::new(spec, Status::Unknown, vec![], Some(format!("Service {name} is not installed."))),
                Err(e) => TweakState::new(spec, Status::Unknown, vec![], Some(io_message(&e))),
            }
        }
        Kind::PowerPlan => match run_hidden("powercfg", &["/getactivescheme"]).ok().as_deref().and_then(parse_active_scheme) {
            Some((guid, name)) => {
                let applied = snap.and_then(|s| s.applied_power_guid.as_deref());
                let active = guid == HIGH_PERF_GUID || applied == Some(guid.as_str());
                let change = Change { target: format!("powercfg /setactive {HIGH_PERF_GUID}"), current: if name.is_empty() { guid } else { name }, wanted: "High performance".into() };
                TweakState::new(spec, if active { Status::Active } else { Status::Inactive }, vec![change], None)
            }
            None => TweakState::new(spec, Status::Unknown, vec![], Some("Could not read the active power plan.".into())),
        },
        Kind::Dns => match dns_adapters() {
            Ok(adapters) if adapters.is_empty() => TweakState::new(spec, Status::Unknown, vec![], Some("No active network adapter.".into())),
            Ok(adapters) => {
                let changes: Vec<Change> = adapters
                    .iter()
                    .map(|a| Change {
                        target: format!("Set-DnsClientServerAddress -InterfaceAlias '{}' 1.1.1.1,1.0.0.1", a.name),
                        current: if a.name_server.is_empty() { "automatic (DHCP)".into() } else { a.name_server.clone() },
                        wanted: "1.1.1.1, 1.0.0.1".into(),
                    })
                    .collect();
                let active = adapters.iter().all(|a| a.name_server.starts_with("1.1.1.1"));
                TweakState::new(spec, if active { Status::Active } else { Status::Inactive }, changes, None)
            }
            Err(e) => TweakState::new(spec, Status::Unknown, vec![], Some(e)),
        },
        Kind::Hpet => match run_hidden("bcdedit", &["/enum", "{current}"]) {
            Ok(out) => {
                let forced = bcd_element(&out, "useplatformclock").map(bcd_is_yes).unwrap_or(false);
                let change = Change { target: "bcdedit /deletevalue useplatformclock".into(), current: if forced { "Yes" } else { "—" }.into(), wanted: "—".into() };
                TweakState::new(spec, if forced { Status::Inactive } else { Status::Active }, vec![change], None)
            }
            Err(_) => TweakState::new(spec, Status::Unknown, vec![], Some("Reading boot settings needs administrator.".into())),
        },
        Kind::BootMenu => match run_hidden("bcdedit", &["/enum", "{bootmgr}"]) {
            Ok(out) => {
                let on = bcd_element(&out, "displaybootmenu").map(bcd_is_yes).unwrap_or(false);
                let change = Change { target: "bcdedit /set {bootmgr} displaybootmenu yes".into(), current: if on { "Yes" } else { "No" }.into(), wanted: "Yes".into() };
                TweakState::new(spec, if on { Status::Active } else { Status::Inactive }, vec![change], None)
            }
            Err(_) => TweakState::new(spec, Status::Unknown, vec![], Some("Reading boot settings needs administrator.".into())),
        },
    }
}

fn start_label(start: u32) -> &'static str {
    match start {
        0 => "boot",
        1 => "system",
        2 => "automatic",
        3 => "manual",
        4 => "disabled",
        _ => "unknown",
    }
}

#[derive(Debug, Deserialize)]
struct AdapterInfo {
    name: String,
    index: u32,
    guid: String,
}

#[derive(Debug)]
struct Adapter {
    name: String,
    index: u32,
    guid: String,
    name_server: String,
}

/// Active physical adapters and their static IPv4 DNS (empty = DHCP), read from
/// the TCP/IP interface keys so DHCP-provided servers are not mistaken for static.
fn dns_adapters() -> Result<Vec<Adapter>, String> {
    let json = run_hidden_powershell(
        "$a = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { [pscustomobject]@{ name = $_.Name; index = [int]$_.ifIndex; guid = [string]$_.InterfaceGuid } })
ConvertTo-Json -InputObject $a -Compress",
    )?;
    let infos: Vec<AdapterInfo> = serde_json::from_str(if json.is_empty() { "[]" } else { &json }).map_err(|e| format!("Unexpected adapter list: {e}"))?;
    Ok(infos
        .into_iter()
        .map(|i| {
            let path = format!(r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{}", i.guid);
            let name_server = match regio::read(Hive::Hklm, &path, "NameServer") {
                Ok(Some(RegData::Sz(s))) => s.replace(',', ", "),
                _ => String::new(),
            };
            Adapter { name: i.name, index: i.index, guid: i.guid, name_server }
        })
        .collect())
}

// ── Apply / revert ───────────────────────────────────────────────────────────

fn capture(spec: &TweakSpec) -> Result<TweakSnapshot, String> {
    let mut snap = TweakSnapshot::default();
    match &spec.kind {
        Kind::Registry { values, delete_key_on_revert } => {
            for v in values {
                let data = regio::read(v.hive, v.path, v.name).map_err(|e| io_message(&e))?;
                snap.values.push(SavedValue { hive: v.hive, path: v.path.into(), name: v.name.into(), data });
            }
            if let Some((h, p)) = delete_key_on_revert {
                snap.key_existed = Some(regio::key_exists(*h, p));
            }
        }
        Kind::Service { name, .. } => {
            let path = format!(r"SYSTEM\CurrentControlSet\Services\{name}");
            if let Ok(Some(RegData::Dword(s))) = regio::read(Hive::Hklm, &path, "Start") {
                snap.service_start = Some(s);
            }
            if let Ok(Some(RegData::Dword(d))) = regio::read(Hive::Hklm, &path, "DelayedAutostart") {
                snap.service_delayed = Some(d);
            }
        }
        Kind::PowerPlan => {
            snap.power_guid = run_hidden("powercfg", &["/getactivescheme"]).ok().as_deref().and_then(parse_active_scheme).map(|(g, _)| g);
        }
        Kind::Dns => {
            snap.dns = dns_adapters()?.into_iter().map(|a| SavedDns { guid: a.guid, index: a.index, name_server: a.name_server }).collect();
        }
        Kind::Hpet => {
            let out = run_hidden("bcdedit", &["/enum", "{current}"])?;
            snap.hpet_forced = Some(bcd_element(&out, "useplatformclock").map(bcd_is_yes).unwrap_or(false));
        }
        Kind::BootMenu => {}
    }
    Ok(snap)
}

fn apply(spec: &TweakSpec, snap: &mut TweakSnapshot) -> Result<(), String> {
    match &spec.kind {
        Kind::Registry { values, .. } => {
            for v in values {
                regio::write(v.hive, v.path, v.name, &v.want).map_err(|e| io_message(&e))?;
            }
            Ok(())
        }
        Kind::Service { name, .. } => {
            run_hidden("sc.exe", &["config", name, "start=", "disabled"])?;
            // Stopping may fail if it is already stopped; the startup type is what persists.
            let _ = run_hidden("sc.exe", &["stop", name]);
            Ok(())
        }
        Kind::PowerPlan => {
            if run_hidden("powercfg", &["/setactive", HIGH_PERF_GUID]).is_ok() {
                snap.applied_power_guid = Some(HIGH_PERF_GUID.into());
                return Ok(());
            }
            // Hidden on Modern Standby laptops: activate a copy instead.
            let out = run_hidden("powercfg", &["-duplicatescheme", HIGH_PERF_GUID])?;
            let guid = first_guid(&out).ok_or("The High Performance power plan is not available on this PC.")?;
            run_hidden("powercfg", &["/setactive", &guid])?;
            snap.applied_power_guid = Some(guid);
            Ok(())
        }
        Kind::Dns => {
            let indexes: Vec<String> = snap.dns.iter().map(|d| d.index.to_string()).collect();
            if indexes.is_empty() {
                return Err("No active network adapter.".into());
            }
            run_hidden_powershell(&format!(
                "foreach ($i in @({})) {{ Set-DnsClientServerAddress -InterfaceIndex $i -ServerAddresses ('1.1.1.1','1.0.0.1') }}",
                indexes.join(",")
            ))
            .map(|_| ())
        }
        Kind::Hpet => {
            if snap.hpet_forced == Some(true) {
                run_hidden("bcdedit", &["/deletevalue", "useplatformclock"])?;
            }
            Ok(())
        }
        Kind::BootMenu => run_hidden("bcdedit", &["/set", "{bootmgr}", "displaybootmenu", "yes"]).map(|_| ()),
    }
}

fn revert(spec: &TweakSpec, snap: Option<&TweakSnapshot>) -> Result<(), String> {
    match &spec.kind {
        Kind::Registry { values, delete_key_on_revert } => {
            for v in values {
                let saved = snap.and_then(|s| s.values.iter().find(|x| x.hive == v.hive && x.path == v.path && x.name == v.name));
                let original = match saved {
                    Some(s) => s.data.clone(),
                    None => v.default.clone(),
                };
                match original {
                    Some(data) => regio::write(v.hive, v.path, v.name, &data),
                    None => regio::delete_value(v.hive, v.path, v.name),
                }
                .map_err(|e| io_message(&e))?;
            }
            if let Some((h, p)) = delete_key_on_revert {
                if snap.and_then(|s| s.key_existed) != Some(true) {
                    regio::delete_tree(*h, p).map_err(|e| io_message(&e))?;
                }
            }
            Ok(())
        }
        Kind::Service { name, default_start } => {
            let start = snap.and_then(|s| s.service_start).unwrap_or(*default_start);
            let delayed = snap.and_then(|s| s.service_delayed).unwrap_or(0) == 1;
            let mode = match start {
                2 if delayed => "delayed-auto",
                2 => "auto",
                3 => "demand",
                4 => "disabled",
                _ => "demand",
            };
            run_hidden("sc.exe", &["config", name, "start=", mode])?;
            if start == 2 {
                let _ = run_hidden("sc.exe", &["start", name]);
            }
            Ok(())
        }
        Kind::PowerPlan => {
            let guid = snap.and_then(|s| s.power_guid.clone()).filter(|g| g != HIGH_PERF_GUID).unwrap_or_else(|| BALANCED_GUID.into());
            run_hidden("powercfg", &["/setactive", &guid]).map(|_| ())
        }
        Kind::Dns => {
            let saved = snap.map(|s| s.dns.clone()).unwrap_or_default();
            let targets: Vec<SavedDns> = if saved.is_empty() {
                dns_adapters()?.into_iter().map(|a| SavedDns { guid: a.guid, index: a.index, name_server: String::new() }).collect()
            } else {
                saved
            };
            let mut script = String::new();
            for d in targets {
                if d.name_server.is_empty() {
                    script.push_str(&format!("Set-DnsClientServerAddress -InterfaceIndex {} -ResetServerAddresses\n", d.index));
                } else {
                    let list: Vec<String> = split_servers(&d.name_server).into_iter().map(ps_quote).collect();
                    script.push_str(&format!("Set-DnsClientServerAddress -InterfaceIndex {} -ServerAddresses ({})\n", d.index, list.join(",")));
                }
            }
            run_hidden_powershell(&script).map(|_| ())
        }
        Kind::Hpet => {
            if snap.and_then(|s| s.hpet_forced) == Some(true) {
                run_hidden("bcdedit", &["/set", "useplatformclock", "yes"])?;
            }
            Ok(())
        }
        Kind::BootMenu => run_hidden("bcdedit", &["/set", "{bootmgr}", "displaybootmenu", "no"]).map(|_| ()),
    }
}

/// Windows stores static DNS servers comma- or space-separated.
pub fn split_servers(list: &str) -> Vec<&str> {
    list.split(|c: char| c == ',' || c.is_whitespace()).filter(|s| !s.is_empty()).collect()
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Reads every tweak's real state. Slow probes (power, DNS, boot) run in parallel.
#[tauri::command(async)]
pub fn get_tweak_states(app: AppHandle) -> Vec<TweakState> {
    let snaps = snapshot_path(&app).map(|p| load_snapshots(&p)).unwrap_or_default();
    let all = specs();
    std::thread::scope(|scope| {
        let handles: Vec<_> = all
            .iter()
            .map(|spec| {
                let snap = snaps.tweaks.get(spec.id);
                scope.spawn(move || detect(spec, snap))
            })
            .collect();
        handles
            .into_iter()
            .zip(all.iter())
            .map(|(h, spec)| h.join().unwrap_or_else(|_| TweakState::new(spec, Status::Unknown, vec![], Some("Detection crashed.".into()))))
            .collect()
    })
}

/// Turns a tweak on (apply) or off (revert to the original), then reads the
/// state back and fails if the system did not end up where it was asked to.
#[tauri::command(async)]
pub fn set_tweak(app: AppHandle, id: String, enabled: bool) -> Result<TweakState, String> {
    let spec = spec(&id).ok_or_else(|| format!("Unknown tweak: '{id}'"))?;
    let path = snapshot_path(&app)?;
    let _guard = SNAPSHOT_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let mut snaps = load_snapshots(&path);

    if enabled {
        // Already on (set before the app or by hand): nothing to change, and capturing
        // now would save the tweaked value as the "original" and break a later undo.
        let current = detect(&spec, snaps.tweaks.get(&id));
        if current.status == Status::Active {
            return Ok(current);
        }
        // Keep the very first original: re-applying must not overwrite it with our own value.
        let mut snap = match snaps.tweaks.get(&id) {
            Some(s) => s.clone(),
            None => capture(&spec)?,
        };
        snaps.tweaks.insert(id.clone(), snap.clone());
        save_snapshots(&path, &snaps)?;
        // A failure halfway (one value written, the next denied) or a change Windows
        // did not keep is rolled back, so the PC never stays half-tweaked with no
        // way to undo it from the screen.
        let outcome = apply(&spec, &mut snap).and_then(|_| {
            let state = detect(&spec, Some(&snap));
            match state.status {
                Status::Active | Status::Unknown => Ok(state),
                Status::Inactive => Err("Windows did not keep the change.".to_string()),
            }
        });
        match outcome {
            Ok(state) => {
                snaps.tweaks.insert(id.clone(), snap);
                save_snapshots(&path, &snaps)?;
                Ok(state)
            }
            Err(e) => {
                let rolled_back = revert(&spec, Some(&snap)).is_ok();
                if rolled_back {
                    snaps.tweaks.remove(&id);
                    save_snapshots(&path, &snaps)?;
                }
                Err(if rolled_back { format!("{e} Nothing was left changed.") } else { format!("{e} Some values may be left changed; turn the tweak off to undo.") })
            }
        }
    } else {
        revert(&spec, snaps.tweaks.get(&id))?;
        snaps.tweaks.remove(&id);
        save_snapshots(&path, &snaps)?;
        let state = detect(&spec, None);
        match state.status {
            Status::Inactive | Status::Unknown => Ok(state),
            Status::Active => Err("The original value could not be restored.".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_comes_from_what_the_tweak_changes() {
        let scope = |id: &str| spec(id).unwrap().scope();
        assert_eq!(scope("dark_mode"), Scope::User);
        assert_eq!(scope("classic_context_menu"), Scope::User);
        assert_eq!(scope("disable_telemetry"), Scope::Machine);
        assert_eq!(scope("disable_superfetch"), Scope::Machine);
        assert_eq!(scope("set_dns_cloudflare"), Scope::Machine);
        assert_eq!(scope("optimize_hpet"), Scope::Boot);
        assert_eq!(scope("enable_f8_boot"), Scope::Boot);
    }

    /// Must match src/lib/tweaks-catalog.ts.
    const FRONTEND_IDS: &[&str] = &[
        "disable_telemetry", "disable_cortana", "disable_activity_feed", "remove_bing_search",
        "disable_location", "disable_advertising_id", "disable_wifi_sense", "disable_feedback",
        "high_performance_plan", "optimize_hpet", "disable_game_bar", "disable_superfetch",
        "disable_search_indexing", "disable_visual_fx", "set_dns_cloudflare", "dark_mode",
        "classic_context_menu", "show_file_extensions", "show_hidden_files", "disable_mouse_accel",
        "enable_long_paths", "enable_f8_boot", "disable_fast_startup", "disable_windows_update",
    ];

    #[test]
    fn specs_match_the_frontend_catalog() {
        let mut ids: Vec<&str> = specs().iter().map(|s| s.id).collect();
        let mut want = FRONTEND_IDS.to_vec();
        ids.sort();
        want.sort();
        assert_eq!(ids, want);
    }

    #[test]
    fn registry_specs_are_well_formed() {
        for s in specs() {
            if let Kind::Registry { values, .. } = s.kind {
                assert!(!values.is_empty(), "{} has no values", s.id);
                for v in values {
                    assert!(!v.path.starts_with("HK") && !v.path.starts_with('\\'), "{}: path must be relative to the hive", s.id);
                    assert_ne!(Some(&v.want), v.default.as_ref(), "{}: wanted value equals the Windows default", s.id);
                }
            }
        }
    }

    #[test]
    fn parses_localized_power_scheme_output() {
        let pt = "GUID do Esquema de Energia: 381b4222-f694-41f0-9685-ff5bb260df2e  (Equilibrado)";
        assert_eq!(parse_active_scheme(pt), Some((BALANCED_GUID.into(), "Equilibrado".into())));
        let en = "Power Scheme GUID: 8C5E7FDA-E8BF-4A96-9A85-A6E23A8C635C  (High performance)";
        assert_eq!(parse_active_scheme(en).unwrap().0, HIGH_PERF_GUID);
        assert_eq!(parse_active_scheme("nothing here"), None);
        assert_eq!(first_guid("Power Scheme GUID: 11111111-2222-3333-4444-555555555555  (Copy)").as_deref(), Some("11111111-2222-3333-4444-555555555555"));
    }

    #[test]
    fn splits_dns_server_lists_both_ways() {
        assert_eq!(split_servers("8.8.8.8,8.8.4.4"), vec!["8.8.8.8", "8.8.4.4"]);
        assert_eq!(split_servers("8.8.8.8 8.8.4.4"), vec!["8.8.8.8", "8.8.4.4"]);
        assert_eq!(split_servers("8.8.8.8, 8.8.4.4"), vec!["8.8.8.8", "8.8.4.4"]);
        assert!(split_servers("").is_empty());
    }

    #[test]
    fn reads_bcd_booleans_in_any_language() {
        let out = "Windows Boot Manager\n--------------------\nidentifier              {bootmgr}\ndisplaybootmenu         Sim\ntimeout                 30\n";
        assert_eq!(bcd_element(out, "displaybootmenu"), Some("Sim"));
        assert!(bcd_is_yes("Sim") && bcd_is_yes("Yes") && bcd_is_yes("Ja"));
        assert!(!bcd_is_yes("No") && !bcd_is_yes("Não"));
        assert_eq!(bcd_element(out, "useplatformclock"), None);
    }

    #[test]
    fn snapshot_round_trips_and_tolerates_old_files() {
        let dir = std::env::temp_dir().join(format!("segatt-snap-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tweak-originals.json");
        let mut snaps = Snapshots::default();
        snaps.tweaks.insert(
            "dark_mode".into(),
            TweakSnapshot { values: vec![SavedValue { hive: Hive::Hkcu, path: PERSONALIZE.into(), name: "AppsUseLightTheme".into(), data: Some(RegData::Dword(1)) }], ..Default::default() },
        );
        save_snapshots(&path, &snaps).unwrap();
        assert_eq!(load_snapshots(&path).tweaks["dark_mode"], snaps.tweaks["dark_mode"]);
        // A corrupt or missing file never blocks: it reads as empty.
        std::fs::write(&path, "{not json").unwrap();
        assert!(load_snapshots(&path).tweaks.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Full cycle on a throwaway key (never a real setting): capture the original,
    /// apply, verify, revert to the original, verify, and remove the key.
    #[cfg(windows)]
    #[test]
    fn apply_then_revert_restores_the_original_value() {
        const KEY: &str = r"Software\SegattTools-Test\Engine";
        struct Cleanup;
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = regio::delete_tree(Hive::Hkcu, r"Software\SegattTools-Test");
            }
        }
        let _cleanup = Cleanup;
        regio::delete_tree(Hive::Hkcu, r"Software\SegattTools-Test").unwrap();
        regio::write(Hive::Hkcu, KEY, "Existing", &RegData::Dword(7)).unwrap();
        let spec = TweakSpec {
            id: "test_tweak",
            kind: Kind::Registry {
                values: vec![dword(Hive::Hkcu, KEY, "Existing", 0, Some(1)), dword(Hive::Hkcu, KEY, "Absent", 1, None)],
                delete_key_on_revert: None,
            },
            restart: false,
        };

        assert_eq!(detect(&spec, None).status, Status::Inactive);
        let mut snap = capture(&spec).unwrap();
        apply(&spec, &mut snap).unwrap();
        assert_eq!(detect(&spec, Some(&snap)).status, Status::Active);

        revert(&spec, Some(&snap)).unwrap();
        // The original 7 comes back (not the Windows default 1), and the value that
        // did not exist before is removed again.
        assert_eq!(regio::read(Hive::Hkcu, KEY, "Existing").unwrap(), Some(RegData::Dword(7)));
        assert_eq!(regio::read(Hive::Hkcu, KEY, "Absent").unwrap(), None);
        assert_eq!(detect(&spec, None).status, Status::Inactive);

        regio::delete_tree(Hive::Hkcu, r"Software\SegattTools-Test").unwrap();
        assert!(!regio::key_exists(Hive::Hkcu, KEY));
    }

    /// Manual check of every probe on a real PC (read-only):
    /// cargo test print_all_states -- --ignored --nocapture
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn print_all_states() {
        for spec in specs() {
            let st = detect(&spec, None);
            println!("{:<24} {:?} {:?} {:?}", st.id, st.status, st.reason, st.changes.iter().map(|c| format!("{} = {}", c.target, c.current)).collect::<Vec<_>>());
        }
    }

    /// Real states as JSON, for UI verification outside the Tauri window (read-only):
    /// cargo test dump_states_json -- --ignored --nocapture
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn dump_states_json() {
        let all: Vec<TweakState> = specs().iter().map(|s| detect(s, None)).collect();
        println!("STATES_JSON={}", serde_json::to_string(&all).unwrap());
    }

    /// Read-only: detection of current-user tweaks works without admin rights.
    #[cfg(windows)]
    #[test]
    fn detects_current_user_tweaks_without_admin() {
        for id in ["show_file_extensions", "dark_mode", "disable_mouse_accel"] {
            let state = detect(&spec(id).unwrap(), None);
            assert_ne!(state.status, Status::Unknown, "{id}: {:?}", state.reason);
            assert!(!state.changes.is_empty());
        }
    }
}
