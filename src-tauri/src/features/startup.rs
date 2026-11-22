//! Startup apps: what opens with Windows (Run keys and Startup folders) and
//! the on/off switch Windows itself keeps for each one in StartupApproved,
//! the same place Task Manager writes. Turning an item off never deletes it.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::features::hardware::one_or_many;
use crate::features::utils::{ps_quote, run_hidden_powershell};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN32: &str = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    /// This account only.
    User,
    /// Every account on the PC (needs administrator to change).
    Machine,
}

/// Where an item comes from, and where Windows keeps its on/off switch.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Source {
    UserRun,
    MachineRun,
    MachineRun32,
    UserFolder,
    CommonFolder,
}

impl Source {
    const ALL: [Source; 5] = [Source::UserRun, Source::MachineRun, Source::MachineRun32, Source::UserFolder, Source::CommonFolder];

    pub fn key(self) -> &'static str {
        match self {
            Source::UserRun => "user_run",
            Source::MachineRun => "machine_run",
            Source::MachineRun32 => "machine_run32",
            Source::UserFolder => "user_folder",
            Source::CommonFolder => "common_folder",
        }
    }

    fn from_key(key: &str) -> Option<Source> {
        Source::ALL.into_iter().find(|s| s.key() == key)
    }

    pub fn scope(self) -> Scope {
        match self {
            Source::UserRun | Source::UserFolder => Scope::User,
            _ => Scope::Machine,
        }
    }

    /// The StartupApproved subkey that holds this source's switches.
    fn approved(self) -> &'static str {
        match self {
            Source::UserRun | Source::MachineRun => "Run",
            Source::MachineRun32 => "Run32",
            Source::UserFolder | Source::CommonFolder => "StartupFolder",
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    /// "<source>|<name>": stable across reads, and how the UI asks for a change.
    pub id: String,
    pub name: String,
    /// The command line, or the file in the Startup folder.
    pub command: String,
    pub scope: Scope,
    pub enabled: bool,
    /// Company from the program's file details, when it has one.
    pub publisher: Option<String>,
    /// The program file, for the publisher lookup.
    #[serde(skip)]
    pub program: Option<String>,
}

/// StartupApproved data: an even first byte (02, 06) means on, odd (03, 07)
/// means off. No value at all means on.
pub fn approved_enabled(data: Option<&[u8]>) -> bool {
    data.and_then(|d| d.first()).map_or(true, |b| b & 1 == 0)
}

/// What Windows writes to turn an item on or off: the flag, three zero bytes
/// and, when off, the moment it was turned off (FILETIME).
pub fn approved_bytes(enabled: bool, filetime: u64) -> Vec<u8> {
    let mut bytes = vec![if enabled { 2 } else { 3 }, 0, 0, 0];
    bytes.extend_from_slice(&if enabled { 0u64 } else { filetime }.to_le_bytes());
    bytes
}

/// The program a Run command starts: "C:\a b\app.exe" --x, C:\app.exe -y, or app.exe.
pub fn program_of(command: &str) -> Option<String> {
    let c = command.trim();
    if let Some(rest) = c.strip_prefix('"') {
        return rest.split('"').next().filter(|p| !p.is_empty()).map(str::to_string);
    }
    let lower = c.to_lowercase();
    lower.find(".exe").map(|i| c[..i + 4].to_string()).or_else(|| c.split_whitespace().next().map(str::to_string))
}

/// The name people recognize: the program's description, unless it is a
/// generic word ("Update" for Squirrel apps); else the value name, or the file
/// name when the value name is a path.
pub fn display_name(value_name: &str, description: Option<&str>) -> String {
    const GENERIC: [&str; 5] = ["update", "updater", "launcher", "setup", "installer"];
    if let Some(d) = description {
        let d = d.split(" - http").next().unwrap_or(d).trim();
        if !d.is_empty() && !GENERIC.contains(&d.to_lowercase().as_str()) {
            return d.to_string();
        }
    }
    if value_name.contains('\\') {
        if let Some(stem) = Path::new(value_name).file_stem() {
            return stem.to_string_lossy().into_owned();
        }
    }
    value_name.to_string()
}

fn now_filetime() -> u64 {
    let unix = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    (unix + 11_644_473_600) * 10_000_000
}

fn folder(source: Source) -> Option<PathBuf> {
    let (var, rest) = match source {
        Source::UserFolder => ("APPDATA", r"Microsoft\Windows\Start Menu\Programs\Startup"),
        Source::CommonFolder => ("ProgramData", r"Microsoft\Windows\Start Menu\Programs\StartUp"),
        _ => return None,
    };
    std::env::var(var).ok().map(|v| Path::new(&v).join(rest))
}

#[cfg(windows)]
mod reg {
    use super::*;
    use winreg::enums::{RegType, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
    use winreg::{RegKey, RegValue};

    fn hive(source: Source) -> RegKey {
        RegKey::predef(if source.scope() == Scope::User { HKEY_CURRENT_USER } else { HKEY_LOCAL_MACHINE })
    }

    fn run_path(source: Source) -> Option<&'static str> {
        match source {
            Source::UserRun | Source::MachineRun => Some(RUN),
            Source::MachineRun32 => Some(RUN32),
            _ => None,
        }
    }

    /// (name, command) of every value under a Run key.
    pub fn run_values(source: Source) -> Vec<(String, String)> {
        let Some(path) = run_path(source) else { return Vec::new() };
        let Ok(key) = hive(source).open_subkey_with_flags(path, KEY_READ) else { return Vec::new() };
        key.enum_values()
            .flatten()
            .filter(|(name, _)| !name.is_empty())
            .filter_map(|(name, raw)| match raw.vtype {
                RegType::REG_SZ | RegType::REG_EXPAND_SZ => Some((name, raw.to_string())),
                _ => None,
            })
            .collect()
    }

    pub fn approved(source: Source, name: &str) -> Option<Vec<u8>> {
        let key = hive(source).open_subkey_with_flags(format!(r"{APPROVED}\{}", source.approved()), KEY_READ).ok()?;
        key.get_raw_value(name).ok().map(|v| v.bytes)
    }

    pub fn set_approved(source: Source, name: &str, bytes: Vec<u8>) -> std::io::Result<()> {
        let (key, _) = hive(source).create_subkey_with_flags(format!(r"{APPROVED}\{}", source.approved()), KEY_WRITE)?;
        key.set_raw_value(name, &RegValue { bytes, vtype: RegType::REG_BINARY })
    }
}

#[cfg(not(windows))]
mod reg {
    use super::*;
    pub fn run_values(_: Source) -> Vec<(String, String)> { Vec::new() }
    pub fn approved(_: Source, _: &str) -> Option<Vec<u8>> { None }
    pub fn set_approved(_: Source, _: &str, _: Vec<u8>) -> std::io::Result<()> {
        Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "registry is Windows-only"))
    }
}

/// Every startup item of every source, without publishers yet.
fn read_items() -> Vec<StartupItem> {
    let mut items = Vec::new();
    for source in Source::ALL {
        let entries: Vec<(String, String, Option<String>)> = match folder(source) {
            Some(dir) => std::fs::read_dir(&dir)
                .map(|it| {
                    it.flatten()
                        .filter(|e| e.path().is_file() && !e.file_name().to_string_lossy().eq_ignore_ascii_case("desktop.ini"))
                        .map(|e| {
                            let file = e.file_name().to_string_lossy().into_owned();
                            let path = e.path().to_string_lossy().into_owned();
                            (file, path.clone(), Some(path))
                        })
                        .collect()
                })
                .unwrap_or_default(),
            None => reg::run_values(source).into_iter().map(|(name, cmd)| {
                let program = program_of(&cmd);
                (name, cmd, program)
            }).collect(),
        };
        for (name, command, program) in entries {
            let enabled = approved_enabled(reg::approved(source, &name).as_deref());
            let shown = Path::new(&name).file_stem().filter(|_| folder(source).is_some()).map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| name.clone());
            items.push(StartupItem { id: format!("{}|{name}", source.key()), name: shown, command, scope: source.scope(), enabled, publisher: None, program });
        }
    }
    items
}

#[derive(Deserialize)]
struct Details {
    path: String,
    company: Option<String>,
    description: Option<String>,
}

/// Company names of the programs (shortcuts resolved to their target), in one PowerShell call.
fn publishers(paths: &[String]) -> Vec<Details> {
    if paths.is_empty() {
        return Vec::new();
    }
    let list = paths.iter().map(|p| ps_quote(p)).collect::<Vec<_>>().join(",");
    let script = format!(
        "$shell = New-Object -ComObject WScript.Shell
$out = foreach ($p in @({list})) {{
    $file = [Environment]::ExpandEnvironmentVariables($p)
    if ($file -like '*.lnk') {{ try {{ $file = $shell.CreateShortcut($file).TargetPath }} catch {{}} }}
    $company = $null; $description = $null
    if ($file -and (Test-Path -LiteralPath $file -PathType Leaf)) {{
        $info = (Get-Item -LiteralPath $file).VersionInfo
        $company = $info.CompanyName; $description = $info.FileDescription
    }}
    [pscustomobject]@{{ path = $p; company = $company; description = $description }}
}}
@($out) | ConvertTo-Json -Compress"
    );
    #[derive(Deserialize)]
    struct Wrapper(#[serde(deserialize_with = "one_or_many")] Vec<Details>);
    run_hidden_powershell(&script).ok().and_then(|out| serde_json::from_str::<Wrapper>(&out).ok()).map(|w| w.0).unwrap_or_default()
}

fn list() -> Vec<StartupItem> {
    let mut items = read_items();
    let mut paths: Vec<String> = items.iter().filter_map(|i| i.program.clone()).collect();
    paths.sort();
    paths.dedup();
    let details = publishers(&paths);
    let clean = |s: &Option<String>| s.as_ref().map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
    for item in &mut items {
        let found = item.program.as_ref().and_then(|p| details.iter().find(|d| &d.path == p));
        item.publisher = found.and_then(|d| clean(&d.company));
        // Run value names are often ids ("com.todesktop.2502…", "GoogleChromeAutoLaunch_D9F5…");
        // the program's own description is what people recognize.
        item.name = display_name(&item.name, found.and_then(|d| clean(&d.description)).as_deref());
    }
    items.sort_by_key(|i| i.name.to_lowercase());
    items
}

#[tauri::command]
pub async fn list_startup() -> Result<Vec<StartupItem>, String> {
    tauri::async_runtime::spawn_blocking(list).await.map_err(|e| format!("Runtime error: {e}"))
}

/// Turns one item on or off, then reads the list again. Only items that exist
/// can be changed; machine-wide ones need administrator.
#[tauri::command]
pub async fn set_startup(id: String, enabled: bool) -> Result<Vec<StartupItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (key, name) = id.split_once('|').ok_or_else(|| format!("Bad startup id: '{id}'"))?;
        let source = Source::from_key(key).ok_or_else(|| format!("Bad startup source: '{key}'"))?;
        let exists = read_items().iter().any(|i| i.id == id);
        if !exists {
            return Err(format!("Startup item not found: '{name}'"));
        }
        reg::set_approved(source, name, approved_bytes(enabled, now_filetime())).map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                "Access denied: open Segatt Tools as administrator.".to_string()
            } else {
                e.to_string()
            }
        })?;
        let items = list();
        match items.iter().find(|i| i.id == id) {
            Some(i) if i.enabled == enabled => Ok(items),
            _ => Err("Windows did not keep the change.".into()),
        }
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_switch_like_task_manager() {
        assert!(approved_enabled(None), "no value means on");
        assert!(approved_enabled(Some(&[2, 0, 0, 0])));
        assert!(approved_enabled(Some(&[6, 0, 0, 0])));
        assert!(!approved_enabled(Some(&[3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8])));
        assert!(!approved_enabled(Some(&[7])));
        assert!(approved_enabled(Some(&[])), "empty data counts as on");
    }

    #[test]
    fn writes_the_switch_like_task_manager() {
        assert_eq!(approved_bytes(true, 123), vec![2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let off = approved_bytes(false, 0x0102_0304_0506_0708);
        assert_eq!(off.len(), 12);
        assert_eq!(off[0], 3);
        assert_eq!(&off[4..], &[8, 7, 6, 5, 4, 3, 2, 1]);
        assert!(!approved_enabled(Some(&off)) && approved_enabled(Some(&approved_bytes(true, 0))));
    }

    #[test]
    fn finds_the_program_in_a_command() {
        // Real commands from this PC's Run keys.
        assert_eq!(program_of(r#""C:\Program Files (x86)\Steam\steam.exe" -silent"#).as_deref(), Some(r"C:\Program Files (x86)\Steam\steam.exe"));
        assert_eq!(program_of(r"C:\Users\x\AppData\Local\Discord\Update.exe --processStart Discord.exe").as_deref(), Some(r"C:\Users\x\AppData\Local\Discord\Update.exe"));
        assert_eq!(program_of(r"%windir%\system32\SecurityHealthSystray.exe").as_deref(), Some(r"%windir%\system32\SecurityHealthSystray.exe"));
        assert_eq!(program_of(r"rundll32 shell32.dll,Control_RunDLL").as_deref(), Some("rundll32"));
        assert_eq!(program_of("  "), None);
    }

    #[test]
    fn names_people_recognize() {
        // Real cases from this PC.
        assert_eq!(display_name("GoogleChromeAutoLaunch_D9F5BBB6CF9DAEFDEE72C03BA594C1F9", Some("Brave Browser")), "Brave Browser");
        assert_eq!(display_name(r"C:\Users\x\AppData\Local\ExpanDrive\app-2026.11.6\ExpanDrive.exe", Some("Update")), "ExpanDrive");
        assert_eq!(display_name("Discord", Some("Discord - https://discord.com/")), "Discord");
        assert_eq!(display_name("electron.app.LM Studio", None), "electron.app.LM Studio");
        assert_eq!(display_name("Steam", Some("  ")), "Steam");
    }

    #[test]
    fn ids_round_trip_to_their_source() {
        for s in Source::ALL {
            assert_eq!(Source::from_key(s.key()), Some(s));
        }
        assert_eq!(Source::from_key("hklm"), None);
        assert_eq!(Source::UserFolder.scope(), Scope::User);
        assert_eq!(Source::MachineRun32.approved(), "Run32");
    }

    /// Prints what opens with Windows on this PC (read only).
    #[test]
    #[ignore]
    fn dump_startup() {
        for i in list() {
            println!("{:<40} {:<8} {:<5} {:<28} {}", i.name, format!("{:?}", i.scope), i.enabled, i.publisher.unwrap_or_default(), i.command);
        }
    }
}
