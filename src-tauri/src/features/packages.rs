//! winget integration: search, list what is installed (with available
//! updates), and install / upgrade / uninstall without a console window.

use serde::{Deserialize, Serialize};

use crate::features::utils::{
    is_valid_package_id, silent_cmd, WINGET_NO_PACKAGE_FOUND, WINGET_PACKAGE_ALREADY_INSTALLED,
    WINGET_UPDATE_NOT_APPLICABLE,
};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct PackageInfo {
    pub name: String,
    pub id: String,
    pub version: String,
    pub source: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct InstalledApp {
    pub name: String,
    pub id: String,
    pub version: String,
    /// Newer version winget can install, when there is one.
    pub available: Option<String>,
}

/// Rows of the first table winget prints, split into cells.
///
/// Column positions come from the header line above the dashes, never from its
/// words: winget translates them ("Nome", "Versão"...) and omits "Source" when
/// `--source` is given. Positions are counted in characters, not bytes, so
/// accented names cannot split a UTF-8 character. Rows whose id is not a valid
/// winget id (ARP\..., MSIX\..., footers) are dropped.
pub fn parse_table(stdout: &str) -> Vec<Vec<String>> {
    // winget redraws its spinner with '\r'; keep only what is left after the last one.
    let lines: Vec<&str> = stdout.lines().map(|l| l.rsplit('\r').next().unwrap_or(l)).collect();
    let Some(sep) = lines.iter().position(|l| l.trim_start().starts_with("---")) else {
        return Vec::new();
    };
    let Some(header) = sep.checked_sub(1).map(|i| lines[i]) else {
        return Vec::new();
    };

    let header: Vec<char> = header.chars().collect();
    let starts: Vec<usize> = (0..header.len())
        .filter(|&i| header[i] != ' ' && (i == 0 || header[i - 1] == ' '))
        .collect();
    if starts.len() < 3 {
        return Vec::new();
    }

    lines[sep + 1..]
        .iter()
        // The table ends at the first blank line (winget may print more below).
        .take_while(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let row: Vec<char> = line.chars().collect();
            let cells: Vec<String> = (0..starts.len())
                .map(|col| {
                    let from = starts[col].min(row.len());
                    let to = starts.get(col + 1).copied().unwrap_or(row.len()).min(row.len());
                    row[from..to].iter().collect::<String>().trim().to_string()
                })
                .collect();
            is_valid_package_id(&cells[1]).then_some(cells)
        })
        .collect()
}

pub fn parse_search(stdout: &str) -> Vec<PackageInfo> {
    parse_table(stdout)
        .into_iter()
        .map(|c| PackageInfo { name: c[0].clone(), id: c[1].clone(), version: c[2].clone(), source: "winget".into() })
        .collect()
}

/// `winget list --source winget`: Name, Id, Version and, when any update
/// exists, an Available column. Keeps the first row per id.
pub fn parse_installed(stdout: &str) -> Vec<InstalledApp> {
    let mut seen = std::collections::HashSet::new();
    parse_table(stdout)
        .into_iter()
        .filter(|c| seen.insert(c[1].to_lowercase()))
        .map(|c| InstalledApp {
            name: c[0].clone(),
            id: c[1].clone(),
            version: c[2].clone(),
            available: c.get(3).filter(|v| !v.is_empty()).cloned(),
        })
        .collect()
}

fn winget(args: &[&str]) -> Result<std::process::Output, String> {
    silent_cmd("winget").args(args).output().map_err(|e| format!("Failed to run WinGet: {e}"))
}

/// Longest an install, update or removal may run before it is stopped.
pub const ACTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20 * 60);

/// How long to wait for output after the process exits.
const PIPE_GRACE: std::time::Duration = std::time::Duration::from_secs(3);

/// Runs a program with no window and a deadline. Output pipes are drained on
/// their own threads so a chatty process cannot block on a full pipe.
pub fn run_with_timeout(program: &str, args: &[String], limit: std::time::Duration) -> Result<std::process::Output, String> {
    use std::io::Read;
    use std::process::Stdio;
    let mut child = silent_cmd(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run {program}: {e}"))?;
    // Each reader sends what it read when its pipe closes. A process the
    // installer started (an app that opens when setup ends) can inherit the
    // pipe and keep it open, so after exit we wait only PIPE_GRACE for it.
    // Output is kept as it arrives, so it survives a pipe that never closes.
    type Drained = (std::sync::Arc<std::sync::Mutex<Vec<u8>>>, std::sync::mpsc::Receiver<()>);
    let drain = |pipe: Option<Box<dyn Read + Send>>| -> Drained {
        let buf = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let (tx, rx) = std::sync::mpsc::channel();
        let sink = buf.clone();
        std::thread::spawn(move || {
            if let Some(mut p) = pipe {
                let mut chunk = [0u8; 4096];
                while let Ok(n) = p.read(&mut chunk) {
                    if n == 0 {
                        break;
                    }
                    sink.lock().map(|mut b| b.extend_from_slice(&chunk[..n])).ok();
                }
            }
            let _ = tx.send(());
        });
        (buf, rx)
    };
    let out = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let deadline = std::time::Instant::now() + limit;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if std::time::Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Stopped after {} minutes without finishing. The installer it started may still be running.",
                    limit.as_secs() / 60
                ));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(300)),
            Err(e) => return Err(format!("Failed to wait for {program}: {e}")),
        }
    };
    let collect = |(buf, done): Drained| {
        let _ = done.recv_timeout(PIPE_GRACE);
        let out = buf.lock().map(|b| b.clone()).unwrap_or_default();
        out
    };
    Ok(std::process::Output { status, stdout: collect(out), stderr: collect(err) })
}

#[tauri::command]
pub async fn search_packages(query: String) -> Result<Vec<PackageInfo>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let output = tauri::async_runtime::spawn_blocking(move || {
        winget(&["search", "--query", &query, "--source", "winget", "--accept-source-agreements", "--disable-interactivity"])
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))??;

    if output.status.code() == Some(WINGET_NO_PACKAGE_FOUND) {
        return Ok(Vec::new());
    }
    if !output.status.success() {
        let tail = output_tail(&String::from_utf8_lossy(&output.stdout), 4);
        return Err(format!("WinGet search failed (code {:#X}).
{tail}", output.status.code().unwrap_or(-1) as u32));
    }
    Ok(parse_search(&String::from_utf8_lossy(&output.stdout)))
}

#[tauri::command]
pub async fn list_installed() -> Result<Vec<InstalledApp>, String> {
    let output = tauri::async_runtime::spawn_blocking(|| {
        winget(&["list", "--source", "winget", "--accept-source-agreements", "--disable-interactivity"])
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))??;

    if output.status.code() == Some(WINGET_NO_PACKAGE_FOUND) {
        return Ok(Vec::new());
    }
    if !output.status.success() {
        return Err(format!("WinGet list failed (code {}).", output.status.code().unwrap_or(-1)));
    }
    Ok(parse_installed(&String::from_utf8_lossy(&output.stdout)))
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AppAction {
    Install,
    Upgrade,
    Uninstall,
}

/// winget arguments for an action, and the exit codes that mean "already done".
pub fn action_args(action: AppAction, id: &str) -> (Vec<String>, Vec<i32>) {
    let mut args: Vec<String> = match action {
        AppAction::Install => vec!["install".into()],
        AppAction::Upgrade => vec!["upgrade".into()],
        AppAction::Uninstall => vec!["uninstall".into()],
    };
    args.extend(["--id".into(), id.into(), "--exact".into(), "--accept-source-agreements".into(), "--disable-interactivity".into()]);
    if action != AppAction::Uninstall {
        args.extend(["--accept-package-agreements".into(), "--silent".into()]);
    }
    let done = match action {
        AppAction::Install => vec![WINGET_PACKAGE_ALREADY_INSTALLED, WINGET_UPDATE_NOT_APPLICABLE],
        // UPDATE_NOT_APPLICABLE is not success here: nothing was updated.
        AppAction::Upgrade => vec![],
        AppAction::Uninstall => vec![WINGET_NO_PACKAGE_FOUND],
    };
    (args, done)
}

/// Last lines of winget output without its spinner/progress noise, for "details".
pub fn output_tail(stdout: &str, lines: usize) -> String {
    let clean: Vec<&str> = stdout
        .lines()
        .map(|l| l.rsplit('\r').next().unwrap_or(l).trim())
        .filter(|l| !l.is_empty() && !l.chars().all(|c| matches!(c, '-' | '\\' | '|' | '/' | ' ' | '█' | '▒')))
        .collect();
    clean[clean.len().saturating_sub(lines)..].join("\n")
}

/// Installs, upgrades or removes one app with no window. On failure the error
/// carries winget's exit code and the last lines it printed.
#[tauri::command]
pub async fn run_app_action(id: String, action: AppAction) -> Result<(), String> {
    if !is_valid_package_id(&id) {
        return Err(format!("Invalid package id: '{id}'"));
    }
    let (args, done) = action_args(action, &id);
    let output = tauri::async_runtime::spawn_blocking(move || run_with_timeout("winget", &args, ACTION_TIMEOUT))
    .await
    .map_err(|e| format!("Runtime error: {e}"))??;

    let code = output.status.code().unwrap_or(-1);
    if output.status.success() || done.contains(&code) {
        return Ok(());
    }
    let tail = output_tail(&String::from_utf8_lossy(&output.stdout), 6);
    Err(format!("winget exit code {code:#X}.\n{tail}", code = code as u32))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real output captured from `winget search vscode --source winget` (no Source column).
    const SEARCH: &str = "   - \r   \\ \rName                                      Id                                        Version      Match
-----------------------------------------------------------------------------------------------------------------------------------
Microsoft Visual Studio Code              Microsoft.VisualStudioCode                1.146.0      Moniker: vscode
Codium                                    Alex313031.Codium                         1.93.1.24277 Tag: vscode
";

    // Real output shape from `winget list --source winget`.
    const LIST: &str = r"Name                       Id                              Version         Available
-------------------------------------------------------------------------------------
AIDA64 Extreme v8.35       FinalWire.AIDA64.Extreme        8.35            8.40
App Installer              Microsoft.AppInstaller          1.29.380.0
WindowsAppRuntime.2        Microsoft.WindowsAppRuntime.2   2.7.0.0
WindowsAppRuntime.2        Microsoft.WindowsAppRuntime.2   2.6.5.0
Old app                    ARP\Machine\X64\Foo             1.0
";

    #[test]
    fn parses_search_without_source_column() {
        let pkgs = parse_search(SEARCH);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].name, "Microsoft Visual Studio Code");
        assert_eq!(pkgs[0].id, "Microsoft.VisualStudioCode");
        assert_eq!(pkgs[1].version, "1.93.1.24277");
    }

    #[test]
    fn parses_translated_headers_and_accents() {
        let pt = "Nome                 ID                      Versão   Origem
------------------------------------------------------------------
Navegador Ação Ç     Foo.Navegador           2.0.1    winget
";
        let pkgs = parse_search(pt);
        assert_eq!(pkgs[0].name, "Navegador Ação Ç");
        assert_eq!(pkgs[0].id, "Foo.Navegador");
    }

    #[test]
    fn installed_list_reads_available_updates_and_skips_noise() {
        let apps = parse_installed(LIST);
        // ARP entries are dropped and the duplicated runtime is kept once.
        assert_eq!(apps.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), vec!["FinalWire.AIDA64.Extreme", "Microsoft.AppInstaller", "Microsoft.WindowsAppRuntime.2"], "{apps:?}");
        assert_eq!(apps[0].available.as_deref(), Some("8.40"));
        assert_eq!(apps[1].available, None);
        assert_eq!(apps[2].version, "2.7.0.0");
    }

    #[test]
    fn table_stops_at_first_blank_line() {
        let two = "Name   Id        Version Available\n----------------------------------\nA      Foo.A     1.0     1.1\n\nThe following packages require explicit targeting:\nName   Id        Version Available\n----------------------------------\nB      Foo.B     1.0     2.0\n";
        let apps = parse_installed(two);
        assert_eq!(apps.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), vec!["Foo.A"]);
    }

    /// Manual check against this PC (read-only): cargo test print_installed -- --ignored --nocapture
    #[test]
    #[ignore]
    fn print_installed() {
        let out = winget(&["list", "--source", "winget", "--accept-source-agreements", "--disable-interactivity"]).unwrap();
        let apps = parse_installed(&String::from_utf8_lossy(&out.stdout));
        let updates = apps.iter().filter(|a| a.available.is_some()).count();
        println!("INSTALLED={} UPDATES={}", apps.len(), updates);
        for a in apps.iter().filter(|a| a.available.is_some()).take(4) {
            println!("  {} {} -> {:?}", a.id, a.version, a.available);
        }
    }

    /// Real installed list and a real search as JSON, for UI checks outside Tauri (read-only):
    /// cargo test dump_apps_json -- --ignored --nocapture
    #[test]
    #[ignore]
    fn dump_apps_json() {
        let out = winget(&["list", "--source", "winget", "--accept-source-agreements", "--disable-interactivity"]).unwrap();
        println!("INSTALLED_JSON={}", serde_json::to_string(&parse_installed(&String::from_utf8_lossy(&out.stdout))).unwrap());
        let out = winget(&["search", "--query", "obsidian", "--source", "winget", "--accept-source-agreements", "--disable-interactivity"]).unwrap();
        println!("SEARCH_JSON={}", serde_json::to_string(&parse_search(&String::from_utf8_lossy(&out.stdout))).unwrap());
    }

    #[test]
    fn ignores_garbage() {
        assert!(parse_search("").is_empty());
        assert!(parse_search("No package found matching input criteria.").is_empty());
    }

    #[test]
    fn action_args_are_exact_and_silent() {
        let (args, done) = action_args(AppAction::Install, "Valve.Steam");
        assert_eq!(&args[..4], ["install", "--id", "Valve.Steam", "--exact"]);
        assert!(args.contains(&"--silent".to_string()));
        assert!(done.contains(&WINGET_PACKAGE_ALREADY_INSTALLED));
        let (args, done) = action_args(AppAction::Uninstall, "Valve.Steam");
        assert_eq!(args[0], "uninstall");
        assert!(!args.contains(&"--accept-package-agreements".to_string()));
        assert_eq!(done, vec![WINGET_NO_PACKAGE_FOUND]);
        let (_, done) = action_args(AppAction::Upgrade, "Valve.Steam");
        assert!(done.is_empty(), "an update winget cannot apply is not a success");
    }

    #[cfg(windows)]
    #[test]
    fn run_with_timeout_stops_a_hung_process_and_keeps_output() {
        let slow = run_with_timeout("powershell", &["-NoProfile".into(), "-Command".into(), "Start-Sleep 5".into()], std::time::Duration::from_millis(800));
        assert!(slow.unwrap_err().contains("Stopped after"));
        let ok = run_with_timeout("cmd", &["/c".into(), "echo hello".into()], std::time::Duration::from_secs(10)).unwrap();
        assert!(ok.status.success());
        assert!(String::from_utf8_lossy(&ok.stdout).contains("hello"));
    }

    #[cfg(windows)]
    #[test]
    fn run_with_timeout_returns_when_a_child_keeps_the_pipe_open() {
        // cmd exits at once; the powershell it starts inherits stdout and lives on.
        let started = std::time::Instant::now();
        let out = run_with_timeout("cmd", &["/c".into(), "echo started & start /b powershell -NoProfile -Command Start-Sleep 15".into()], std::time::Duration::from_secs(60)).unwrap();
        assert!(started.elapsed() < std::time::Duration::from_secs(10), "{:?}", started.elapsed());
        assert!(String::from_utf8_lossy(&out.stdout).contains("started"));
    }

    #[test]
    fn output_tail_drops_progress_noise() {
        let out = "   - \r   \\ \rFound Steam [Valve.Steam]\n  ██████████▒▒▒  2 MB / 5 MB\r\nInstaller failed with exit code: 1603\n";
        let tail = output_tail(out, 6);
        assert!(tail.contains("Found Steam"));
        assert!(tail.contains("1603"));
        assert!(!tail.contains("   - "));
    }
}
