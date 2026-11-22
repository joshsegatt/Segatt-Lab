//! Saves an exported profile to Documents\Segatt Tools. The frontend builds the
//! JSON (src/lib/profile.ts); this side only checks it is JSON of a sane size
//! and picks the path itself, so nothing from the page names a file.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_BYTES: usize = 512 * 1024;

/// "2026-11-22" and nothing else.
pub fn valid_stamp(s: &str) -> bool {
    s.len() == 10
        && s.char_indices().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() })
}

pub fn profile_path(documents: &Path, stamp: &str) -> PathBuf {
    documents.join("Segatt Tools").join(format!("segatt-tools-{stamp}.json"))
}

pub fn check_contents(contents: &str) -> Result<(), String> {
    if contents.len() > MAX_BYTES {
        return Err("Profile is too big.".into());
    }
    serde_json::from_str::<serde_json::Value>(contents).map_err(|e| format!("Profile is not valid JSON: {e}"))?;
    Ok(())
}

/// Writes the profile and returns where it went. Exporting twice on the same
/// day replaces that day's file.
#[tauri::command]
pub fn save_profile(app: AppHandle, contents: String, stamp: String) -> Result<String, String> {
    check_contents(&contents)?;
    if !valid_stamp(&stamp) {
        return Err(format!("Invalid date: '{stamp}'"));
    }
    let documents = app.path().document_dir().map_err(|e| format!("No Documents folder: {e}"))?;
    let path = profile_path(&documents, &stamp);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("Could not write {}: {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_plain_date_names_the_file() {
        assert!(valid_stamp("2026-11-22"));
        for bad in ["", "2026-1-22", "2026/11/22", "..\\..\\x", "2026-11-22x", "abcd-ef-gh", "2026-11-2\u{0662}"] {
            assert!(!valid_stamp(bad), "{bad}");
        }
        let p = profile_path(Path::new(r"C:\Users\x\Documents"), "2026-11-22");
        assert_eq!(p, PathBuf::from(r"C:\Users\x\Documents\Segatt Tools\segatt-tools-2026-11-22.json"));
    }

    #[test]
    fn refuses_what_is_not_a_profile_file() {
        assert!(check_contents(r#"{"format":"segatt-tools-profile"}"#).is_ok());
        assert!(check_contents("not json").is_err());
        assert!(check_contents(&format!("\"{}\"", "x".repeat(MAX_BYTES))).is_err());
    }
}
