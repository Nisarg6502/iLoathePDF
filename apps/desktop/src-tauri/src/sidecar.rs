//! Owns the Python document engine process and the JSON-lines protocol.
//!
//! See `sidecar/PROTOCOL.md`. The rule this module enforces: the engine's
//! stdout is protocol-only, its stderr is logs, and no document logic lives
//! on the Rust side.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Error shape handed to the frontend. Mirrors `JobError` in `src/lib/jobs.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct JobError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl JobError {
    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "INTERNAL".into(),
            message: message.into(),
            detail: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub id: String,
    pub pct: i64,
    pub note: String,
}

/// One line coming back from the engine.
#[derive(Debug, Deserialize)]
struct Envelope {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    pct: i64,
    #[serde(default)]
    note: String,
    #[serde(default)]
    data: Option<Value>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    detail: Option<String>,
}

type Outcome = Result<Value, JobError>;
type Pending = Arc<Mutex<HashMap<String, Sender<Outcome>>>>;

pub struct Sidecar {
    stdin: Mutex<ChildStdin>,
    pending: Pending,
    child: Mutex<Child>,
}

impl Sidecar {
    /// Spawn the engine and start its reader threads. Called once at startup.
    pub fn spawn(app: &AppHandle) -> Result<Self, String> {
        let (program, args) = resolve_command(app)?;
        log::info!("spawning document engine: {program} {args:?}");

        let mut command = Command::new(&program);
        command
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // The engine speaks UTF-8 JSON and must not buffer its replies.
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUNBUFFERED", "1");

        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command
            .spawn()
            .map_err(|e| format!("could not start the document engine ({program}): {e}"))?;

        let stdin = child.stdin.take().ok_or("engine stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("engine stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("engine stderr unavailable")?;

        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));

        // stdout carries the protocol.
        {
            let pending = pending.clone();
            let app = app.clone();
            std::thread::spawn(move || read_protocol(BufReader::new(stdout), pending, app));
        }
        // stderr is logs only.
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                log::info!("[engine] {line}");
            }
        });

        Ok(Self {
            stdin: Mutex::new(stdin),
            pending,
            child: Mutex::new(child),
        })
    }

    /// Send a request and block until the job terminates. Callers must run
    /// this on the blocking pool, never on the UI thread.
    pub fn call(&self, id: &str, op: &str, params: Value) -> Outcome {
        let (tx, rx) = channel::<Outcome>();
        self.pending.lock().unwrap().insert(id.to_string(), tx);

        let request = serde_json::json!({ "id": id, "op": op, "params": params });

        if let Err(e) = self.write_line(&format!("{request}\n")) {
            self.pending.lock().unwrap().remove(id);
            return Err(JobError::internal(format!(
                "could not reach the document engine: {e}"
            )));
        }

        rx.recv().unwrap_or_else(|_| {
            Err(JobError::internal(
                "the document engine stopped unexpectedly",
            ))
        })
    }

    /// Fire and forget: ask the engine to cancel a running job.
    pub fn cancel(&self, target: &str) {
        let request = serde_json::json!({
            "id": format!("cancel-{target}"),
            "op": "sys.cancel",
            "params": { "target": target }
        });
        let _ = self.write_line(&format!("{request}\n"));
    }

    fn write_line(&self, line: &str) -> std::io::Result<()> {
        let mut stdin = self.stdin.lock().unwrap();
        stdin.write_all(line.as_bytes())?;
        stdin.flush()
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn read_protocol<R: BufRead>(reader: R, pending: Pending, app: AppHandle) {
    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let envelope: Envelope = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                log::error!("unparseable line from engine: {e}: {line}");
                continue;
            }
        };

        match envelope.kind.as_str() {
            "progress" => {
                let _ = app.emit(
                    "job://progress",
                    Progress {
                        id: envelope.id,
                        pct: envelope.pct,
                        note: envelope.note,
                    },
                );
            }
            "result" | "error" => {
                let outcome: Outcome = if envelope.kind == "result" {
                    Ok(envelope.data.unwrap_or(Value::Null))
                } else {
                    Err(JobError {
                        code: envelope.code.unwrap_or_else(|| "INTERNAL".into()),
                        message: envelope
                            .message
                            .unwrap_or_else(|| "Operation failed".into()),
                        detail: envelope.detail,
                    })
                };
                if let Some(tx) = pending.lock().unwrap().remove(&envelope.id) {
                    let _ = tx.send(outcome);
                }
            }
            other => log::warn!("unknown message type from engine: {other}"),
        }
    }

    // stdout closed means the engine died. Fail every in-flight job rather
    // than leaving the UI spinning forever.
    log::error!("document engine stdout closed");
    for (_, tx) in pending.lock().unwrap().drain() {
        let _ = tx.send(Err(JobError::internal(
            "the document engine stopped unexpectedly",
        )));
    }
}

/// In development, run the repo's venv against `sidecar/main.py`. In a packaged
/// build, run the PyInstaller executable shipped in the app's resources.
fn resolve_command(app: &AppHandle) -> Result<(String, Vec<String>), String> {
    if tauri::is_dev() {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        // `tauri dev` runs with src-tauri as the working directory.
        let root = if cwd.join("tauri.conf.json").exists() {
            cwd.parent().ok_or("no parent of src-tauri")?.to_path_buf()
        } else {
            cwd
        };
        let python = root.join(".venv/Scripts/python.exe");
        let python = if python.exists() {
            python
        } else {
            root.join(".venv/bin/python")
        };
        let script = root.join("sidecar/main.py");
        if !python.exists() {
            return Err(format!("dev venv not found at {}", python.display()));
        }
        return Ok((
            python.to_string_lossy().into_owned(),
            vec![script.to_string_lossy().into_owned()],
        ));
    }

    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let exe = resources.join("sidecar").join("iloathepdf-sidecar.exe");
    if !exe.exists() {
        return Err(format!(
            "bundled document engine missing at {}",
            exe.display()
        ));
    }
    Ok((exe.to_string_lossy().into_owned(), vec![]))
}
