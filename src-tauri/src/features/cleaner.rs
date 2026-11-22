use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use crate::features::utils::run_hidden_powershell;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub task_id: String,
    /// Bytes gone after the run; None for tasks that free no files (DNS).
    pub freed: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSize {
    pub id: String,
    /// What the task would remove now; None when it removes no files.
    pub bytes: Option<u64>,
}

/// Which files under a folder a cleanup removes. Mirrors the scripts below,
/// so the size shown before is the size the script goes after.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Pick {
    /// Everything, in subfolders too.
    All,
    /// Files directly in the folder.
    Files,
    /// Files with this extension directly in the folder.
    Ext(&'static str),
    /// Files directly in the folder whose name starts with this and ends in ".db".
    DbPrefix(&'static str),
    /// One file by name.
    Named(&'static str),
    /// Files with this extension, in subfolders too, older than this many days.
    OldExt(&'static str, u64),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub root: PathBuf,
    pub pick: Pick,
}

/// The folders each cleanup empties, from the same environment the scripts use.
pub fn targets(id: &str, env: &dyn Fn(&str) -> Option<String>) -> Option<Vec<Target>> {
    let dir = |var: &str, rest: &str| env(var).map(|v| Path::new(&v).join(rest));
    let t = |root: Option<PathBuf>, pick: Pick| root.map(|root| Target { root, pick });
    let list: Vec<Option<Target>> = match id {
        "clean_temp" => vec![t(dir("TEMP", ""), Pick::All), t(dir("SystemRoot", "Temp"), Pick::All)],
        "clean_prefetch" => vec![t(dir("SystemRoot", "Prefetch"), Pick::Files)],
        "clean_windows_update" => vec![t(dir("SystemRoot", r"SoftwareDistribution\Download"), Pick::All)],
        "clean_shader_cache" => [r"NVIDIA\DXCache", r"NVIDIA\GLCache", r"Temp\NVIDIA Corporation\NV_Cache", r"AMD\DxCache", "D3DSCache"]
            .iter()
            .map(|rest| t(dir("LOCALAPPDATA", rest), Pick::All))
            .collect(),
        "clean_recycle_bin" => ('A'..='Z')
            .map(|d| PathBuf::from(format!("{d}:\\$Recycle.Bin")))
            .filter(|p| p.exists())
            .map(|root| Some(Target { root, pick: Pick::All }))
            .collect(),
        "clean_windows_old" => vec![t(dir("SystemDrive", r"\Windows.old"), Pick::All)],
        "clean_delivery_optimization" => vec![t(
            dir("SystemRoot", r"ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache"),
            Pick::All,
        )],
        "clean_thumbnails" => vec![t(dir("LOCALAPPDATA", r"Microsoft\Windows\Explorer"), Pick::DbPrefix("thumbcache_"))],
        "clean_logs_minidumps" => vec![
            t(dir("SystemRoot", "Minidump"), Pick::Ext("dmp")),
            t(dir("SystemRoot", ""), Pick::Named("MEMORY.DMP")),
            t(dir("SystemRoot", "Logs"), Pick::OldExt("log", 7)),
            t(dir("SystemRoot", "Panther"), Pick::OldExt("log", 7)),
        ],
        _ => return None,
    };
    Some(list.into_iter().flatten().collect())
}

fn has_ext(path: &Path, ext: &str) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case(ext))
}

/// Bytes a target would free. Unreadable folders count as empty, and links
/// (symlinks and junctions) are never followed, like `rd /s /q`.
pub fn size_of(target: &Target, now: SystemTime) -> u64 {
    fn walk(dir: &Path, pick: Pick, deep: bool, now: SystemTime) -> u64 {
        let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
        let mut total = 0;
        for entry in entries.flatten() {
            let Ok(meta) = entry.path().symlink_metadata() else { continue };
            if meta.file_type().is_symlink() {
                continue;
            }
            let path = entry.path();
            if meta.is_dir() {
                if deep {
                    total += walk(&path, pick, deep, now);
                }
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let take = match pick {
                Pick::All | Pick::Files => true,
                Pick::Ext(ext) => has_ext(&path, ext),
                Pick::DbPrefix(prefix) => name.starts_with(prefix) && has_ext(&path, "db"),
                Pick::Named(n) => name == n.to_lowercase(),
                Pick::OldExt(ext, days) => {
                    has_ext(&path, ext)
                        && meta.modified().ok().and_then(|m| now.duration_since(m).ok()).is_some_and(|age| age > Duration::from_secs(days * 86_400))
                }
            };
            if take {
                total += meta.len();
            }
        }
        total
    }
    let deep = matches!(target.pick, Pick::All | Pick::OldExt(..));
    walk(&target.root, target.pick, deep, now)
}

fn system_env(var: &str) -> Option<String> {
    std::env::var(var).ok().filter(|v| !v.is_empty())
}

/// What a cleanup would free right now, or None when it frees no files.
fn measure(id: &str) -> Option<u64> {
    let now = SystemTime::now();
    targets(id, &system_env).map(|list| list.iter().map(|t| size_of(t, now)).sum())
}

const IDS: [&str; 10] = [
    "clean_temp", "clean_prefetch", "flush_dns", "clean_windows_update", "clean_shader_cache",
    "clean_recycle_bin", "clean_windows_old", "clean_delivery_optimization", "clean_thumbnails",
    "clean_logs_minidumps",
];

/// Sizes of every cleanup, measured side by side (Windows.old can take a while).
#[tauri::command]
pub async fn scan_cleanup() -> Result<Vec<CleanupSize>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        std::thread::scope(|s| {
            let jobs: Vec<_> = IDS.iter().map(|id| (id, s.spawn(move || measure(id)))).collect();
            jobs.into_iter()
                .map(|(id, job)| CleanupSize { id: id.to_string(), bytes: job.join().unwrap_or(None) })
                .collect()
        })
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))
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
        // deleted what it could and reported success. `rd /s /q` is used because
        // old profiles contain junctions to live folders, and Windows PowerShell
        // 5.1 Remove-Item -Recurse follows junctions; rd removes the link only.
        "clean_windows_old" => ("Clean Windows.old", "
$old = \"$env:SystemDrive\\Windows.old\"
if (-not (Test-Path $old)) {
    Write-Host 'Windows.old not found. Nothing to clean.'
} else {
    & takeown.exe /F $old /R /A /D Y | Out-Null
    & icacls.exe $old /grant '*S-1-5-32-544:F' /T /C /Q | Out-Null
    & cmd.exe /c rd /s /q $old
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

/// Runs one cleanup with no window and reports what it really freed
/// (measured before and after; files in use stay and are not counted).
#[tauri::command]
pub async fn run_cleanup(id: String) -> Result<CleanupResult, String> {
    let (_, script) = cleanup_script(&id).ok_or_else(|| format!("Unknown cleanup task: '{id}'"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let before = measure(&id);
        run_hidden_powershell(script)?;
        let freed = before.map(|b| b.saturating_sub(measure(&id).unwrap_or(0)));
        Ok(CleanupResult { task_id: id, freed })
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_ids_are_known() {
        for id in IDS {
            assert!(cleanup_script(id).is_some(), "missing cleanup {id}");
            // Every task that deletes files says where, so its size can be shown.
            assert_eq!(targets(id, &system_env).is_none(), id == "flush_dns", "{id}");
        }
    }

    fn fake_env(var: &str) -> Option<String> {
        match var {
            "TEMP" => Some(r"C:\Users\x\AppData\Local\Temp".into()),
            "SystemRoot" => Some(r"C:\Windows".into()),
            "LOCALAPPDATA" => Some(r"C:\Users\x\AppData\Local".into()),
            "SystemDrive" => Some("C:".into()),
            _ => None,
        }
    }

    #[test]
    fn targets_match_the_scripts() {
        let wu = targets("clean_windows_update", &fake_env).unwrap();
        assert_eq!(wu, vec![Target { root: PathBuf::from(r"C:\Windows\SoftwareDistribution\Download"), pick: Pick::All }]);
        let old = targets("clean_windows_old", &fake_env).unwrap();
        assert_eq!(old[0].root, PathBuf::from(r"C:\Windows.old"));
        let thumbs = targets("clean_thumbnails", &fake_env).unwrap();
        assert_eq!(thumbs[0].pick, Pick::DbPrefix("thumbcache_"));
        // A missing variable drops that folder instead of measuring the wrong place.
        assert!(targets("clean_temp", &|v| (v == "SystemRoot").then(|| r"C:\Windows".into())).unwrap().len() == 1);
    }

    #[test]
    fn sizes_count_only_what_the_script_removes() {
        let root = std::env::temp_dir().join(format!("segatt-clean-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("sub")).unwrap();
        let write = |name: &str, len: usize| std::fs::write(root.join(name), vec![0u8; len]).unwrap();
        write("a.log", 100);
        write("b.txt", 10);
        write("thumbcache_32.db", 7);
        write("iconcache_32.db", 5);
        write(r"sub\c.log", 1000);
        let old = SystemTime::now() + Duration::from_secs(30 * 86_400);
        let t = |pick| Target { root: root.clone(), pick };

        assert_eq!(size_of(&t(Pick::All), old), 1122);
        assert_eq!(size_of(&t(Pick::Files), old), 122, "no subfolders");
        assert_eq!(size_of(&t(Pick::Ext("log")), old), 100);
        assert_eq!(size_of(&t(Pick::DbPrefix("thumbcache_")), old), 7);
        assert_eq!(size_of(&t(Pick::Named("B.TXT")), old), 10);
        // Measured "30 days from now", every .log is old; measured now, none is.
        assert_eq!(size_of(&t(Pick::OldExt("log", 7)), old), 1100);
        assert_eq!(size_of(&t(Pick::OldExt("log", 7)), SystemTime::now()), 0);
        assert_eq!(size_of(&Target { root: root.join("missing"), pick: Pick::All }, old), 0);
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// Prints what each cleanup would free on this PC (no deletion).
    #[test]
    #[ignore]
    fn dump_cleanup_sizes() {
        for id in IDS {
            println!("{id}: {:?}", measure(id));
        }
    }

    #[test]
    fn windows_old_is_not_deleted_with_remove_item() {
        let (_, s) = cleanup_script("clean_windows_old").unwrap();
        assert!(s.contains("rd /s /q"));
        assert!(!s.contains("Remove-Item"), "Remove-Item -Recurse follows junctions in PS 5.1");
    }

    #[test]
    fn logs_cleanup_is_scoped() {
        let (_, s) = cleanup_script("clean_logs_minidumps").unwrap();
        assert!(!s.contains("-Path 'C:\\\\Windows' -Filter *.log"));
        assert!(s.contains("AddDays(-7)"));
    }
}
