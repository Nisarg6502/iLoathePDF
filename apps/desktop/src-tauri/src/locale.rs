//! The interface language picked in the Windows installer.
//!
//! The installer's first screen asks for a language. Its post-install hook
//! (windows/installer-hooks.nsh) writes the choice, as a Windows language id
//! (LCID, e.g. 1033 for English or 1081 for Hindi), to a small file next to
//! the app's exe. The UI reads it once at startup and uses it only while the
//! user has not picked a language in Settings; mapping the id to one of the
//! app's languages happens in the UI (packages/i18n/src/languages.ts), so this
//! side never needs to know which languages exist.

use std::path::Path;

/// Written by windows/installer-hooks.nsh; keep the two names in step.
const INSTALLER_LANGUAGE_FILE: &str = "installer-language";

#[tauri::command]
pub fn installer_language() -> Option<u32> {
    let exe = std::env::current_exe().ok()?;
    read_installer_language(exe.parent()?)
}

/// `None` for a dev build, a portable copy, or a file that isn't a number:
/// the UI then falls back to the system language.
fn read_installer_language(dir: &Path) -> Option<u32> {
    let text = std::fs::read_to_string(dir.join(INSTALLER_LANGUAGE_FILE)).ok()?;
    text.trim().parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("iloathepdf-locale-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_the_lcid_the_installer_wrote() {
        let dir = scratch_dir("ok");
        // NSIS writes the number with no newline; tolerate one anyway.
        std::fs::write(dir.join(INSTALLER_LANGUAGE_FILE), "1081\r\n").unwrap();
        assert_eq!(read_installer_language(&dir), Some(1081));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_or_garbled_file_means_no_preference() {
        let dir = scratch_dir("bad");
        assert_eq!(read_installer_language(&dir), None);
        std::fs::write(dir.join(INSTALLER_LANGUAGE_FILE), "hindi").unwrap();
        assert_eq!(read_installer_language(&dir), None);
        std::fs::write(dir.join(INSTALLER_LANGUAGE_FILE), "").unwrap();
        assert_eq!(read_installer_language(&dir), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
