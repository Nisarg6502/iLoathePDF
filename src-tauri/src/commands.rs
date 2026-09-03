//! The Rust <-> UI surface. Deliberately tiny: three commands, no document logic.

use std::sync::Arc;

use serde_json::Value;
use tauri::State;

use crate::sidecar::{JobError, Sidecar};

pub struct AppState {
    pub sidecar: Option<Arc<Sidecar>>,
    /// Set when the engine failed to start, so the UI can explain why.
    pub startup_error: Option<String>,
}

impl AppState {
    fn engine(&self) -> Result<Arc<Sidecar>, JobError> {
        self.sidecar.clone().ok_or_else(|| JobError {
            code: "INTERNAL".into(),
            message: self
                .startup_error
                .clone()
                .unwrap_or_else(|| "The document engine is not running.".into()),
            detail: None,
        })
    }
}

#[tauri::command]
pub async fn run_job(
    state: State<'_, AppState>,
    id: String,
    op: String,
    params: Value,
) -> Result<Value, JobError> {
    // A job blocks for seconds at a time, so it must not sit on one of the
    // async runtime's worker threads. Clone the Arc and hand it to the
    // blocking pool; `State` itself cannot cross that boundary.
    let engine = state.engine()?;
    // Logged because "where did my output go?" is otherwise unanswerable after
    // the fact; these are local paths in a local log file.
    log::info!("job {id} {op} {params}");
    tauri::async_runtime::spawn_blocking(move || engine.call(&id, &op, params))
        .await
        .unwrap_or_else(|e| Err(JobError::internal(format!("job thread panicked: {e}"))))
}

#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, id: String) {
    if let Some(engine) = state.sidecar.as_ref() {
        engine.cancel(&id);
    }
}

#[tauri::command]
pub async fn sidecar_health(state: State<'_, AppState>) -> Result<Value, JobError> {
    let engine = state.engine()?;
    tauri::async_runtime::spawn_blocking(move || {
        engine.call("health", "sys.ping", Value::Object(Default::default()))
    })
    .await
    .unwrap_or_else(|e| Err(JobError::internal(format!("health thread panicked: {e}"))))
}

/// Read a file into the webview as raw bytes.
///
/// The PDF page canvas renders thumbnails with pdf.js, which needs the file's
/// bytes rather than its path. Paths only ever come from the user's own drop or
/// file dialog, and `tauri::ipc::Response` sends the bytes raw instead of as a
/// JSON number array, which matters for a 50 MB scan.
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, JobError> {
    let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| JobError::internal(format!("read thread panicked: {e}")))?
        .map_err(|e| JobError {
            code: "FILE_NOT_FOUND".into(),
            message: format!("Could not read that file: {e}"),
            detail: None,
        })?;
    Ok(tauri::ipc::Response::new(bytes))
}
