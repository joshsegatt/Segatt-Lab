use serde::{Deserialize, Serialize};

use crate::features::utils::{ps_quote, run_visible_task, silent_cmd};

#[derive(Debug, Serialize, Deserialize)]
pub struct Tweak {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
}

/// True only when the process runs elevated. Checking the Administrators SID
/// (S-1-5-32-544) is not enough: a non-elevated admin token also lists it,
/// marked "deny only". The High (S-1-16-12288) or System (S-1-16-16384)
/// integrity level is what proves elevation.
#[tauri::command]
pub async fn check_admin() -> Result<bool, String> {
    let output = tauri::async_runtime::spawn_blocking(|| silent_cmd("whoami").arg("/groups").output())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.contains("S-1-16-12288") || stdout.contains("S-1-16-16384"))
}

#[tauri::command]
pub async fn get_tweaks() -> Result<Vec<Tweak>, String> {
    // Tweak definitions live in the frontend (tweaks/page.tsx).
    Ok(vec![])
}

const RESTORE_POINT_SCRIPT: &str =
    "Checkpoint-Computer -Description 'Segatt Tools Pre-Tweak' -RestorePointType 'MODIFY_SETTINGS'";

#[tauri::command]
pub async fn create_restore_point() -> Result<String, String> {
    run_visible_task("Create Restore Point".into(), RESTORE_POINT_SCRIPT.into())
        .await
        .map(|_| "System restore point created successfully.".to_string())
        .map_err(|e| format!("{e} Make sure System Protection is enabled for drive C:."))
}

/// One `reg.exe` call that fails the task when reg.exe fails.
fn reg(args: &[&str]) -> String {
    let quoted: Vec<String> = args.iter().map(|a| ps_quote(a)).collect();
    format!(
        "& reg.exe {}\nif ($LASTEXITCODE -ne 0) {{ throw \"reg.exe failed with code $LASTEXITCODE\" }}",
        quoted.join(" ")
    )
}

fn reg_dword(key: &str, name: &str, value: &str) -> String {
    reg(&["add", key, "/v", name, "/t", "REG_DWORD", "/d", value, "/f"])
}

fn reg_sz(key: &str, name: &str, value: &str) -> String {
    reg(&["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"])
}

fn disable_service(name: &str) -> String {
    format!(
        "Stop-Service -Name {n} -Force -ErrorAction SilentlyContinue\nSet-Service -Name {n} -StartupType Disabled",
        n = ps_quote(name)
    )
}

const HIGH_PERF_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

/// PowerShell for each tweak id, or None for an unknown id.
fn tweak_script(id: &str) -> Option<String> {
    let s = match id {
        // ── Privacy ───────────────────────────────────────────────────────────
        "disable_telemetry" => reg_dword("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", "0"),
        "disable_cortana" => reg_dword("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search", "AllowCortana", "0"),
        "disable_activity_feed" => reg_dword("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System", "EnableActivityFeed", "0"),
        "remove_bing_search" => reg_dword("HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer", "DisableSearchBoxSuggestions", "1"),
        "disable_location" => reg_sz("HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location", "Value", "Deny"),
        "disable_advertising_id" => reg_dword("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo", "Enabled", "0"),
        "disable_wifi_sense" => reg_dword("HKLM\\SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config", "AutoConnectAllowedOEM", "0"),
        "disable_feedback" => reg_dword("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "DoNotShowFeedbackNotifications", "1"),

        // ── Performance ───────────────────────────────────────────────────────
        // Falls back to a copy of the plan when it is hidden (Modern Standby laptops).
        "high_performance_plan" => format!(
            "powercfg /setactive {g}
if ($LASTEXITCODE -ne 0) {{
    $out = powercfg -duplicatescheme {g}
    $guid = [regex]::Match(($out | Out-String), '[0-9a-fA-F]{{8}}(-[0-9a-fA-F]{{4}}){{3}}-[0-9a-fA-F]{{12}}').Value
    if (-not $guid) {{ throw 'The High Performance power plan is not available on this PC.' }}
    powercfg /setactive $guid
}}",
            g = HIGH_PERF_GUID
        ),
        // `sc stop` alone came back on the next boot; the service must be disabled.
        "disable_superfetch" => disable_service("SysMain"),
        "disable_search_indexing" => disable_service("WSearch"),
        "disable_visual_fx" => reg_dword("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", "VisualFXSetting", "2"),
        // Was hardcoded to an adapter named "Ethernet", so Wi-Fi and renamed adapters were skipped.
        "set_dns_cloudflare" => "$adapters = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')
if ($adapters.Count -eq 0) { throw 'No active network adapter found.' }
$adapters | Set-DnsClientServerAddress -ServerAddresses ('1.1.1.1', '1.0.0.1')
$adapters | ForEach-Object { Write-Host \"DNS set to 1.1.1.1 on $($_.Name)\" }".to_string(),
        "disable_game_bar" => [
            reg_dword("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR", "AppCaptureEnabled", "0"),
            reg_dword("HKCU\\System\\GameConfigStore", "GameDVR_Enabled", "0"),
        ].join("\n"),
        // Removes a forced HPET system clock (Windows default). The delete fails when
        // the value was never set, so the result is checked by reading the BCD back.
        "optimize_hpet" => "& bcdedit.exe /deletevalue useplatformclock | Out-Null
$global:LASTEXITCODE = 0
$bcd = & bcdedit.exe /enum '{current}' | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Could not read the boot configuration.' }
if ($bcd -match 'useplatformclock') { throw 'useplatformclock is still set.' }
Write-Host 'HPET is not forced as the system clock (Windows default).'".to_string(),

        // ── Interface ─────────────────────────────────────────────────────────
        "dark_mode" => [
            reg_dword("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "AppsUseLightTheme", "0"),
            reg_dword("HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "SystemUsesLightTheme", "0"),
        ].join("\n"),
        // `/ve` without `/d` writes an empty default value. The old `/d ""` was
        // dropped by PowerShell, so reg.exe read "/f" as the data.
        "classic_context_menu" => [
            reg(&["add", "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32", "/ve", "/f"]),
            "Write-Host 'Restart Explorer or sign out to see the classic menu.'".to_string(),
        ].join("\n"),
        "show_file_extensions" => reg_dword("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "HideFileExt", "0"),
        "show_hidden_files" => reg_dword("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "Hidden", "1"),
        // "Enhance pointer precision" is off only when all three values are 0.
        "disable_mouse_accel" => [
            reg_sz("HKCU\\Control Panel\\Mouse", "MouseSpeed", "0"),
            reg_sz("HKCU\\Control Panel\\Mouse", "MouseThreshold1", "0"),
            reg_sz("HKCU\\Control Panel\\Mouse", "MouseThreshold2", "0"),
        ].join("\n"),

        // ── System ────────────────────────────────────────────────────────────
        "enable_long_paths" => reg_dword("HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem", "LongPathsEnabled", "1"),
        "enable_f8_boot" => "& bcdedit.exe /set '{bootmgr}' displaybootmenu yes".to_string(),
        "disable_fast_startup" => reg_dword("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power", "HiberbootEnabled", "0"),
        // Turns off automatic updates only; manual "Check for updates" keeps working.
        "disable_windows_update" => reg_dword("HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", "NoAutoUpdate", "1"),
        "create_restore_point" => RESTORE_POINT_SCRIPT.to_string(),

        _ => return None,
    };
    Some(s)
}

#[tauri::command]
pub async fn apply_tweak(id: String) -> Result<String, String> {
    // Native app, not a script: open it and return without waiting for it to close.
    if id == "open_system_restore" {
        silent_cmd("rstrui.exe")
            .spawn()
            .map_err(|e| format!("Could not open System Restore: {e}"))?;
        return Ok("System Restore opened.".to_string());
    }

    let script = tweak_script(&id).ok_or_else(|| format!("Unknown tweak: '{id}'"))?;
    run_visible_task(format!("Apply Tweak: {id}"), script).await?;
    Ok(format!("'{id}' applied."))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRONTEND_IDS: &[&str] = &[
        "disable_telemetry", "disable_cortana", "disable_activity_feed", "remove_bing_search",
        "disable_location", "disable_advertising_id", "disable_wifi_sense", "disable_feedback",
        "optimize_hpet", "disable_game_bar", "high_performance_plan", "disable_superfetch",
        "disable_search_indexing", "disable_visual_fx", "set_dns_cloudflare", "dark_mode",
        "classic_context_menu", "show_file_extensions", "show_hidden_files", "disable_mouse_accel",
        "enable_long_paths", "enable_f8_boot", "disable_fast_startup", "disable_windows_update",
        "create_restore_point",
    ];

    #[test]
    fn every_frontend_tweak_has_a_script() {
        for id in FRONTEND_IDS {
            assert!(tweak_script(id).is_some(), "missing script for {id}");
        }
        assert!(tweak_script("rm -rf").is_none());
    }

    #[test]
    fn classic_menu_writes_an_empty_default_value() {
        let s = tweak_script("classic_context_menu").unwrap();
        assert!(s.contains("'/ve' '/f'"));
        assert!(!s.contains("'/d'"));
    }

    #[test]
    fn services_are_disabled_not_just_stopped() {
        assert!(tweak_script("disable_superfetch").unwrap().contains("-StartupType Disabled"));
        assert!(tweak_script("disable_search_indexing").unwrap().contains("-StartupType Disabled"));
    }

    #[test]
    fn dns_does_not_depend_on_adapter_name() {
        assert!(!tweak_script("set_dns_cloudflare").unwrap().contains("Ethernet"));
    }
}
