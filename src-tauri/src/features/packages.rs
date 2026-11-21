use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::features::utils::{
    is_valid_package_id, ps_quote, run_visible_task, silent_cmd, WINGET_NO_PACKAGE_FOUND,
    WINGET_PACKAGE_ALREADY_INSTALLED, WINGET_UPDATE_NOT_APPLICABLE,
};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct PackageInfo {
    pub name: String,
    pub id: String,
    pub version: String,
    pub source: String,
}

/// Parses the table printed by `winget search`.
///
/// Column positions come from the header line above the dashes, never from its
/// words: winget translates them ("Nome", "Versão"...) and omits "Source" when
/// `--source` is given. Positions are counted in characters, not bytes, so
/// accented names cannot split a UTF-8 character.
pub fn parse_winget_table(stdout: &str) -> Vec<PackageInfo> {
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

    let cell = |row: &[char], col: usize| -> String {
        let from = starts[col].min(row.len());
        let to = starts.get(col + 1).copied().unwrap_or(row.len()).min(row.len());
        row[from..to].iter().collect::<String>().trim().to_string()
    };

    lines[sep + 1..]
        .iter()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let row: Vec<char> = line.chars().collect();
            let id = cell(&row, 1);
            is_valid_package_id(&id).then(|| PackageInfo {
                name: cell(&row, 0),
                id,
                version: cell(&row, 2),
                source: "winget".to_string(),
            })
        })
        .collect()
}

#[tauri::command]
pub async fn search_packages(query: String) -> Result<Vec<PackageInfo>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let output = tauri::async_runtime::spawn_blocking(move || {
        silent_cmd("winget")
            .args([
                "search", "--query", &query, "--source", "winget",
                "--accept-source-agreements", "--disable-interactivity",
            ])
            .output()
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))?
    .map_err(|e| format!("Failed to run WinGet: {e}"))?;

    if output.status.code() == Some(WINGET_NO_PACKAGE_FOUND) {
        return Ok(Vec::new());
    }
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "WinGet search failed (code {}). {detail}",
            output.status.code().unwrap_or(-1)
        ));
    }

    Ok(parse_winget_table(&String::from_utf8_lossy(&output.stdout)))
}

fn install_script(package_id: &str) -> String {
    format!(
        "winget install --id {id} --exact --accept-source-agreements --accept-package-agreements --disable-interactivity
if ($LASTEXITCODE -eq {already} -or $LASTEXITCODE -eq {no_update}) {{
    Write-Host 'Already installed and up to date.' -ForegroundColor Green
    $global:LASTEXITCODE = 0
}}",
        id = ps_quote(package_id),
        already = WINGET_PACKAGE_ALREADY_INSTALLED,
        no_update = WINGET_UPDATE_NOT_APPLICABLE,
    )
}

fn uninstall_script(package_id: &str) -> String {
    format!(
        "winget uninstall --id {id} --exact --accept-source-agreements --disable-interactivity
if ($LASTEXITCODE -eq {not_found}) {{
    Write-Host 'Not installed. Nothing to remove.' -ForegroundColor Green
    $global:LASTEXITCODE = 0
}}",
        id = ps_quote(package_id),
        not_found = WINGET_NO_PACKAGE_FOUND,
    )
}

fn check_id(package_id: &str) -> Result<(), String> {
    if is_valid_package_id(package_id) {
        Ok(())
    } else {
        Err(format!("Invalid package id: '{package_id}'"))
    }
}

#[tauri::command]
pub async fn install_package_stream(app: AppHandle, package_id: String) -> Result<(), String> {
    check_id(&package_id)?;
    let _ = app.emit("winget-output", format!("Installing {package_id}..."));
    run_visible_task(format!("Installing {package_id}"), install_script(&package_id)).await?;
    let _ = app.emit("winget-output", format!("Done: {package_id}"));
    Ok(())
}

#[tauri::command]
pub async fn uninstall_package_stream(app: AppHandle, package_id: String) -> Result<(), String> {
    check_id(&package_id)?;
    let _ = app.emit("winget-output", format!("Uninstalling {package_id}..."));
    run_visible_task(format!("Uninstalling {package_id}"), uninstall_script(&package_id)).await?;
    let _ = app.emit("winget-output", format!("Removed: {package_id}"));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real output captured from `winget search vscode --source winget` (no Source column).
    const EN: &str = "   - \r   \\ \rName                                      Id                                        Version      Match
-----------------------------------------------------------------------------------------------------------------------------------
Microsoft Visual Studio Code              Microsoft.VisualStudioCode                1.146.0      Moniker: vscode
Codium                                    Alex313031.Codium                         1.93.1.24277 Tag: vscode
";

    #[test]
    fn parses_output_without_source_column() {
        let pkgs = parse_winget_table(EN);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].name, "Microsoft Visual Studio Code");
        assert_eq!(pkgs[0].id, "Microsoft.VisualStudioCode");
        assert_eq!(pkgs[0].version, "1.146.0");
        assert_eq!(pkgs[1].version, "1.93.1.24277");
    }

    #[test]
    fn parses_translated_headers_and_accents() {
        let pt = "Nome                 ID                      Versão   Origem
------------------------------------------------------------------
Navegador Ação Ç     Foo.Navegador           2.0.1    winget
Ünïcödé Tool         Bar.Unicode-Tool        1.0      winget
";
        let pkgs = parse_winget_table(pt);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].name, "Navegador Ação Ç");
        assert_eq!(pkgs[0].id, "Foo.Navegador");
        assert_eq!(pkgs[1].id, "Bar.Unicode-Tool");
        assert_eq!(pkgs[1].version, "1.0");
    }

    #[test]
    fn ignores_garbage_and_short_lines() {
        assert!(parse_winget_table("").is_empty());
        assert!(parse_winget_table("No package found matching input criteria.").is_empty());
        let short = "Name   Id     Version\n---------------------\nX\n";
        assert!(parse_winget_table(short).is_empty());
    }

    #[test]
    fn scripts_quote_the_id() {
        assert!(install_script("Notepad++.Notepad++").contains("--id 'Notepad++.Notepad++' --exact"));
        assert!(uninstall_script("Foo.Bar").contains("--id 'Foo.Bar' --exact"));
        assert!(check_id("Foo; calc").is_err());
    }
}
