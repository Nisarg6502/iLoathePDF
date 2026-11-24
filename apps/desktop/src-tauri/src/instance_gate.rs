//! Makes processes that Explorer starts at the same moment wait for the first.
//!
//! The single-instance plugin decides "am I second?" with a named mutex and
//! then looks for the first process's hidden message window to forward its
//! files to. Both are created in the plugin's setup, well after the process
//! starts. Explorer starts one process per selected file within milliseconds,
//! so the others often find the mutex but not yet the window, and the plugin
//! then lets each of them open a window of its own.
//!
//! This gate runs first thing in `run()`. The first process to get here
//! creates (and keeps, for its whole life) a mutex of its own. Any process
//! that finds it already taken waits until the plugin's window exists, then
//! carries on into the plugin, which now forwards its files and exits. If the
//! window never appears (the first process died or is stuck), it gives up and
//! starts normally, which is what happened before.
//!
//! The window's class and title follow the plugin's naming
//! (`<identifier>-sic`, `<identifier>-siw`, tauri-plugin-single-instance 2.x,
//! src/platform_impl/windows.rs). If a plugin update renamed them, the wait
//! would simply time out and behave as without the gate.

#[cfg(windows)]
use std::time::Duration;

/// Longest a later process waits for the first one's window.
#[cfg(windows)]
const WAIT: Duration = Duration::from_secs(5);
#[cfg(windows)]
const POLL: Duration = Duration::from_millis(25);

#[cfg(windows)]
pub fn wait_for_first_instance(identifier: &str) {
    use std::time::Instant;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW;

    let gate = wide(&format!("{identifier}-launch-gate"));
    // SAFETY: a valid, NUL-terminated name; no security attributes.
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, gate.as_ptr()) };
    if handle.is_null() {
        return;
    }
    // SAFETY: plain thread-local error read right after the call above.
    if unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
        // First process: the handle stays open until the process ends.
        return;
    }

    let class = wide(&format!("{identifier}-sic"));
    let title = wide(&format!("{identifier}-siw"));
    let deadline = Instant::now() + WAIT;
    while Instant::now() < deadline {
        // SAFETY: valid, NUL-terminated strings.
        if !unsafe { FindWindowW(class.as_ptr(), title.as_ptr()) }.is_null() {
            break;
        }
        std::thread::sleep(POLL);
    }
    // SAFETY: the handle came from CreateMutexW above and is closed once.
    unsafe { CloseHandle(handle) };
}

#[cfg(not(windows))]
pub fn wait_for_first_instance(_identifier: &str) {}

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn names_are_nul_terminated_utf16() {
        assert_eq!(wide("ab"), vec![97, 98, 0]);
    }

    #[test]
    fn a_second_caller_without_a_first_window_gives_up_and_returns() {
        // Unique per run, so no real app instance is involved.
        let id = format!("iloathepdf-gate-test-{}", std::process::id());
        // The first call takes the gate and returns at once.
        let started = std::time::Instant::now();
        wait_for_first_instance(&id);
        assert!(started.elapsed() < Duration::from_secs(1));
        // A second one finds it taken and no window: it waits out WAIT, then
        // carries on rather than hanging.
        let started = std::time::Instant::now();
        wait_for_first_instance(&id);
        assert!(started.elapsed() >= WAIT);
    }
}
