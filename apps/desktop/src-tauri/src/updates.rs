//! Optional, signed, in-app updates: the only network code in the app.
//!
//! Nothing here runs unless the user has switched the update check on in
//! Settings (the UI never calls these commands otherwise), and nothing is
//! downloaded until they press "Update now" (or opt in to automatic download).
//!
//! * `check_for_update` fetches one small JSON file (`latest.json`) from this
//!   repository's latest GitHub release. The request carries no version, no
//!   identifier, no path and no cookie: the URL has no placeholders, so the
//!   comparison with the installed version happens on this machine. GitHub
//!   sees the connection itself (an IP address and the plugin's generic user
//!   agent), as any website does; Settings says so.
//! * `download_update` fetches the installer the JSON points at and verifies its
//!   signature against the public key compiled into the app (`pubkey` in
//!   tauri.conf.json). A download that does not verify is discarded.
//! * `install_update` hands the verified installer to Windows, which asks for
//!   permission, replaces the app and reopens it. Before the app exits the
//!   document engine is stopped, otherwise its files would be locked.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::commands::AppState;
use crate::sidecar::JobError;

/// Anything we hand back as a link must live under here, whatever the
/// downloaded JSON says, so a malformed or tampered file cannot make the app
/// link somewhere else.
const RELEASE_URL_PREFIX: &str = "https://github.com/Nisarg6502/iLoathePDF/releases/";

/// What the UI is told about an available update.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct UpdateInfo {
    /// Without the leading "v": "0.5.0".
    pub version: String,
    /// The release page for this version.
    pub url: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum DownloadEvent {
    /// `total` is None when the server did not say how big the file is.
    Progress { downloaded: u64, total: Option<u64> },
}

/// The update found by the last check, and its installer once downloaded.
#[derive(Default)]
pub struct UpdateStore {
    pending: Mutex<Option<Update>>,
    installer: Mutex<Option<Vec<u8>>>,
}

fn error(message: impl Into<String>, detail: impl ToString) -> JobError {
    JobError {
        code: "INTERNAL".into(),
        message: message.into(),
        detail: Some(detail.to_string()),
    }
}

/// A version string we are willing to put in a link: digits, letters and the
/// separators semver uses, nothing that could break out of a URL.
fn clean_version(raw: &str) -> Option<String> {
    let v = raw.trim().trim_start_matches('v');
    let ok = !v.is_empty()
        && v.len() <= 32
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'));
    ok.then(|| v.to_string())
}

fn release_url(version: &str) -> String {
    format!("{RELEASE_URL_PREFIX}tag/v{version}")
}

fn info_for(update: &Update) -> Result<UpdateInfo, JobError> {
    let version = clean_version(&update.version).ok_or_else(|| {
        error(
            "The update announcement was not what the app expected.",
            format!("bad version {:?}", update.version),
        )
    })?;
    Ok(UpdateInfo {
        url: release_url(&version),
        version,
    })
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, AppState>,
    store: State<'_, UpdateStore>,
) -> Result<Option<UpdateInfo>, JobError> {
    let mut builder = app.updater_builder();

    // Windows replaces files the engine is holding open, so stop it just before
    // the app exits to run the installer.
    #[cfg(windows)]
    if let Some(engine) = state.sidecar.clone() {
        builder = builder.on_before_exit(move || engine.shutdown());
    }
    #[cfg(not(windows))]
    let _ = &state;

    let updater = builder
        .build()
        .map_err(|e| error("The update check could not be set up.", e))?;

    let found = updater
        .check()
        .await
        .map_err(|e| error("Could not reach GitHub to check for updates.", e))?;

    // A new check invalidates anything downloaded for an older answer.
    *store.installer.lock().unwrap() = None;

    match found {
        Some(update) => {
            let info = info_for(&update)?;
            *store.pending.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
        None => {
            *store.pending.lock().unwrap() = None;
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn download_update(
    store: State<'_, UpdateStore>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), JobError> {
    let update = store
        .pending
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| JobError::internal("There is no update to download. Check again first."))?;

    let mut downloaded: u64 = 0;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = on_event.send(DownloadEvent::Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| {
            error(
                "The update could not be downloaded, or did not pass the signature check.",
                e,
            )
        })?;

    *store.installer.lock().unwrap() = Some(bytes);
    Ok(())
}

/// Runs the downloaded installer. On success this does not return: the app
/// exits and the installer takes over (and reopens the app when it is done).
#[tauri::command]
pub async fn install_update(store: State<'_, UpdateStore>) -> Result<(), JobError> {
    let update = store
        .pending
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| JobError::internal("There is no update to install."))?;
    let bytes = store
        .installer
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| JobError::internal("The update has not been downloaded yet."))?;

    tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .unwrap_or_else(|e| Err(tauri_plugin_updater::Error::Io(std::io::Error::other(e.to_string()))))
        .map_err(|e| error("The update could not be started.", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_cleaned_for_links() {
        assert_eq!(clean_version("v0.5.0").as_deref(), Some("0.5.0"));
        assert_eq!(clean_version(" 1.2.3-beta.1 ").as_deref(), Some("1.2.3-beta.1"));
        assert_eq!(clean_version(""), None);
        assert_eq!(clean_version("1.0/../../evil"), None);
        assert_eq!(clean_version("1.0 0"), None);
    }

    #[test]
    fn links_stay_under_our_releases() {
        assert!(release_url("0.5.0").starts_with(RELEASE_URL_PREFIX));
        assert_eq!(
            release_url("0.5.0"),
            "https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.5.0"
        );
    }
}
