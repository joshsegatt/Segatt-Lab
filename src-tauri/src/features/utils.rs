use std::process::Command;

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

/// Runs a script with no window and returns its standard output. Any error or
/// non-zero native exit code fails.
/// Blocking: call it from a blocking thread.
pub fn run_hidden_powershell(script: &str) -> Result<String, String> {
    let wrapped = hidden_script(script);
    let output = silent_cmd("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encode_command(&wrapped)])
        .output()
        .map_err(|e| format!("Failed to start PowerShell: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() { "PowerShell task failed.".to_string() } else { stderr })
    }
}

/// The honest wrapper used by hidden scripts: stop on any error, fail on a
/// non-zero native exit code, error text on stderr.
pub fn hidden_script(script: &str) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$global:LASTEXITCODE = 0
try {{
{script}
    if ($LASTEXITCODE -ne 0) {{ [Console]::Error.WriteLine(\"exit code $LASTEXITCODE\"); exit 1 }}
}} catch {{
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}}
exit 0
"
    )
}

/// Runs a program with no window and returns stdout, or stderr/stdout on failure.
pub fn run_hidden(program: &str, args: &[&str]) -> Result<String, String> {
    let output = silent_cmd(program)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to start {program}: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("{program} failed: {}", if stderr.is_empty() { &stdout } else { &stderr }))
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

    /// The first wrapper always exited 0, so every failure was shown as success.
    #[cfg(windows)]
    #[test]
    fn wrapper_reports_real_failures() {
        let fast = |s: &str| hidden_script(s);
        assert_eq!(run_hidden(&fast("cmd /c exit 5")), 1, "native exit code must fail the task");
        assert_eq!(run_hidden(&fast("Get-Item 'C:\\does\\not\\exist'")), 1, "cmdlet error must fail the task");
        assert_eq!(run_hidden(&fast("Write-Host \"quotes 'ok' {braces}\"")), 0);
        assert_eq!(run_hidden(&fast("Remove-Item 'C:\\nope' -ErrorAction SilentlyContinue")), 0, "explicitly ignored errors stay ignored");
        assert_eq!(run_hidden(&fast("cmd /c exit 0")), 0);
    }
}
