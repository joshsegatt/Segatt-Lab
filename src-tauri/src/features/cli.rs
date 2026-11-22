//! `"Segatt Tools.exe" --profile C:\path\profile.json` applies a profile with
//! no window: the same file the Profile screen exports, and the same choices
//! it makes by default. A restore point comes first; risky tweaks, tweaks that
//! do not fit this hardware and tweaks this PC cannot read are left out and
//! listed; apps winget already installed are skipped.
//!
//! Output goes to the terminal that started it and to `profile-run.log` in the
//! app data folder, because an elevated run may not reach that terminal.
//! Exit codes: 0 done, 1 something failed, 2 the arguments or the file are wrong.

use crate::features::{engine, hardware, packages, tweaks, utils::is_valid_package_id};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// tauri.conf.json "identifier": the app data folder is %APPDATA%\<identifier>.
pub const IDENTIFIER: &str = "com.segatt.tools";
const FORMAT: &str = "segatt-tools-profile";
const VERSION: u64 = 1;
const MAX_BYTES: u64 = 512 * 1024;
const MAX_APPS: usize = 1000;
const MAX_NAME: usize = 200;
const NOT_PROFILE: &str = "This file is not a Segatt Tools profile.";

/// Tweaks marked risk: "risky" in src/lib/tweaks-catalog.ts. An import never
/// turns them on by itself.
const RISKY: &[&str] = &["disable_windows_update"];

/// Mirrors hardwareHint in src/lib/hardware.ts: tweaks left out on this PC.
/// With the hardware unknown, those tweaks are left out too: no screen asks.
pub fn skip_for_pc(id: &str, hw: Option<&hardware::Hardware>) -> Option<&'static str> {
    const HW_RULES: [&str; 3] = ["disable_power_throttling", "high_performance_plan", "disable_superfetch"];
    let Some(hw) = hw else {
        return HW_RULES.contains(&id).then_some("the hardware could not be read");
    };
    match id {
        "disable_power_throttling" | "high_performance_plan" if hw.laptop => Some("this PC is a laptop"),
        "disable_superfetch" if hw.system_disk.as_ref().and_then(|d| d.media.as_deref()) == Some("HDD") => {
            Some("Windows is on a hard drive")
        }
        _ => None,
    }
}

#[derive(Debug, PartialEq)]
pub struct Profile {
    pub tweaks: Vec<String>,
    /// (winget id, name)
    pub apps: Vec<(String, String)>,
    /// Entries left out as unknown or malformed.
    pub dropped: usize,
}

/// Same rules as parseProfile in src/lib/profile.ts: nothing in the file is trusted.
pub fn parse_profile(text: &str) -> Result<Profile, String> {
    if text.len() as u64 > MAX_BYTES {
        return Err("The file is too big to be a profile.".into());
    }
    let raw: serde_json::Value = serde_json::from_str(text).map_err(|_| "The file is not valid JSON.".to_string())?;
    let obj = raw.as_object().ok_or(NOT_PROFILE)?;
    if obj.get("format").and_then(|v| v.as_str()) != Some(FORMAT) {
        return Err(NOT_PROFILE.into());
    }
    let version = obj.get("version").and_then(|v| v.as_u64()).filter(|&v| v >= 1).ok_or(NOT_PROFILE)?;
    if version > VERSION {
        return Err("This profile comes from a newer Segatt Tools. Update the app first.".into());
    }

    let known: HashSet<&str> = engine::specs().iter().map(|s| s.id).collect();
    let mut dropped = 0;
    let mut tweaks: Vec<String> = Vec::new();
    for v in obj.get("tweaks").and_then(|v| v.as_array()).into_iter().flatten() {
        match v.as_str() {
            Some(id) if known.contains(id) && !tweaks.iter().any(|t| t == id) => tweaks.push(id.to_string()),
            _ => dropped += 1,
        }
    }
    let mut apps: Vec<(String, String)> = Vec::new();
    let mut seen = HashSet::new();
    for a in obj.get("apps").and_then(|v| v.as_array()).into_iter().flatten() {
        let id = a.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
        if !is_valid_package_id(id) || !seen.insert(id.to_lowercase()) || apps.len() >= MAX_APPS {
            dropped += 1;
            continue;
        }
        let name = a.get("name").and_then(|v| v.as_str()).map(str::trim).filter(|n| !n.is_empty()).unwrap_or(id);
        apps.push((id.to_string(), name.chars().take(MAX_NAME).collect()));
    }
    if tweaks.is_empty() && apps.is_empty() {
        return Err("The profile has nothing this app can apply.".into());
    }
    Ok(Profile { tweaks, apps, dropped })
}

/// Prints to the terminal and keeps every line for the log.
struct Out {
    log: String,
}

impl Out {
    fn line(&mut self, text: impl AsRef<str>) {
        let text = text.as_ref();
        println!("{text}");
        self.log.push_str(text);
        self.log.push_str("\r\n");
    }
}

fn app_data_dir() -> Result<PathBuf, String> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join(IDENTIFIER)).ok_or_else(|| "No APPDATA folder.".to_string())
}

fn read_file(path: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| {
        let hint = if path.is_relative() { " Use the full path to the file." } else { "" };
        format!("Could not open {}: {e}.{hint}", path.display())
    })?;
    if meta.len() > MAX_BYTES {
        return Err("The file is too big to be a profile.".into());
    }
    std::fs::read_to_string(path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}

fn apply(path: &Path, out: &mut Out) -> i32 {
    let profile = match read_file(path).and_then(|t| parse_profile(&t)) {
        Ok(p) => p,
        Err(e) => {
            out.line(e);
            return 2;
        }
    };
    out.line(format!("Segatt Tools: applying {}", path.display()));
    if profile.dropped > 0 {
        out.line(format!("{} entries in the file were left out: unknown to this version or malformed.", profile.dropped));
    }
    let snapshots = match app_data_dir().and_then(|d| engine::snapshot_in(&d)) {
        Ok(p) => p,
        Err(e) => {
            out.line(e);
            return 1;
        }
    };

    let (mut on, mut installed, mut already, mut skipped, mut failed) = (0, 0, 0, 0, 0);

    // Tweaks: the Profile screen's default picks.
    if !profile.tweaks.is_empty() {
        let states: Vec<engine::TweakState> = engine::states_at(Some(&snapshots));
        let hw = hardware::read().ok();
        let mut todo = Vec::new();
        for id in &profile.tweaks {
            let status = states.iter().find(|s| &s.id == id).map(|s| s.status.clone());
            let why = if status == Some(engine::Status::Active) {
                already += 1;
                continue;
            } else if RISKY.contains(&id.as_str()) {
                Some("risky; turn it on in the app if you want it")
            } else if let Some(reason) = skip_for_pc(id, hw.as_ref()) {
                Some(reason)
            } else if status != Some(engine::Status::Inactive) {
                Some("this PC cannot read its state")
            } else {
                None
            };
            match why {
                Some(reason) => {
                    skipped += 1;
                    out.line(format!("  skipped  {id}: {reason}"));
                }
                None => todo.push(id.clone()),
            }
        }
        if !todo.is_empty() {
            out.line("Creating a restore point...");
            match tweaks::restore_point() {
                Ok(()) => {
                    for id in todo {
                        match engine::set_tweak_at(&snapshots, id.clone(), true) {
                            Ok(_) => {
                                on += 1;
                                out.line(format!("  on       {id}"));
                            }
                            Err(e) => {
                                failed += 1;
                                out.line(format!("  FAILED   {id}: {e}"));
                            }
                        }
                    }
                }
                Err(e) => {
                    failed += todo.len();
                    out.line(e);
                    out.line("No tweak was changed: none runs without its restore point.");
                }
            }
        }
    }

    // Apps: what winget has not installed yet.
    if !profile.apps.is_empty() {
        // Without the list, `winget install` would upgrade apps already there.
        let have: HashSet<String> = match packages::installed() {
            Ok(list) => list.into_iter().map(|a| a.id.to_lowercase()).collect(),
            Err(e) => {
                failed += profile.apps.len();
                out.line(format!("Could not list the installed apps ({e}); no app was installed."));
                return finish(out, on, installed, already, skipped, failed);
            }
        };
        for (id, name) in &profile.apps {
            if have.contains(&id.to_lowercase()) {
                already += 1;
                continue;
            }
            out.line(format!("  installing {name} ({id})..."));
            match packages::app_action(id, packages::AppAction::Install) {
                Ok(()) => {
                    installed += 1;
                    out.line(format!("  installed  {name}"));
                }
                Err(e) => {
                    failed += 1;
                    out.line(format!("  FAILED     {name}: {}", e.lines().next().unwrap_or("")));
                }
            }
        }
    }

    finish(out, on, installed, already, skipped, failed)
}

fn finish(out: &mut Out, on: usize, installed: usize, already: usize, skipped: usize, failed: usize) -> i32 {
    out.line(format!(
        "Done: {on} tweaks on, {installed} apps installed, {already} already set, {skipped} skipped, {failed} failed."
    ));
    if failed > 0 {
        1
    } else {
        0
    }
}

/// Lets a window app print to the terminal that started it.
#[cfg(windows)]
fn attach_console() {
    extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    // SAFETY: a plain Win32 call with no pointers; failing (no parent console) is fine.
    unsafe {
        AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

/// Runs the command line when `--profile` is given and returns the exit code;
/// None starts the app as usual.
pub fn from_args(args: impl Iterator<Item = String>) -> Option<i32> {
    cli(args, app_data_dir().ok().as_deref())
}

/// `from_args` with the log folder given (tests pass none).
fn cli(args: impl Iterator<Item = String>, log_dir: Option<&Path>) -> Option<i32> {
    let args: Vec<String> = args.skip(1).collect();
    let at = args.iter().position(|a| a.eq_ignore_ascii_case("--profile"))?;
    #[cfg(windows)]
    attach_console();
    let mut out = Out { log: String::new() };
    let code = match args.get(at + 1) {
        Some(file) => apply(Path::new(file), &mut out),
        None => {
            out.line("Usage: \"Segatt Tools.exe\" --profile C:\\path\\profile.json");
            2
        }
    };
    if let Some(dir) = log_dir {
        let log = dir.join("profile-run.log");
        if std::fs::create_dir_all(dir).and_then(|_| std::fs::write(&log, &out.log)).is_ok() {
            println!("Log: {}", log.display());
        }
    }
    Some(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(tweaks: &str, apps: &str) -> String {
        format!(r#"{{"format":"segatt-tools-profile","version":1,"exportedAt":"2026-11-22T10:00:00Z","tweaks":{tweaks},"apps":{apps}}}"#)
    }

    #[test]
    fn reads_a_profile_and_drops_what_it_does_not_know() {
        let p = parse_profile(&profile(
            r#"["dark_mode","dark_mode","no_such_tweak",7]"#,
            r#"[{"id":"Valve.Steam","name":"Steam"},{"id":"valve.steam"},{"id":"Foo; rm -rf"},{"id":"7zip.7zip"}]"#,
        ))
        .unwrap();
        assert_eq!(p.tweaks, vec!["dark_mode"]);
        assert_eq!(p.apps, vec![("Valve.Steam".into(), "Steam".into()), ("7zip.7zip".into(), "7zip.7zip".into())]);
        assert_eq!(p.dropped, 5, "duplicate tweak, unknown tweak, number, duplicate app, bad id");
    }

    #[test]
    fn refuses_what_is_not_a_profile() {
        assert!(parse_profile("not json").is_err());
        assert_eq!(parse_profile(r#"{"format":"other","version":1}"#).unwrap_err(), NOT_PROFILE);
        assert_eq!(parse_profile(r#"{"format":"segatt-tools-profile","version":0,"tweaks":["dark_mode"]}"#).unwrap_err(), NOT_PROFILE);
        assert!(parse_profile(r#"{"format":"segatt-tools-profile","version":2,"tweaks":["dark_mode"]}"#).unwrap_err().contains("newer"));
        assert!(parse_profile(&profile("[]", "[]")).unwrap_err().contains("nothing"));
        assert!(parse_profile(&format!("{}{}", profile("[]", "[]"), " ".repeat(MAX_BYTES as usize))).unwrap_err().contains("too big"));
    }

    #[test]
    fn hardware_rules_leave_out_what_does_not_fit() {
        let mut hw = hardware::Hardware { laptop: true, ..Default::default() };
        assert!(skip_for_pc("disable_power_throttling", Some(&hw)).is_some());
        assert!(skip_for_pc("high_performance_plan", Some(&hw)).is_some());
        assert!(skip_for_pc("disable_superfetch", Some(&hw)).is_none());
        hw.laptop = false;
        hw.system_disk = Some(hardware::Disk { media: Some("HDD".into()), ..Default::default() });
        assert!(skip_for_pc("disable_superfetch", Some(&hw)).is_some());
        assert!(skip_for_pc("disable_power_throttling", Some(&hw)).is_none());
        // Unknown hardware: the cautious side.
        assert!(skip_for_pc("disable_power_throttling", None).is_some());
        assert!(skip_for_pc("disable_superfetch", None).is_some());
        assert!(skip_for_pc("dark_mode", None).is_none());
    }

    /// The rules above copy the frontend; these read the frontend itself so they never drift.
    #[test]
    fn rules_match_the_frontend() {
        const CATALOG: &str = include_str!("../../../src/lib/tweaks-catalog.ts");
        let risky: Vec<&str> = CATALOG
            .split("{ id: \"")
            .skip(1)
            .filter(|chunk| chunk.contains("risk: \"risky\""))
            .filter_map(|chunk| chunk.split('"').next())
            .collect();
        assert_eq!(risky, RISKY);

        const HARDWARE: &str = include_str!("../../../src/lib/hardware.ts");
        let mut skips: Vec<&str> = HARDWARE.split("id === \"").skip(1).filter_map(|c| c.split('"').next()).collect();
        skips.sort();
        assert_eq!(skips, ["disable_power_throttling", "disable_superfetch", "high_performance_plan"]);

        const CONF: &str = include_str!("../../tauri.conf.json");
        assert!(CONF.contains(&format!("\"identifier\": \"{IDENTIFIER}\"")), "the app data folder must match Tauri's");
    }

    #[test]
    fn only_the_profile_flag_takes_over() {
        let args = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>().into_iter();
        assert_eq!(cli(args(&["app.exe"]), None), None);
        assert_eq!(cli(args(&["app.exe", "--something"]), None), None);
        assert_eq!(cli(args(&["app.exe", "--profile"]), None), Some(2), "a missing file is a usage error");
        assert_eq!(cli(args(&["app.exe", "--profile", r"C:\nope\missing.json"]), None), Some(2));
    }
}
