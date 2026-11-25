mod commands;
mod instance_gate;
mod launch;
mod locale;
mod quick;
mod sidecar;
mod update_download;
mod updates;

use std::path::Path;
use std::sync::Arc;

use commands::AppState;
use sidecar::Sidecar;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    // Before anything else: see instance_gate.rs.
    instance_gate::wait_for_first_instance(&context.config().identifier);

    tauri::Builder::default()
        // First, so a second process hands over its files and exits before
        // anything else (the document engine included) starts.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // A quick action (`--run`) only shows its own small window.
            if launch::receive(app, argv, Path::new(&cwd), true) != launch::LaunchKind::Quick {
                launch::focus_main_window(app);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::UpdateStore::default())
        .manage(launch::LaunchState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // This process's own files ("Send to", "Open with", the context
            // menu). Held until the event loop runs; see launch::receive.
            let argv = std::env::args_os()
                .map(|a| a.to_string_lossy().into_owned())
                .collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            let kind = launch::receive(app.handle(), argv, &cwd, false);

            // The main window starts hidden (tauri.conf.json) so that a
            // quick action from the right-click menu shows nothing but its
            // progress card. Every other start shows it straight away.
            if kind != launch::LaunchKind::Quick {
                launch::focus_main_window(app.handle());
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
        .on_window_event(|window, event| {
            if window.label() == quick::LABEL {
                if let tauri::WindowEvent::Destroyed = event {
                    quick::on_closed(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_job,
            commands::cancel_job,
            commands::sidecar_health,
            commands::read_file_bytes,
            commands::unique_output_path,
            launch::take_launch_request,
            launch::take_quick_requests,
            quick::quick_window_fit,
            quick::quick_open_in_app,
            locale::installer_language,
            updates::check_for_update,
            updates::download_update,
            updates::install_update,
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|app, event| {
            // Files that arrived before the event loop started (this
            // process's own) wait for it, so launches Explorer started at the
            // same moment, queued behind the loop, join them.
            if let tauri::RunEvent::Ready = event {
                launch::arm(app);
            }
        });
}
