//! Debloat: removes apps Windows ships with, for the current account, and
//! sends the person to the Microsoft Store page to get one back. Only the
//! packages listed here can be touched; the UI list (src/lib/debloat.ts) must
//! match it, which a test checks.

use serde::Serialize;

use crate::features::packages::{run_app_action, AppAction};
use crate::features::utils::run_hidden_powershell;

/// (AppX package name, publisher id). The package family name the Store
/// needs is "<name>_<publisher>".
pub const APPX: &[(&str, &str)] = &[
    ("Microsoft.Copilot", "8wekyb3d8bbwe"),
    ("Microsoft.BingNews", "8wekyb3d8bbwe"),
    ("Microsoft.BingWeather", "8wekyb3d8bbwe"),
    ("Microsoft.BingSearch", "8wekyb3d8bbwe"),
    ("Microsoft.GetHelp", "8wekyb3d8bbwe"),
    ("Microsoft.Getstarted", "8wekyb3d8bbwe"),
    ("Microsoft.MicrosoftSolitaireCollection", "8wekyb3d8bbwe"),
    ("Microsoft.MicrosoftOfficeHub", "8wekyb3d8bbwe"),
    ("Microsoft.OutlookForWindows", "8wekyb3d8bbwe"),
    ("Microsoft.PowerAutomateDesktop", "8wekyb3d8bbwe"),
    ("Microsoft.Todos", "8wekyb3d8bbwe"),
    ("Microsoft.WindowsFeedbackHub", "8wekyb3d8bbwe"),
    ("Microsoft.WindowsMaps", "8wekyb3d8bbwe"),
    ("Microsoft.ZuneVideo", "8wekyb3d8bbwe"),
    ("Microsoft.YourPhone", "8wekyb3d8bbwe"),
    ("Microsoft.GamingApp", "8wekyb3d8bbwe"),
    ("Microsoft.XboxGamingOverlay", "8wekyb3d8bbwe"),
    ("MicrosoftCorporationII.QuickAssist", "8wekyb3d8bbwe"),
    ("MSTeams", "8wekyb3d8bbwe"),
    ("Clipchamp.Clipchamp", "yxz26nhyzhsrt"),
    ("MicrosoftWindows.Client.WebExperience", "cw5n1h2txyewy"),
];

/// Classic (Win32) apps removed through winget: (id in this list, winget id).
pub const WINGET: &[(&str, &str)] = &[("OneDrive", "Microsoft.OneDrive")];

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BloatState {
    pub id: String,
    pub installed: bool,
}

/// Names are only letters, digits and dots, so they can sit in a script as is.
fn safe_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
}

/// The AppX packages of the list installed for this account, one name per line.
fn appx_script() -> String {
    let names = APPX.iter().map(|(n, _)| format!("'{n}'")).collect::<Vec<_>>().join(",");
    format!("$names = @({names})\nGet-AppxPackage | Where-Object {{ $names -contains $_.Name }} | ForEach-Object {{ $_.Name }}")
}

pub fn parse_installed(output: &str) -> Vec<BloatState> {
    let found: Vec<&str> = output.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    APPX.iter()
        .map(|(name, _)| BloatState { id: name.to_string(), installed: found.contains(name) })
        .collect()
}

/// OneDrive installs per user; its program file is the plainest sign it is there.
fn onedrive_installed() -> bool {
    std::env::var("LOCALAPPDATA").map(|d| std::path::Path::new(&d).join(r"Microsoft\OneDrive\OneDrive.exe").exists()).unwrap_or(false)
        || std::env::var("ProgramFiles").map(|d| std::path::Path::new(&d).join(r"Microsoft OneDrive\OneDrive.exe").exists()).unwrap_or(false)
}

fn list() -> Result<Vec<BloatState>, String> {
    let mut states = parse_installed(&run_hidden_powershell(&appx_script())?);
    states.push(BloatState { id: WINGET[0].0.into(), installed: onedrive_installed() });
    Ok(states)
}

/// Which apps of the list are installed for this account. Works without administrator.
#[tauri::command]
pub async fn list_bloat() -> Result<Vec<BloatState>, String> {
    tauri::async_runtime::spawn_blocking(list).await.map_err(|e| format!("Runtime error: {e}"))?
}

/// Removes one app of the list for this account, then reads the list again.
#[tauri::command]
pub async fn remove_bloat(id: String) -> Result<Vec<BloatState>, String> {
    if let Some((_, winget_id)) = WINGET.iter().find(|(k, _)| *k == id) {
        run_app_action(winget_id.to_string(), AppAction::Uninstall).await?;
    } else {
        let (name, _) = APPX.iter().find(|(n, _)| *n == id).ok_or_else(|| format!("Not in the debloat list: '{id}'"))?;
        // The list is fixed, but nothing reaches a script without this check.
        if !safe_name(name) {
            return Err(format!("Unsafe package name: '{name}'"));
        }
        let script = format!("Get-AppxPackage -Name '{name}' | Remove-AppxPackage");
        tauri::async_runtime::spawn_blocking(move || run_hidden_powershell(&script))
            .await
            .map_err(|e| format!("Runtime error: {e}"))??;
    }
    let states = tauri::async_runtime::spawn_blocking(list).await.map_err(|e| format!("Runtime error: {e}"))??;
    if states.iter().any(|s| s.id == id && s.installed) {
        return Err("Windows kept the app installed.".into());
    }
    Ok(states)
}

/// The Store page that reinstalls an AppX app of the list.
pub fn store_link(id: &str) -> Option<String> {
    APPX.iter().find(|(n, _)| *n == id).map(|(n, p)| format!("ms-windows-store://pdp/?PFN={n}_{p}"))
}

#[tauri::command]
pub fn open_store_page(id: String) -> Result<(), String> {
    let link = store_link(&id).ok_or_else(|| format!("Not in the debloat list: '{id}'"))?;
    std::process::Command::new("explorer.exe").arg(link).spawn().map(|_| ()).map_err(|e| format!("Could not open the Store: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The ids in the frontend list, read from the file itself so the two never drift.
    fn frontend_ids() -> Vec<&'static str> {
        const LIST: &str = include_str!("../../../src/lib/debloat.ts");
        LIST.split("{ id: \"").skip(1).filter_map(|rest| rest.split('"').next()).collect()
    }

    #[test]
    fn list_matches_the_frontend() {
        let mut ours: Vec<&str> = APPX.iter().map(|(n, _)| *n).chain(WINGET.iter().map(|(k, _)| *k)).collect();
        let mut theirs = frontend_ids();
        ours.sort();
        theirs.sort();
        assert_eq!(ours, theirs);
    }

    #[test]
    fn names_are_safe_in_a_script() {
        for (name, publisher) in APPX {
            assert!(safe_name(name), "{name}");
            assert!(publisher.len() == 13 && publisher.chars().all(|c| c.is_ascii_alphanumeric()), "{publisher}");
        }
        assert!(!safe_name("x'; Remove-Item C:\\ -Recurse; '"));
    }

    #[test]
    fn reads_installed_names() {
        let states = parse_installed("Microsoft.BingNews\r\nClipchamp.Clipchamp\r\n");
        assert!(states.iter().find(|s| s.id == "Microsoft.BingNews").unwrap().installed);
        assert!(!states.iter().find(|s| s.id == "Microsoft.Copilot").unwrap().installed);
        assert_eq!(states.len(), APPX.len());
    }

    #[test]
    fn store_links_are_package_families() {
        assert_eq!(store_link("Clipchamp.Clipchamp").as_deref(), Some("ms-windows-store://pdp/?PFN=Clipchamp.Clipchamp_yxz26nhyzhsrt"));
        assert_eq!(store_link("calc.exe"), None);
    }

    /// Prints which apps of the list this PC has (read only).
    #[test]
    #[ignore]
    fn dump_bloat() {
        println!("{:#?}", list());
    }
}
