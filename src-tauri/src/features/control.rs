//! Control: Windows Update modes (through the documented policy values) and
//! Windows optional features (WSL, Hyper-V, Sandbox...). State is always read
//! from Windows, so it is the same here, in the Tweaks list and after a restart.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::features::engine::{regio, Hive, RegData};
use crate::features::hardware::one_or_many;
use crate::features::utils::run_hidden_powershell;

// ── Windows Update ───────────────────────────────────────────────────────────

const WU: &str = r"SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate";
const AU: &str = r"SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU";

/// Every value a mode may set. Nothing else under these keys is ever touched.
pub const MANAGED: &[(&str, &str)] = &[
    (WU, "DeferFeatureUpdates"),
    (WU, "DeferFeatureUpdatesPeriodInDays"),
    (WU, "DeferQualityUpdates"),
    (WU, "DeferQualityUpdatesPeriodInDays"),
    (WU, "ExcludeWUDriversInQualityUpdate"),
    (AU, "NoAutoUpdate"),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateMode {
    /// None of the managed values: Windows decides.
    Default,
    /// Feature updates a year late, quality updates 4 days late, no driver
    /// updates through Windows Update.
    Security,
    /// Automatic updates off; checking by hand still works.
    Manual,
    /// Managed values that match no mode (set by hand or by an organization).
    Custom,
}

/// The values a mode writes. Managed values not listed are removed.
pub fn mode_values(mode: UpdateMode) -> Vec<(&'static str, &'static str, u32)> {
    match mode {
        UpdateMode::Default | UpdateMode::Custom => vec![],
        UpdateMode::Security => vec![
            (WU, "DeferFeatureUpdates", 1),
            (WU, "DeferFeatureUpdatesPeriodInDays", 365),
            (WU, "DeferQualityUpdates", 1),
            (WU, "DeferQualityUpdatesPeriodInDays", 4),
            (WU, "ExcludeWUDriversInQualityUpdate", 1),
        ],
        UpdateMode::Manual => vec![(AU, "NoAutoUpdate", 1)],
    }
}

/// Which mode the current values add up to. `read` returns a managed DWORD.
pub fn detect(read: impl Fn(&str, &str) -> Option<u32>) -> UpdateMode {
    let present: Vec<(&str, &str, u32)> = MANAGED.iter().filter_map(|&(p, n)| read(p, n).map(|v| (p, n, v))).collect();
    for mode in [UpdateMode::Default, UpdateMode::Security, UpdateMode::Manual] {
        let mut want = mode_values(mode);
        let mut have = present.clone();
        want.sort();
        have.sort();
        if want == have {
            return mode;
        }
    }
    UpdateMode::Custom
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub mode: UpdateMode,
    /// Home ignores the deferral policies the Security mode relies on.
    pub deferral_supported: bool,
    pub edition: Option<String>,
}

fn read_dword(path: &str, name: &str) -> Option<u32> {
    match regio::read(Hive::Hklm, path, name) {
        Ok(Some(RegData::Dword(v))) => Some(v),
        _ => None,
    }
}

fn edition() -> Option<String> {
    match regio::read(Hive::Hklm, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "EditionID") {
        Ok(Some(RegData::Sz(s))) => Some(s),
        _ => None,
    }
}

/// "Core", "CoreSingleLanguage", "CoreCountrySpecific"... are the Home editions.
pub fn is_home(edition: Option<&str>) -> bool {
    edition.is_some_and(|e| e.starts_with("Core"))
}

fn update_state() -> UpdateState {
    let ed = edition();
    UpdateState { mode: detect(read_dword), deferral_supported: !is_home(ed.as_deref()), edition: ed }
}

#[tauri::command(async)]
pub fn get_update_mode() -> UpdateState {
    update_state()
}

#[tauri::command(async)]
pub fn set_update_mode(mode: UpdateMode) -> Result<UpdateState, String> {
    if mode == UpdateMode::Custom {
        return Err("Custom is not a mode that can be set.".into());
    }
    if mode == UpdateMode::Security && is_home(edition().as_deref()) {
        return Err("Windows Home ignores update deferral; the Security mode needs Pro or higher.".into());
    }
    // What is there now, to put back if a write fails halfway.
    let before: Vec<(&str, &str, Option<u32>)> = MANAGED.iter().map(|&(p, n)| (p, n, read_dword(p, n))).collect();
    let want = mode_values(mode);
    let apply = || -> std::io::Result<()> {
        for &(p, n) in MANAGED {
            match want.iter().find(|w| w.0 == p && w.1 == n) {
                Some(&(_, _, v)) => regio::write(Hive::Hklm, p, n, &RegData::Dword(v))?,
                None => regio::delete_value(Hive::Hklm, p, n)?,
            }
        }
        Ok(())
    };
    if let Err(e) = apply() {
        for (p, n, v) in &before {
            let _ = match v {
                Some(v) => regio::write(Hive::Hklm, p, n, &RegData::Dword(*v)),
                None => regio::delete_value(Hive::Hklm, p, n),
            };
        }
        return Err(format!("Could not change the update mode ({e}). The previous values were put back."));
    }
    Ok(update_state())
}

// ── Windows optional features ────────────────────────────────────────────────

/// The only features the app may switch. Must match src/lib/control.ts.
pub const FEATURES: &[&str] = &[
    "Microsoft-Windows-Subsystem-Linux",
    "VirtualMachinePlatform",
    "Microsoft-Hyper-V-All",
    "Containers-DisposableClientVM",
    "NetFx3",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FeatureStatus {
    Enabled,
    Disabled,
    /// Not part of this Windows edition (Hyper-V and Sandbox on Home).
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureState {
    pub name: String,
    pub status: FeatureStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturesReport {
    pub features: Vec<FeatureState>,
    /// Windows is waiting for a restart to finish a feature change.
    pub restart_pending: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CimFeature {
    name: String,
    install_state: u32,
}

#[derive(Deserialize)]
struct CimList(#[serde(deserialize_with = "one_or_many")] Vec<CimFeature>);

/// Win32_OptionalFeature (read without admin): 1 enabled, 2 disabled, 3 absent.
pub fn parse_features(json: &str) -> Result<Vec<FeatureState>, String> {
    let list: CimList = if json.trim().is_empty() {
        CimList(vec![])
    } else {
        serde_json::from_str(json.trim()).map_err(|e| format!("Could not read the feature list: {e}"))?
    };
    Ok(FEATURES
        .iter()
        .map(|&name| {
            let status = match list.0.iter().find(|f| f.name.eq_ignore_ascii_case(name)).map(|f| f.install_state) {
                Some(1) => FeatureStatus::Enabled,
                Some(2) => FeatureStatus::Disabled,
                _ => FeatureStatus::Unavailable,
            };
            FeatureState { name: name.to_string(), status }
        })
        .collect())
}

fn features_script() -> String {
    let names = FEATURES.iter().map(|n| format!("'{n}'")).collect::<Vec<_>>().join(",");
    format!(
        "$names = @({names})
ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_OptionalFeature | Where-Object {{ $names -contains $_.Name }} | Select-Object Name, InstallState)"
    )
}

fn reboot_pending() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
        winreg::RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending", KEY_READ)
            .is_ok()
    }
    #[cfg(not(windows))]
    false
}

fn features_report() -> Result<FeaturesReport, String> {
    let out = run_hidden_powershell(&features_script())?;
    Ok(FeaturesReport { features: parse_features(&out)?, restart_pending: reboot_pending() })
}

#[tauri::command]
pub async fn get_features() -> Result<FeaturesReport, String> {
    tauri::async_runtime::spawn_blocking(features_report).await.map_err(|e| format!("Runtime error: {e}"))?
}

/// One DISM change at a time: Windows servicing does not take two.
static FEATURE_LOCK: Mutex<()> = Mutex::new(());

pub fn feature_script(name: &str, enable: bool) -> Result<String, String> {
    // Only names from the fixed list ever reach the script.
    let name = FEATURES.iter().find(|&&n| n == name).ok_or_else(|| format!("Unknown feature: '{name}'"))?;
    Ok(if enable {
        format!("$r = Enable-WindowsOptionalFeature -Online -FeatureName '{name}' -All -NoRestart\nif ($r.RestartNeeded) {{ 'restart' }} else {{ 'done' }}")
    } else {
        format!("$r = Disable-WindowsOptionalFeature -Online -FeatureName '{name}' -NoRestart\nif ($r.RestartNeeded) {{ 'restart' }} else {{ 'done' }}")
    })
}

/// Turns a feature on or off. Returns the fresh report; restart_pending tells
/// whether Windows needs a restart to finish.
#[tauri::command]
pub async fn set_feature(name: String, enabled: bool) -> Result<FeaturesReport, String> {
    let script = feature_script(&name, enabled)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = FEATURE_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let out = run_hidden_powershell(&script)?;
        let mut report = features_report()?;
        report.restart_pending |= out.trim().ends_with("restart");
        Ok(report)
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn reader(values: &[(&'static str, &'static str, u32)]) -> impl Fn(&str, &str) -> Option<u32> {
        let map: HashMap<(String, String), u32> = values.iter().map(|&(p, n, v)| ((p.to_string(), n.to_string()), v)).collect();
        move |p, n| map.get(&(p.to_string(), n.to_string())).copied()
    }

    #[test]
    fn each_mode_reads_back_as_itself() {
        for mode in [UpdateMode::Default, UpdateMode::Security, UpdateMode::Manual] {
            assert_eq!(detect(reader(&mode_values(mode))), mode);
        }
    }

    #[test]
    fn foreign_or_partial_values_are_custom() {
        assert_eq!(detect(reader(&[(WU, "DeferQualityUpdatesPeriodInDays", 7), (WU, "DeferQualityUpdates", 1)])), UpdateMode::Custom);
        let mut manual_plus = mode_values(UpdateMode::Manual);
        manual_plus.push((WU, "DeferFeatureUpdates", 1));
        assert_eq!(detect(reader(&manual_plus)), UpdateMode::Custom);
    }

    #[test]
    fn modes_only_touch_managed_values() {
        for mode in [UpdateMode::Security, UpdateMode::Manual] {
            for (p, n, _) in mode_values(mode) {
                assert!(MANAGED.contains(&(p, n)), "{n} is not managed");
            }
        }
    }

    #[test]
    fn home_editions_are_detected() {
        assert!(is_home(Some("Core")));
        assert!(is_home(Some("CoreSingleLanguage")));
        assert!(!is_home(Some("Professional")));
        assert!(!is_home(None));
    }

    // Real output from this PC (Win32_OptionalFeature, Windows 11 Pro).
    const REAL: &str = r#"[{"Name":"VirtualMachinePlatform","InstallState":1},{"Name":"NetFx3","InstallState":1},{"Name":"Microsoft-Windows-Subsystem-Linux","InstallState":1},{"Name":"Microsoft-Hyper-V-All","InstallState":2},{"Name":"Containers-DisposableClientVM","InstallState":2}]"#;

    #[test]
    fn reads_feature_states_in_a_fixed_order() {
        let f = parse_features(REAL).unwrap();
        assert_eq!(f.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), FEATURES);
        assert_eq!(f[0].status, FeatureStatus::Enabled);
        assert_eq!(f[2].status, FeatureStatus::Disabled);
    }

    #[test]
    fn missing_features_are_unavailable() {
        // Windows Home: no Hyper-V or Sandbox entries; one item comes as a bare object.
        let f = parse_features(r#"{"Name":"NetFx3","InstallState":2}"#).unwrap();
        assert_eq!(f.iter().find(|x| x.name == "NetFx3").unwrap().status, FeatureStatus::Disabled);
        assert_eq!(f.iter().find(|x| x.name == "Microsoft-Hyper-V-All").unwrap().status, FeatureStatus::Unavailable);
        assert!(parse_features("").unwrap().iter().all(|x| x.status == FeatureStatus::Unavailable));
    }

    #[test]
    fn only_listed_features_reach_the_script() {
        assert!(feature_script("NetFx3", true).unwrap().contains("Enable-WindowsOptionalFeature -Online -FeatureName 'NetFx3' -All -NoRestart"));
        assert!(feature_script("x'; Remove-Item C:\\ -Recurse; '", true).is_err());
    }

    /// Must match src/lib/control.ts.
    const FRONTEND_FEATURES: &[&str] = &["Microsoft-Windows-Subsystem-Linux", "VirtualMachinePlatform", "Microsoft-Hyper-V-All", "Containers-DisposableClientVM", "NetFx3"];

    #[test]
    fn features_match_the_frontend_list() {
        assert_eq!(FEATURES, FRONTEND_FEATURES);
    }

    /// Real state from this PC (read-only): cargo test dump_control_json -- --ignored --nocapture
    #[test]
    #[ignore]
    fn dump_control_json() {
        println!("UPDATE_JSON={}", serde_json::to_string(&update_state()).unwrap());
        println!("FEATURES_JSON={}", serde_json::to_string(&features_report().unwrap()).unwrap());
    }
}
