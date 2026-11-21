//! Admin check and System Restore helpers. Applying and reverting tweaks lives
//! in `engine.rs`.

use crate::features::utils::{run_hidden_powershell, silent_cmd};

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

const RESTORE_POINT_SCRIPT: &str =
    "Checkpoint-Computer -Description 'Segatt Tools' -RestorePointType 'MODIFY_SETTINGS'";

/// Creates a System Restore point without opening a window. Windows silently
/// skips a new point when one was made in the last 24 hours; that still counts
/// as protected.
#[tauri::command]
pub async fn create_restore_point() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| run_hidden_powershell(RESTORE_POINT_SCRIPT))
        .await
        .map_err(|e| format!("Runtime error: {e}"))?
        .map(|_| "Restore point created.".to_string())
        .map_err(|e| format!("Could not create a restore point: {e} Make sure System Protection is on for drive C:."))
}

/// Opens the Windows System Restore wizard and returns immediately.
#[tauri::command]
pub fn open_system_restore() -> Result<(), String> {
    silent_cmd("rstrui.exe")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open System Restore: {e}"))
}
