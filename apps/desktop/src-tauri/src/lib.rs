mod commands;
mod sidecar;

use std::sync::Arc;

use commands::AppState;
use sidecar::Sidecar;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // A failure to start the engine is not fatal: the window still
            // opens and the UI reports what went wrong, which is far easier
            // to debug than a process that dies before showing anything.
            let state = match Sidecar::spawn(app.handle()) {
                Ok(engine) => AppState {
                    sidecar: Some(Arc::new(engine)),
                    startup_error: None,
                },
                Err(error) => {
                    log::error!("document engine failed to start: {error}");
                    AppState {
                        sidecar: None,
                        startup_error: Some(error),
                    }
                }
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_job,
            commands::cancel_job,
            commands::sidecar_health,
            commands::read_file_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
