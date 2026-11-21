use std::process::{Command, ExitStatus};

/// winget exit codes (HRESULTs as the signed i32 Windows reports).
pub const WINGET_NO_PACKAGE_FOUND: i32 = 0x8A150014_u32 as i32;
pub const WINGET_UPDATE_NOT_APPLICABLE: i32 = 0x8A15002B_u32 as i32;
pub const WINGET_PACKAGE_ALREADY_INSTALLED: i32 = 0x8A150061_u32 as i32;

/// Creates a Command with CREATE_NO_WINDOW so no console flashes on screen.
pub fn silent_cmd(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Quotes a value as a PowerShell single-quoted literal (no variable expansion).
pub fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// winget package ids are dotted names (Publisher.App) or Store ids (9NBLGGH4NNS1).
/// Anything else is rejected before it can reach a privileged shell.
pub fn is_valid_package_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
}

/// Builds the full script run in the visible window. The exit code is real:
/// 0 only when the script finished without an error and the last native
/// command it ran returned 0.
pub fn wrap_script(task_name: &str, script: &str) -> String {
    let title = ps_quote(&format!("Segatt Tools - {task_name}"));
    let task = ps_quote(&format!("Task: {task_name}"));
    format!(
        "$host.UI.RawUI.WindowTitle = {title}
Clear-Host
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '          SEGATT TOOLS ENGINE           ' -ForegroundColor White -BackgroundColor DarkBlue
Write-Host '========================================' -ForegroundColor Cyan
Write-Host {task} -ForegroundColor Yellow
Write-Host '----------------------------------------' -ForegroundColor DarkGray
$ErrorActionPreference = 'Stop'
$global:LASTEXITCODE = 0
$segattOk = $true
try {{
{script}
    if ($LASTEXITCODE -ne 0) {{
        $segattOk = $false
        Write-Host \"Command exited with code $LASTEXITCODE\" -ForegroundColor Red
    }}
}} catch {{
    $segattOk = $false
    Write-Host \"Error: $($_.Exception.Message)\" -ForegroundColor Red
}}
Write-Host '----------------------------------------' -ForegroundColor DarkGray
if ($segattOk) {{
    Write-Host '[OK] Completed. Closing in 3s...' -ForegroundColor Green
    Start-Sleep -Seconds 3
    exit 0
}}
Write-Host '[FAILED] See the error above. Closing in 10s...' -ForegroundColor Red
Start-Sleep -Seconds 10
exit 1
"
    )
}

/// Base64 of the UTF-16LE script, the format `powershell -EncodedCommand` expects.
/// Avoids every command-line quoting problem with quotes, braces and backslashes.
pub fn encode_command(script: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Runs a script in a visible PowerShell window so the user can follow it.
/// Blocking: call it from `spawn_blocking`, never directly in an async command.
pub fn spawn_visible_powershell(task_name: &str, script: &str) -> std::io::Result<ExitStatus> {
    Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encode_command(&wrap_script(task_name, script)),
        ])
        .status()
}

/// Runs a blocking PowerShell task off the async runtime and maps the exit code.
pub async fn run_visible_task(task_name: String, script: String) -> Result<(), String> {
    let status = tauri::async_runtime::spawn_blocking(move || {
        spawn_visible_powershell(&task_name, &script)
    })
    .await
    .map_err(|e| format!("Runtime error: {e}"))?
    .map_err(|e| format!("Failed to start PowerShell: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Task failed (exit code {}). Check the PowerShell window for details.",
            status.code().unwrap_or(-1)
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_escapes_single_quotes() {
        assert_eq!(ps_quote("a'b"), "'a''b'");
        assert_eq!(ps_quote("$env:TEMP"), "'$env:TEMP'");
    }

    #[test]
    fn package_id_rejects_shell_metacharacters() {
        assert!(is_valid_package_id("Microsoft.VisualStudioCode"));
        assert!(is_valid_package_id("9NBLGGH4NNS1"));
        assert!(is_valid_package_id("Notepad++.Notepad++"));
        assert!(!is_valid_package_id("Foo; Remove-Item C:\\ -Recurse"));
        assert!(!is_valid_package_id("Foo'Bar"));
        assert!(!is_valid_package_id("Foo$(calc)"));
        assert!(!is_valid_package_id("-Foo"));
        assert!(!is_valid_package_id(""));
    }

    #[test]
    fn encode_matches_known_base64() {
        // [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('ab'))
        assert_eq!(encode_command("ab"), "YQBiAA==");
        assert_eq!(encode_command("abc"), "YQBiAGMA");
    }

    #[cfg(windows)]
    fn run_hidden(script: &str) -> i32 {
        silent_cmd("powershell")
            .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encode_command(script)])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .expect("powershell runs")
            .code()
            .unwrap_or(-1)
    }

    /// The old wrapper always exited 0, so every failure was shown as success.
    #[cfg(windows)]
    #[test]
    fn wrapper_reports_real_failures() {
        let fast = |s: &str| wrap_script("test", s).replace("Start-Sleep -Seconds 10", "").replace("Start-Sleep -Seconds 3", "");
        assert_eq!(run_hidden(&fast("cmd /c exit 5")), 1, "native exit code must fail the task");
        assert_eq!(run_hidden(&fast("Get-Item 'C:\\does\\not\\exist'")), 1, "cmdlet error must fail the task");
        assert_eq!(run_hidden(&fast("Write-Host \"quotes 'ok' {braces}\"")), 0);
        assert_eq!(run_hidden(&fast("Remove-Item 'C:\\nope' -ErrorAction SilentlyContinue")), 0, "explicitly ignored errors stay ignored");
        assert_eq!(run_hidden(&fast("cmd /c exit 0")), 0);
    }
}
