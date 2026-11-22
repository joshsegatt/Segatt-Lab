use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, System};
use tauri::State;

use crate::features::packages::{output_tail, run_with_timeout};
use crate::features::utils::{encode_command, hidden_script};

#[derive(Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub used_memory: u64,
    pub total_memory: u64,
    /// Free and total bytes of the Windows system drive (0 when it cannot be read).
    pub disk_free: u64,
    pub disk_total: u64,
    pub uptime_secs: u64,
}

#[derive(Serialize)]
pub struct PcInfo {
    pub host_name: String,
    pub os_version: String,
}

/// Free and total bytes of the drive Windows runs from (SystemDrive, usually C:).
fn system_drive_space() -> (u64, u64) {
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    let mount = format!("{}\\", drive.trim_end_matches('\\'));
    Disks::new_with_refreshed_list()
        .iter()
        .find(|d| d.mount_point().to_string_lossy().eq_ignore_ascii_case(&mount))
        .map(|d| (d.available_space(), d.total_space()))
        .unwrap_or((0, 0))
}

#[tauri::command]
pub fn get_pc_info() -> PcInfo {
    PcInfo {
        host_name: System::host_name().unwrap_or_else(|| "PC".into()),
        os_version: System::long_os_version().unwrap_or_else(|| "Windows".into()),
    }
}

pub struct SystemState(pub Mutex<System>);

/// Async so the disk query never runs on the UI thread (sync commands do).
#[tauri::command(async)]
pub fn get_system_stats(state: State<'_, SystemState>) -> SystemStats {
    let mut sys = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    // Refresh only what we need for performance
    sys.refresh_cpu_specifics(CpuRefreshKind::new().with_cpu_usage());
    sys.refresh_memory_specifics(MemoryRefreshKind::new().with_ram());

    let (disk_free, disk_total) = system_drive_space();
    SystemStats {
        cpu_usage: sys.global_cpu_usage(),
        used_memory: sys.used_memory() / 1024 / 1024, // MB
        total_memory: sys.total_memory() / 1024 / 1024, // MB
        disk_free,
        disk_total,
        uptime_secs: System::uptime(),
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

/// PowerShell script for the fixes that are not SFC or DISM (those two run
/// directly, so their own output and exit code can be read).
fn fix_script(id: &str) -> Option<&'static str> {
    Some(match id {
        // `netsh int ip reset` often returns 1 for a few protected keys while the
        // reset itself works, so only the Winsock reset decides success.
        "net" => "
netsh winsock reset
if ($LASTEXITCODE -ne 0) { throw 'Winsock reset failed.' }
netsh int ip reset
ipconfig /flushdns
$global:LASTEXITCODE = 0",
        "update" => "
$services = 'wuauserv', 'bits', 'cryptsvc'
Stop-Service -Name $services -Force -ErrorAction SilentlyContinue
try {
    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    $sd = \"$env:SystemRoot\\SoftwareDistribution\"
    $cr = \"$env:SystemRoot\\System32\\catroot2\"
    if (Test-Path $sd) { Rename-Item -Path $sd -NewName \"SoftwareDistribution.bak$stamp\" }
    if (Test-Path $cr) { Rename-Item -Path $cr -NewName \"catroot2.bak$stamp\" }
} finally {
    Start-Service -Name $services -ErrorAction SilentlyContinue
}",
        "cache" => "ie4uinit.exe -show",
        _ => return None,
    })
}

/// SFC and DISM can take half an hour on a slow disk; past this they are stopped.
const FIX_TIMEOUT: Duration = Duration::from_secs(90 * 60);
/// One repair at a time: SFC and DISM fight over the component store.
static FIX_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FixOutcome {
    /// SFC found nothing to repair.
    Clean,
    /// SFC found damage and repaired it.
    Repaired,
    /// SFC found damage it could not repair (DISM first, then SFC again).
    Unrepaired,
    /// Finished; the tool does not say more.
    Done,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FixResult {
    pub outcome: FixOutcome,
    /// Windows must restart to finish (network reset).
    pub restart: bool,
    /// Last lines the tool printed, for "Ver detalhes".
    pub details: String,
}

/// SFC writes UTF-16 when its output is redirected; everything else is 8-bit.
pub fn decode_output(bytes: &[u8]) -> String {
    let nuls = bytes.iter().filter(|b| **b == 0).count();
    if bytes.len() >= 2 && nuls * 4 > bytes.len() {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// Reads SFC's verdict, in English or Portuguese. None when the text says
/// none of these (another language, or SFC stopped early).
pub fn sfc_outcome(text: &str) -> Option<FixOutcome> {
    let t = text.to_lowercase();
    if t.contains("did not find any integrity violations") || t.contains("não encontrou nenhuma violação de integridade") {
        Some(FixOutcome::Clean)
    } else if t.contains("unable to fix some") || t.contains("não conseguiu corrigir") || t.contains("não pôde corrigir") {
        Some(FixOutcome::Unrepaired)
    } else if t.contains("successfully repaired") || t.contains("reparou com êxito") || t.contains("reparou-os com êxito") {
        Some(FixOutcome::Repaired)
    } else {
        None
    }
}

const NEEDS_ADMIN: &str = "Administrator required.";

fn needs_admin(text: &str) -> bool {
    let t = text.to_lowercase();
    t.contains("must be an administrator") || t.contains("precisa ser um administrador") || t.contains("elevated")
}

fn run_fix(id: &str) -> Result<FixResult, String> {
    let _guard = FIX_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    match id {
        "sfc" => {
            let out = run_with_timeout(&format!(r"{root}\System32\sfc.exe"), &["/scannow".to_string()], FIX_TIMEOUT)?;
            let text = decode_output(&out.stdout);
            let details = output_tail(&text, 8);
            if needs_admin(&text) {
                return Err(format!("{NEEDS_ADMIN}\n{details}"));
            }
            match sfc_outcome(&text) {
                Some(outcome) => Ok(FixResult { outcome, restart: false, details }),
                None if out.status.success() => Ok(FixResult { outcome: FixOutcome::Done, restart: false, details }),
                None => Err(format!("SFC exit code {}.\n{details}", out.status.code().unwrap_or(-1))),
            }
        }
        "dism" => {
            let args: Vec<String> = ["/Online", "/Cleanup-Image", "/RestoreHealth"].iter().map(|s| s.to_string()).collect();
            let out = run_with_timeout(&format!(r"{root}\System32\dism.exe"), &args, FIX_TIMEOUT)?;
            let details = output_tail(&decode_output(&out.stdout), 8);
            match out.status.code() {
                Some(0) => Ok(FixResult { outcome: FixOutcome::Done, restart: false, details }),
                Some(740) => Err(format!("{NEEDS_ADMIN}\n{details}")),
                code => Err(format!("DISM exit code {:#X}.\n{details}", code.unwrap_or(-1) as u32)),
            }
        }
        _ => {
            let script = fix_script(id).ok_or_else(|| format!("Unknown fix: '{id}'"))?;
            let args: Vec<String> = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]
                .iter()
                .map(|s| s.to_string())
                .chain([encode_command(&hidden_script(script))])
                .collect();
            let out = run_with_timeout("powershell", &args, Duration::from_secs(10 * 60))?;
            let details = output_tail(&String::from_utf8_lossy(&out.stdout), 8);
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                return Err(if err.is_empty() { format!("Fix failed.\n{details}") } else { err });
            }
            Ok(FixResult { outcome: FixOutcome::Done, restart: id == "net", details })
        }
    }
}

/// Runs one repair with no window and says how it went.
#[tauri::command]
pub async fn run_system_fix(id: String) -> Result<FixResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_fix(&id))
        .await
        .map_err(|e| format!("Runtime error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_fixes_page_button_has_a_script() {
        for id in ["net", "update", "cache"] {
            assert!(fix_script(id).is_some(), "missing fix {id}");
        }
        assert!(fix_script("calc").is_none());
    }

    #[test]
    fn reads_sfc_utf16_output() {
        // Real bytes from `sfc /scannow > file` on this PC, without administrator (pt-BR).
        let text = "\r\r\nVocê precisa ser um administrador executando uma sessão do console\r\npara poder usar o utilitário sfc.\r\n";
        let bytes: Vec<u8> = text.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        let decoded = decode_output(&bytes);
        assert!(decoded.contains("Você precisa ser um administrador"));
        assert!(needs_admin(&decoded));
        assert_eq!(decode_output("Erro: 740".as_bytes()), "Erro: 740");
    }

    #[test]
    fn reads_the_sfc_verdict_in_both_languages() {
        assert_eq!(sfc_outcome("Windows Resource Protection did not find any integrity violations."), Some(FixOutcome::Clean));
        assert_eq!(sfc_outcome("A Proteção de Recursos do Windows não encontrou nenhuma violação de integridade."), Some(FixOutcome::Clean));
        assert_eq!(sfc_outcome("Windows Resource Protection found corrupt files and successfully repaired them."), Some(FixOutcome::Repaired));
        assert_eq!(sfc_outcome("A Proteção de Recursos do Windows encontrou arquivos corrompidos e os reparou com êxito."), Some(FixOutcome::Repaired));
        assert_eq!(sfc_outcome("Windows Resource Protection found corrupt files but was unable to fix some of them."), Some(FixOutcome::Unrepaired));
        assert_eq!(sfc_outcome("A Proteção de Recursos do Windows encontrou arquivos corrompidos, mas não conseguiu corrigir alguns deles."), Some(FixOutcome::Unrepaired));
        assert_eq!(sfc_outcome("Verification 42% complete."), None);
    }

    #[cfg(windows)]
    #[test]
    fn system_drive_is_found() {
        let (free, total) = system_drive_space();
        assert!(total > 0, "system drive not matched by mount point");
        assert!(free <= total);
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
