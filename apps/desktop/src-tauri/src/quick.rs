//! The quick-action window: a small, always-on-top progress card for the
//! right-click actions that do their job in place (`--run`, see launch.rs).
//!
//! It is created hidden when the first quick request settles, loads
//! `quick.html` (src/quick/), and shows itself once its page has measured how
//! tall it needs to be ([`quick_window_fit`]), in the bottom-right corner of
//! the screen the mouse is on, without taking focus from Explorer. The page
//! pulls requests with `take_quick_requests` and runs them one after another.
//!
//! When the app was started only for quick actions, the main window stays
//! hidden throughout, and closing this window ends the app (see
//! [`on_closed`]). When the main window is open, closing this one changes
//! nothing else.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::launch::{focus_main_window, LaunchState, LAUNCH_EVENT};

/// Fired (with no payload) when quick requests are ready to take.
pub const QUICK_EVENT: &str = "quick://request";

pub const LABEL: &str = "quick";

/// Logical pixels. Wide enough for a long file name on one line.
const WIDTH: f64 = 380.0;
const MIN_HEIGHT: f64 = 96.0;
const MAX_HEIGHT: f64 = 520.0;
/// Gap between the card and the screen edge (above the taskbar).
const MARGIN: f64 = 16.0;
/// If the page never reports its size (it failed to load), show the window
/// anyway after this long, so the app is not left running invisibly.
const SHOW_FALLBACK: Duration = Duration::from_secs(3);

/// Makes sure the window exists and tells it there is work.
pub fn announce<R: Runtime>(app: &AppHandle<R>) {
    if app.get_webview_window(LABEL).is_none() {
        if let Err(error) = create(app) {
            log::error!("could not open the quick-action window: {error}");
            return;
        }
    }
    if let Err(error) = app.emit_to(LABEL, QUICK_EVENT, ()) {
        log::warn!("could not announce a quick action: {error}");
    }
}

fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("quick.html".into()))
        .title("iLoathePDF")
        .inner_size(WIDTH, 140.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .shadow(true)
        .visible(false)
        .build()?;
    let handle = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SHOW_FALLBACK);
        if !handle.is_visible().unwrap_or(true) {
            log::warn!("quick-action window never reported its size; showing it anyway");
            place(&handle, 160.0);
            let _ = handle.show();
        }
    });
    Ok(())
}

/// Sizes the window to `height` logical pixels and pins its bottom-right
/// corner to the work area (the screen minus the taskbar) of the monitor the
/// mouse is on, where the right-click happened.
fn place<R: Runtime>(window: &WebviewWindow<R>, height: f64) {
    let height = height.clamp(MIN_HEIGHT, MAX_HEIGHT);
    let _ = window.set_size(LogicalSize::new(WIDTH, height));
    let monitor = window
        .cursor_position()
        .ok()
        .and_then(|p| window.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (w, h, m) = (WIDTH * scale, height * scale, MARGIN * scale);
    let x = area.position.x as f64 + area.size.width as f64 - w - m;
    let y = area.position.y as f64 + area.size.height as f64 - h - m;
    let _ = window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// The page measured its content: resize, keep the corner, and show.
#[tauri::command]
pub fn quick_window_fit<R: Runtime>(window: WebviewWindow<R>, height: f64) {
    if window.label() != LABEL || !height.is_finite() {
        return;
    }
    place(&window, height);
    if !window.is_visible().unwrap_or(false) {
        let _ = window.show();
    }
}

/// "Open in iLoathePDF" from the quick window: the full tool, with the files.
#[tauri::command]
pub fn quick_open_in_app<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LaunchState>,
    action: Option<String>,
    files: Vec<String>,
) {
    let files: Vec<PathBuf> = files.into_iter().map(PathBuf::from).collect();
    state.with(|inbox| inbox.open_now(action, files, Instant::now()));
    focus_main_window(&app);
    if let Err(error) = app.emit(LAUNCH_EVENT, ()) {
        log::warn!("could not announce a launch request: {error}");
    }
}

/// Called when the quick window has closed. If nobody is looking at the main
/// window (the app was started for a quick action), the app has nothing left
/// to do.
pub fn on_closed<R: Runtime>(app: &AppHandle<R>) {
    let main_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let (queued, arriving) = app
        .try_state::<LaunchState>()
        .map(|state| state.with(|inbox| (inbox.has_quick(), inbox.current().is_some())))
        .unwrap_or_default();
    if queued {
        // A request settled while the window was closing: open a new one.
        announce(app);
    } else if !main_visible && !arriving {
        // (A launch still inside its quiet window announces itself when it
        // settles, so the app must not exit under it.)
        log::info!("quick actions done and the main window is hidden; exiting");
        app.exit(0);
    }
}
