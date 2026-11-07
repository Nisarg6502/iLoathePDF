//! The optional update check: the only network code in the app.
//!
//! The UI calls `fetch_latest_release` only after the user has switched the
//! check on in Settings. It makes one HTTPS GET to GitHub's public "latest
//! release" endpoint and returns the version and the release-page URL.
//!
//! What is deliberately NOT in the request: the installed version, any
//! identifier, any file name or path, any cookie (the `cookies` feature of the
//! HTTP client is off). The comparison with the installed version happens in
//! the UI. GitHub does see the connection itself (an IP address and a generic
//! user agent), as any website does; Settings says so.
//!
//! Nothing is downloaded or installed. The UI only links to the release page.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::sidecar::JobError;

const LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/Nisarg6502/iLoathePDF/releases/latest";

/// Anything we hand back as a link must live under here, whatever GitHub's
/// response says, so a malformed or tampered response cannot make the app link
/// somewhere else.
const RELEASE_URL_PREFIX: &str = "https://github.com/Nisarg6502/iLoathePDF/releases/";

/// A fixed, version-free identifier: GitHub's API rejects requests without a
/// user agent, but there is no reason to tell it which build is asking.
const USER_AGENT: &str = "iLoathePDF-update-check";

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct LatestRelease {
    /// Without the leading "v": "0.3.0".
    pub version: String,
    pub url: String,
}

fn network_error(message: impl Into<String>, detail: Option<String>) -> JobError {
    JobError {
        code: "INTERNAL".into(),
        message: message.into(),
        detail,
    }
}

/// Pull the version and link out of GitHub's JSON. Split from the request so
/// it can be tested without a network.
fn parse_latest_release(body: &str) -> Result<LatestRelease, String> {
    let json: Value = serde_json::from_str(body).map_err(|e| format!("not JSON: {e}"))?;
    let tag = json
        .get("tag_name")
        .and_then(Value::as_str)
        .ok_or("no tag_name in the response")?;
    let version = tag.trim_start_matches('v').to_string();

    let url = json
        .get("html_url")
        .and_then(Value::as_str)
        .filter(|u| u.starts_with(RELEASE_URL_PREFIX))
        .map(str::to_string)
        .unwrap_or_else(|| format!("{RELEASE_URL_PREFIX}latest"));

    Ok(LatestRelease { version, url })
}

fn request_latest_release() -> Result<LatestRelease, JobError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .https_only(true)
        .build()
        .into();

    let mut response = agent
        .get(LATEST_RELEASE_API)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| {
            network_error(
                "Could not reach GitHub to check for updates.",
                Some(e.to_string()),
            )
        })?;

    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| network_error("GitHub's answer could not be read.", Some(e.to_string())))?;

    parse_latest_release(&body)
        .map_err(|e| network_error("GitHub's answer was not what the app expected.", Some(e)))
}

#[tauri::command]
pub async fn fetch_latest_release() -> Result<LatestRelease, JobError> {
    tauri::async_runtime::spawn_blocking(request_latest_release)
        .await
        .unwrap_or_else(|e| Err(JobError::internal(format!("update thread panicked: {e}"))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tag_and_link() {
        let body = r#"{"tag_name":"v0.3.0","html_url":"https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.3.0"}"#;
        assert_eq!(
            parse_latest_release(body).unwrap(),
            LatestRelease {
                version: "0.3.0".into(),
                url: "https://github.com/Nisarg6502/iLoathePDF/releases/tag/v0.3.0".into(),
            }
        );
    }

    #[test]
    fn a_link_outside_our_releases_is_replaced() {
        let body = r#"{"tag_name":"v0.3.0","html_url":"https://evil.example/download"}"#;
        assert_eq!(
            parse_latest_release(body).unwrap().url,
            "https://github.com/Nisarg6502/iLoathePDF/releases/latest"
        );
    }

    #[test]
    fn rejects_a_response_without_a_tag() {
        assert!(parse_latest_release(r#"{"message":"Not Found"}"#).is_err());
        assert!(parse_latest_release("<html>").is_err());
    }
}
