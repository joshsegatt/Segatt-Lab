use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, System};
use tauri::{Emitter, State, Window};

use crate::features::utils::run_visible_task;

#[derive(Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub used_memory: u64,
    pub total_memory: u64,
}

pub struct SystemState(pub Mutex<System>);

#[tauri::command]
pub fn get_system_stats(state: State<'_, SystemState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    // Refresh only what we need for performance
    sys.refresh_cpu_specifics(CpuRefreshKind::new().with_cpu_usage());
    sys.refresh_memory_specifics(MemoryRefreshKind::new().with_ram());

    SystemStats {
        cpu_usage: sys.global_cpu_usage(),
        used_memory: sys.used_memory() / 1024 / 1024, // MB
        total_memory: sys.total_memory() / 1024 / 1024, // MB
    }
}

/// Only these panels can be opened. The old version passed any string to
/// `cmd /C start`, which let the UI run any program with the app's rights.
const ALLOWED_PANELS: &[&str] = &[
    "compmgmt.msc", "devmgmt.msc", "diskmgmt.msc", "services.msc",
    "control", "ncpa.cpl", "powercfg.cpl", "sysdm.cpl",
];

fn panel_command(panel: &str) -> Option<(&'static str, &str)> {
    if !ALLOWED_PANELS.contains(&panel) {
        return None;
    }
    Some(if panel.ends_with(".msc") {
        ("mmc.exe", panel)
    } else if panel == "control" {
        ("control.exe", "")
    } else {
        ("control.exe", panel)
    })
}

#[tauri::command]
pub fn open_legacy_panel(panel: String) -> Result<(), String> {
    let (program, arg) = panel_command(&panel).ok_or_else(|| format!("Panel not allowed: '{panel}'"))?;
    let mut cmd = Command::new(program);
    if !arg.is_empty() {
        cmd.arg(arg);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// (task name, script) for each fix id the Fixes page offers.
fn fix_script(id: &str) -> Option<(&'static str, &'static str)> {
    Some(match id {
        "sfc" => ("System File Checker (SFC)", "sfc /scannow"),
        "dism" => ("Deployment Image Servicing (DISM)", "DISM /Online /Cleanup-Image /RestoreHealth"),
        // `netsh int ip reset` often returns 1 for a few protected keys while the
        // reset itself works, so only the Winsock reset decides success.
        "net" => ("Network Reset", "
netsh winsock reset
if ($LASTEXITCODE -ne 0) { throw 'Winsock reset failed.' }
netsh int ip reset
ipconfig /flushdns
$global:LASTEXITCODE = 0
Write-Host 'Restart the PC to finish the network reset.' -ForegroundColor Yellow"),
        "update" => ("Windows Update Reset", "
$services = 'wuauserv', 'bits', 'cryptsvc'
Stop-Service -Name $services -Force -ErrorAction SilentlyContinue
try {
    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    $sd = \"$env:SystemRoot\\SoftwareDistribution\"
    $cr = \"$env:SystemRoot\\System32\\catroot2\"
    if (Test-Path $sd) { Rename-Item -Path $sd -NewName \"SoftwareDistribution.bak$stamp\" }
    if (Test-Path $cr) { Rename-Item -Path $cr -NewName \"catroot2.bak$stamp\" }
    Write-Host 'Windows Update cache reset.'
} finally {
    Start-Service -Name $services -ErrorAction SilentlyContinue
}"),
        "cache" => ("Rebuild Icon Cache", "ie4uinit.exe -show"),
        _ => return None,
    })
}

#[tauri::command]
pub async fn run_system_fix(window: Window, id: String) -> Result<(), String> {
    let (task_name, script) = fix_script(&id).ok_or_else(|| format!("Unknown fix: '{id}'"))?;

    let _ = window.emit("system-fix-log", format!("Starting: {task_name}"));
    match run_visible_task(task_name.into(), script.into()).await {
        Ok(()) => {
            let _ = window.emit("system-fix-log", format!("Done: {task_name}"));
            Ok(())
        }
        Err(e) => {
            let _ = window.emit("system-fix-log", format!("Failed: {task_name}"));
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_fixes_page_button_has_a_script() {
        for id in ["sfc", "dism", "net", "update", "cache"] {
            assert!(fix_script(id).is_some(), "missing fix {id}");
        }
    }

    #[test]
    fn only_listed_panels_open() {
        assert_eq!(panel_command("services.msc"), Some(("mmc.exe", "services.msc")));
        assert_eq!(panel_command("ncpa.cpl"), Some(("control.exe", "ncpa.cpl")));
        assert_eq!(panel_command("control"), Some(("control.exe", "")));
        assert_eq!(panel_command("calc.exe"), None);
        assert_eq!(panel_command("https://evil.example"), None);
        assert_eq!(panel_command("services.msc & calc"), None);
    }
}
