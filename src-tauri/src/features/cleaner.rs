use serde::{Deserialize, Serialize};

use crate::features::utils::run_visible_task;

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanupResult {
    pub task_id: String,
    pub success: bool,
    pub message: String,
}

// Scripts run with $ErrorActionPreference = 'Stop'. Files in use are expected,
// so every delete opts out with -ErrorAction SilentlyContinue; anything else
// that fails ends the task as a real failure.

/// (task name, script) for each cleanup id, or None for an unknown id.
fn cleanup_script(id: &str) -> Option<(&'static str, &'static str)> {
    Some(match id {
        "clean_temp" => ("Clean Temp Files", "
$paths = @($env:TEMP, \"$env:SystemRoot\\Temp\") | Select-Object -Unique
foreach ($path in $paths) {
    if (Test-Path $path) {
        Remove-Item -Path (Join-Path $path '*') -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host \"Cleaned $path\"
    }
}"),

        "clean_prefetch" => ("Clean Prefetch",
            "Remove-Item -Path \"$env:SystemRoot\\Prefetch\\*\" -Force -ErrorAction SilentlyContinue"),

        "flush_dns" => ("Flush DNS", "ipconfig /flushdns"),

        "clean_windows_update" => ("Clean Windows Update Download Cache", "
Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
try {
    Remove-Item -Path \"$env:SystemRoot\\SoftwareDistribution\\Download\\*\" -Recurse -Force -ErrorAction SilentlyContinue
} finally {
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue
}"),

        "clean_shader_cache" => ("Clean Shader Cache", "
$caches = @(
    \"$env:LOCALAPPDATA\\NVIDIA\\DXCache\",
    \"$env:LOCALAPPDATA\\NVIDIA\\GLCache\",
    \"$env:LOCALAPPDATA\\Temp\\NVIDIA Corporation\\NV_Cache\",
    \"$env:LOCALAPPDATA\\AMD\\DxCache\",
    \"$env:LOCALAPPDATA\\D3DSCache\"
)
foreach ($c in $caches) {
    if (Test-Path $c) {
        Remove-Item -Path (Join-Path $c '*') -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host \"Cleaned $c\"
    }
}"),

        "clean_recycle_bin" => ("Clean Recycle Bin",
            "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"),

        // Windows.old is owned by TrustedInstaller; a plain Remove-Item only
        // deleted what it could and reported success.
        "clean_windows_old" => ("Clean Windows.old", "
$old = \"$env:SystemDrive\\Windows.old\"
if (-not (Test-Path $old)) {
    Write-Host 'Windows.old not found. Nothing to clean.'
} else {
    & takeown.exe /F $old /R /A /D Y | Out-Null
    & icacls.exe $old /grant '*S-1-5-32-544:F' /T /C /Q | Out-Null
    Remove-Item -Path $old -Recurse -Force -ErrorAction SilentlyContinue
    $global:LASTEXITCODE = 0
    if (Test-Path $old) { throw 'Some files in Windows.old could not be removed. Use Disk Cleanup > Previous Windows installations.' }
}"),

        "clean_delivery_optimization" => ("Clean Delivery Optimization Cache", "
if (Get-Command Delete-DeliveryOptimizationCache -ErrorAction SilentlyContinue) {
    Delete-DeliveryOptimizationCache -Force
} else {
    Stop-Service -Name DoSvc -Force -ErrorAction SilentlyContinue
    try {
        Remove-Item -Path \"$env:SystemRoot\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache\\*\" -Recurse -Force -ErrorAction SilentlyContinue
    } finally {
        Start-Service -Name DoSvc -ErrorAction SilentlyContinue
    }
}"),

        "clean_thumbnails" => ("Clean Thumbnail Cache",
            "Remove-Item -Path \"$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db\" -Force -ErrorAction SilentlyContinue"),

        // Was every *.log under C:\Windows, recursively. Now only crash dumps and
        // log files older than 7 days in the Windows log folders.
        "clean_logs_minidumps" => ("Clean Logs & Minidumps", "
Remove-Item -Path \"$env:SystemRoot\\Minidump\\*.dmp\" -Force -ErrorAction SilentlyContinue
Remove-Item -Path \"$env:SystemRoot\\MEMORY.DMP\" -Force -ErrorAction SilentlyContinue
$cutoff = (Get-Date).AddDays(-7)
foreach ($dir in @(\"$env:SystemRoot\\Logs\", \"$env:SystemRoot\\Panther\")) {
    if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Filter *.log -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object LastWriteTime -lt $cutoff |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
}"),

        _ => return None,
    })
}

#[tauri::command]
pub async fn run_cleanup(id: String) -> Result<CleanupResult, String> {
    let (task_name, script) = cleanup_script(&id).ok_or_else(|| format!("Unknown cleanup task: '{id}'"))?;
    run_visible_task(task_name.into(), script.into()).await?;
    Ok(CleanupResult {
        task_id: id,
        success: true,
        message: "Task completed successfully.".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_ids_are_known() {
        for id in [
            "clean_temp", "clean_prefetch", "flush_dns", "clean_windows_update", "clean_shader_cache",
            "clean_recycle_bin", "clean_windows_old", "clean_delivery_optimization", "clean_thumbnails",
            "clean_logs_minidumps",
        ] {
            assert!(cleanup_script(id).is_some(), "missing cleanup {id}");
        }
    }

    #[test]
    fn logs_cleanup_is_scoped() {
        let (_, s) = cleanup_script("clean_logs_minidumps").unwrap();
        assert!(!s.contains("-Path 'C:\\\\Windows' -Filter *.log"));
        assert!(s.contains("AddDays(-7)"));
    }
}
