//! Fetching and verifying an update installer.
//!
//! The installer is large (hundreds of MB, because it carries the PDF and OCR
//! engines), so a single un-resumable request is fragile: one dropped
//! connection on a slow or filtered network threw away everything downloaded.
//! This asks for the rest of the file with a `Range` request instead, and only
//! gives up after the connection has failed several times without making any
//! progress. It also keeps "the download failed" and "the file did not pass the
//! signature check" apart, so the message says which one it was.

use std::error::Error as StdError;
use std::time::Duration;

use base64::Engine as _;
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use reqwest::header::{CONTENT_RANGE, RANGE};

const USER_AGENT: &str = concat!("iLoathePDF/", env!("CARGO_PKG_VERSION"));
/// Attempts in a row that bring in no new data before giving up.
const MAX_STALLED: u32 = 6;
/// Hard stop on the total number of requests, whatever progress they make.
const MAX_ATTEMPTS: u32 = 60;

/// "connection reset: os error 10054" rather than reqwest's bare "error
/// sending request": the useful part of an error is usually its cause.
pub fn describe(e: &(dyn StdError + 'static)) -> String {
    let mut out = e.to_string();
    let mut source = e.source();
    while let Some(s) = source {
        let text = s.to_string();
        if !out.contains(&text) {
            out.push_str(": ");
            out.push_str(&text);
        }
        source = s.source();
    }
    out
}

/// `bytes 100-999/1000` -> (100, Some(1000)).
fn parse_content_range(value: &str) -> Option<(u64, Option<u64>)> {
    let rest = value.trim().strip_prefix("bytes ")?;
    let (range, total) = rest.split_once('/')?;
    let (start, _end) = range.split_once('-')?;
    let total = if total.trim() == "*" {
        None
    } else {
        Some(total.trim().parse().ok()?)
    };
    Some((start.trim().parse().ok()?, total))
}

fn megabytes(bytes: u64) -> String {
    format!("{:.0} MB", bytes as f64 / 1_000_000.0)
}

/// Download `url`, resuming after dropped connections. `on_progress` gets the
/// number of bytes held so far and the total, when the server said it.
pub async fn fetch_installer(
    url: &str,
    mut on_progress: impl FnMut(u64, Option<u64>),
    retry_delay: Duration,
) -> Result<Vec<u8>, String> {
    // The HTTPS client needs a crypto provider. The update check installs one,
    // but do not depend on that having run first.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(30))
        // No data for this long counts as a dropped connection.
        .read_timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("The download could not be set up: {}", describe(&e)))?;

    let mut buf: Vec<u8> = Vec::new();
    let mut total: Option<u64> = None;
    let mut stalled: u32 = 0;
    let mut attempts: u32 = 0;
    let mut last_error = String::from("no answer");

    loop {
        let have = buf.len() as u64;
        if let Some(t) = total {
            if have == t {
                return Ok(buf);
            }
            if have > t {
                return Err(format!(
                    "The download returned more data than announced ({have} of {t} bytes)."
                ));
            }
        }
        if stalled >= MAX_STALLED || attempts >= MAX_ATTEMPTS {
            return Err(format!(
                "The connection kept dropping after {} of {} ({last_error}). \
                 Check your connection and try again.",
                megabytes(have),
                total.map_or("an unknown size".to_string(), megabytes),
            ));
        }
        if stalled > 0 {
            pause(retry_delay * stalled).await;
        }
        attempts += 1;

        let mut request = client.get(url);
        if have > 0 {
            request = request.header(RANGE, format!("bytes={have}-"));
        }
        let response = match request.send().await {
            Ok(r) => r,
            Err(e) => {
                last_error = describe(&e);
                stalled += 1;
                continue;
            }
        };

        let status = response.status();
        if status.as_u16() == 200 {
            // A fresh answer, or a server that ignored our Range: start over.
            buf.clear();
            total = response.content_length();
        } else if status.as_u16() == 206 {
            let range = response
                .headers()
                .get(CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(parse_content_range);
            match range {
                Some((start, announced)) if start == have => {
                    total = announced.or(total);
                }
                _ => {
                    // The server resumed from somewhere else. Do not splice.
                    return Err("The server resumed the download from the wrong place.".into());
                }
            }
        } else if status.is_client_error() {
            return Err(format!(
                "GitHub refused the download (HTTP {}).",
                status.as_u16()
            ));
        } else {
            last_error = format!("the server answered HTTP {}", status.as_u16());
            stalled += 1;
            continue;
        }

        let before = buf.len();
        let mut errored = false;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buf.extend_from_slice(&bytes);
                    on_progress(buf.len() as u64, total);
                }
                Err(e) => {
                    last_error = describe(&e);
                    errored = true;
                    break;
                }
            }
        }
        if buf.len() > before {
            stalled = 0;
        } else {
            stalled += 1;
        }
        // Without an announced size there is nothing to compare against: a body
        // that ended without an error is all we will get.
        if total.is_none() && !errored {
            return Ok(buf);
        }
    }
}

async fn pause(d: Duration) {
    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d))
        .await
        .ok();
}

fn base64_text(value: &str, what: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value.trim())
        .map_err(|e| format!("The {what} is not valid base64: {e}"))?;
    String::from_utf8(bytes).map_err(|_| format!("The {what} is not text."))
}

/// The version recorded inside a signature's trusted comment
/// (`timestamp:...\tfile:...\tversion:0.5.1`).
fn signed_version(trusted_comment: &str) -> Option<&str> {
    trusted_comment
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"))
}

/// Check `data` against the minisign `signature_b64` (as it appears in
/// `latest.json`) and the app's `pubkey_b64`, and that it was signed for the
/// `announced` version, so an old signed installer cannot be passed off as a
/// new one.
pub fn verify_installer(
    data: &[u8],
    signature_b64: &str,
    pubkey_b64: &str,
    announced: &str,
) -> Result<(), String> {
    let public_key = PublicKey::decode(&base64_text(pubkey_b64, "app's update key")?)
        .map_err(|e| format!("The app's update key could not be read: {e}"))?;
    let signature = Signature::decode(&base64_text(signature_b64, "update signature")?)
        .map_err(|e| format!("The update's signature could not be read: {e}"))?;
    public_key
        .verify(data, &signature, true)
        .map_err(|e| format!("The downloaded file does not match its signature ({e})."))?;

    let signed = signed_version(signature.trusted_comment()).ok_or_else(|| {
        "The update's signature does not say which version it was made for.".to_string()
    })?;
    if signed.trim_start_matches('v') != announced.trim_start_matches('v') {
        return Err(format!(
            "The file is signed for version {signed}, but version {announced} was announced."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn content_range_is_parsed() {
        assert_eq!(
            parse_content_range("bytes 100-999/1000"),
            Some((100, Some(1000)))
        );
        assert_eq!(parse_content_range("bytes 0-9/*"), Some((0, None)));
        assert_eq!(parse_content_range("items 0-9/10"), None);
        assert_eq!(parse_content_range("bytes x-9/10"), None);
    }

    #[test]
    fn signed_version_is_read_from_the_trusted_comment() {
        assert_eq!(
            signed_version("timestamp:1\tfile:a.exe\tversion:0.5.1"),
            Some("0.5.1")
        );
        assert_eq!(signed_version("timestamp:1\tfile:a.exe"), None);
    }

    #[test]
    fn garbage_signatures_are_rejected_without_panicking() {
        let err = verify_installer(b"data", "not base64!!", "also not", "0.5.1").unwrap_err();
        assert!(err.contains("update key"), "{err}");
    }

    /// Serve `body` on a local port. `plan` decides, per connection number,
    /// how many bytes to send before cutting the connection (`None` = all of
    /// them) and whether to honour a Range header.
    fn serve(
        body: Vec<u8>,
        plan: impl Fn(usize) -> (Option<usize>, bool) + Send + 'static,
    ) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/installer.exe", listener.local_addr().unwrap());
        let connections = Arc::new(AtomicUsize::new(0));
        let counter = connections.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { return };
                let n = counter.fetch_add(1, Ordering::SeqCst);
                let mut raw = [0u8; 2048];
                let read = stream.read(&mut raw).unwrap_or(0);
                let request = String::from_utf8_lossy(&raw[..read]).to_lowercase();
                let (cut, honour_range) = plan(n);
                let start = request
                    .lines()
                    .find_map(|l| l.strip_prefix("range: bytes="))
                    .and_then(|r| r.trim_end_matches('-').parse::<usize>().ok())
                    .filter(|_| honour_range);
                let (head, payload) = match start {
                    Some(s) => (
                        format!(
                            "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nConnection: close\r\n\r\n",
                            body.len() - s, s, body.len() - 1, body.len()
                        ),
                        &body[s..],
                    ),
                    None => (
                        format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        ),
                        &body[..],
                    ),
                };
                let _ = stream.write_all(head.as_bytes());
                let send = cut.map_or(payload.len(), |c| c.min(payload.len()));
                let _ = stream.write_all(&payload[..send]);
                let _ = stream.flush();
                // Dropping the stream cuts a short body off mid-transfer.
            }
        });
        (url, connections)
    }

    fn sample(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i % 251) as u8).collect()
    }

    fn run(url: String) -> Result<Vec<u8>, String> {
        tauri::async_runtime::block_on(fetch_installer(&url, |_, _| {}, Duration::from_millis(1)))
    }

    #[test]
    fn a_complete_download_needs_one_request() {
        let body = sample(50_000);
        let (url, connections) = serve(body.clone(), |_| (None, true));
        assert_eq!(run(url).unwrap(), body);
        assert_eq!(connections.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_dropped_connection_is_resumed_not_restarted() {
        let body = sample(200_000);
        // The first connection dies after 60 000 bytes; the second must ask for the rest.
        let (url, connections) = serve(body.clone(), |n| {
            (if n == 0 { Some(60_000) } else { None }, true)
        });
        assert_eq!(run(url).unwrap(), body);
        assert_eq!(connections.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn several_drops_in_a_row_still_finish() {
        let body = sample(300_000);
        let (url, _) = serve(body.clone(), |n| {
            (if n < 4 { Some(40_000) } else { None }, true)
        });
        assert_eq!(run(url).unwrap(), body);
    }

    #[test]
    fn a_server_that_ignores_range_is_handled_by_starting_over() {
        let body = sample(100_000);
        let (url, _) = serve(body.clone(), |n| {
            (if n == 0 { Some(30_000) } else { None }, false)
        });
        assert_eq!(run(url).unwrap(), body);
    }

    #[test]
    fn a_connection_that_never_delivers_gives_up_with_a_clear_message() {
        let (url, connections) = serve(sample(10_000), |_| (Some(0), true));
        let err = run(url).unwrap_err();
        assert!(err.contains("kept dropping"), "{err}");
        assert_eq!(connections.load(Ordering::SeqCst) as u32, MAX_STALLED);
    }

    #[test]
    fn a_refusal_is_reported_as_one() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/x", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut s) = stream else { return };
                let mut raw = [0u8; 1024];
                let _ = s.read(&mut raw);
                let _ = s.write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                );
            }
        });
        let err = run(url).unwrap_err();
        assert!(err.contains("refused") && err.contains("404"), "{err}");
    }

    /// Manual release check, run against a real published release:
    /// `INSTALLER=/path/setup.exe MANIFEST=/path/latest.json cargo test --lib real_release -- --ignored`
    #[test]
    #[ignore]
    fn real_release_verifies() {
        let installer = std::fs::read(std::env::var("INSTALLER").unwrap()).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(std::env::var("MANIFEST").unwrap()).unwrap(),
        )
        .unwrap();
        let conf: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json"))
                .unwrap(),
        )
        .unwrap();
        let signature = manifest["platforms"]["windows-x86_64"]["signature"]
            .as_str()
            .unwrap();
        let version = manifest["version"].as_str().unwrap();
        let pubkey = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        verify_installer(&installer, signature, pubkey, version).unwrap();
        // A different announced version, or a flipped byte, must be refused.
        assert!(verify_installer(&installer, signature, pubkey, "9.9.9").is_err());
        let mut tampered = installer.clone();
        tampered[1000] ^= 1;
        assert!(verify_installer(&tampered, signature, pubkey, version).is_err());
    }
}
