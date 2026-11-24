//! Files handed to the app by Windows: the Explorer right-click menu,
//! "Send to", "Open with" and dropping files on the exe.
//!
//! Every one of those goes through one command line, which the installer's
//! registry entries depend on exactly:
//!
//! ```text
//! iLoathePDF.exe [--action <tool-id>] <file> [<file> ...]
//! ```
//!
//! `<tool-id>` is a tool `id` from `src/lib/tools.ts`. The UI decides what to
//! do with the files (src/lib/launch.ts); this side only collects them.
//!
//! Explorer starts the verb once per selected file, as separate processes at
//! nearly the same moment. The single-instance plugin forwards each later
//! process's command line here and ends that process, so the files land in
//! one place: [`Inbox`]. Arrivals are merged until nothing new has come in for
//! [`QUIET_WINDOW`], then handed to the UI as one [`LaunchRequest`].
//!
//! The UI pulls the request with [`take_launch_request`] when it mounts, and
//! again whenever [`LAUNCH_EVENT`] fires. Pulling (rather than pushing the
//! files in the event) means a request that is ready before the window has
//! loaded waits here instead of being lost.

use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Fired (with no payload) when a request is ready to take.
pub const LAUNCH_EVENT: &str = "launch://request";

/// How long to wait after the last arrival before handing the files over.
/// Explorer starts all its processes within a few hundred milliseconds.
const QUIET_WINDOW: Duration = Duration::from_millis(400);

/// A process that starts this long after the last request was handed over
/// (a slow start on a busy machine) joins that request instead of replacing
/// it, as long as it asks for the same action.
const FOLLOW_UP: Duration = Duration::from_secs(3);

/// One command line, parsed.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ParsedArgs {
    /// The `--action` value; `None` for "Send to", "Open with" and drops.
    pub action: Option<String>,
    /// Existing files, absolute, in the order given.
    pub files: Vec<PathBuf>,
    /// Arguments that named something other than an existing file: a folder,
    /// or a file that is gone. Counted so the UI can say so.
    pub skipped: usize,
}

impl ParsedArgs {
    fn is_empty(&self) -> bool {
        self.action.is_none() && self.files.is_empty() && self.skipped == 0
    }

    /// Adds another launch's files, skipping ones already here. The first
    /// action seen wins: one gesture in Explorer never mixes actions.
    fn absorb(&mut self, other: ParsedArgs) {
        if self.action.is_none() {
            self.action = other.action;
        }
        let mut seen: HashSet<Vec<String>> = self.files.iter().map(|f| path_key(f)).collect();
        for file in other.files {
            if seen.insert(path_key(&file)) {
                self.files.push(file);
            }
        }
        self.skipped += other.skipped;
    }
}

/// Parses a full argv (`argv[0]`, the exe, is skipped).
///
/// Relative paths are resolved against `cwd`, the launching process's working
/// folder. Anything else starting with `-` is a flag meant for someone else
/// (Tauri, WebView2) and is ignored. `is_file` is the file-system check, passed
/// in so tests need no real files.
pub fn parse_args<I, S>(argv: I, cwd: &Path, is_file: impl Fn(&Path) -> bool) -> ParsedArgs
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut parsed = ParsedArgs::default();
    let mut args = argv.into_iter().skip(1);
    while let Some(arg) = args.next() {
        let arg = arg.as_ref().trim();
        if arg.is_empty() {
            continue;
        }
        if arg == "--action" {
            let value = args.next();
            set_action(&mut parsed, value.as_ref().map(|v| v.as_ref()));
            continue;
        }
        if let Some(value) = arg.strip_prefix("--action=") {
            set_action(&mut parsed, Some(value));
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        // `join` keeps an absolute `arg` as it is.
        let path: PathBuf = cwd.join(arg).components().collect();
        if is_file(&path) {
            parsed.files.push(path);
        } else {
            parsed.skipped += 1;
        }
    }
    parsed
}

fn set_action(parsed: &mut ParsedArgs, value: Option<&str>) {
    if parsed.action.is_some() {
        return;
    }
    if let Some(value) = value.map(str::trim).filter(|v| !v.is_empty()) {
        parsed.action = Some(value.to_string());
    }
}

/// Windows paths are case-insensitive and accept either slash; comparing
/// lower-cased components treats `C:/A.pdf` and `c:\a.PDF` as one file.
fn path_key(path: &Path) -> Vec<String> {
    path.components()
        .filter(|c| !matches!(c, Component::CurDir))
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect()
}

/// "scan 2.jpg" before "scan 10.jpg", ignoring case. Explorer's own order for
/// a multi-file launch is not reliable, so files are sorted by name instead.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut a = a.chars().peekable();
    let mut b = b.chars().peekable();
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let run_a = take_digits(&mut a);
                let run_b = take_digits(&mut b);
                let num_a = run_a.trim_start_matches('0');
                let num_b = run_b.trim_start_matches('0');
                let order = num_a
                    .len()
                    .cmp(&num_b.len())
                    .then_with(|| num_a.cmp(num_b))
                    .then_with(|| run_a.len().cmp(&run_b.len()));
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(x), Some(y)) => {
                let order = x.to_lowercase().cmp(y.to_lowercase());
                if order != Ordering::Equal {
                    return order;
                }
                a.next();
                b.next();
            }
        }
    }
}

fn take_digits(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> String {
    let mut run = String::new();
    while let Some(c) = chars.peek().copied().filter(char::is_ascii_digit) {
        run.push(c);
        chars.next();
    }
    run
}

fn sort_naturally(files: &mut [PathBuf]) {
    let name = |p: &Path| {
        p.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    files.sort_by(|a, b| {
        natural_cmp(&name(a), &name(b))
            .then_with(|| natural_cmp(&a.to_string_lossy(), &b.to_string_lossy()))
    });
}

/// What the UI receives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub action: Option<String>,
    pub files: Vec<String>,
    pub skipped: usize,
}

impl From<ParsedArgs> for LaunchRequest {
    fn from(mut parsed: ParsedArgs) -> Self {
        sort_naturally(&mut parsed.files);
        LaunchRequest {
            action: parsed.action,
            files: parsed
                .files
                .iter()
                .map(|f| f.to_string_lossy().into_owned())
                .collect(),
            skipped: parsed.skipped,
        }
    }
}

/// Collects launches and releases them once they stop arriving.
///
/// Every arrival bumps `generation`. A timer started for an arrival settles
/// the batch only if no later arrival has bumped it since, which is the
/// debounce. Kept free of threads and clocks (the time is passed in) so it
/// can be tested directly.
#[derive(Debug, Default)]
pub struct Inbox {
    pending: ParsedArgs,
    generation: u64,
    ready: Option<ParsedArgs>,
    /// The last request settled, and when: see [`FOLLOW_UP`].
    last: Option<(Instant, ParsedArgs)>,
}

impl Inbox {
    /// Adds a launch. Returns the generation to settle later, or `None` when
    /// the launch carried nothing (a plain second start just focuses the app).
    pub fn push(&mut self, parsed: ParsedArgs) -> Option<u64> {
        if parsed.is_empty() {
            return None;
        }
        self.pending.absorb(parsed);
        self.generation += 1;
        Some(self.generation)
    }

    /// The generation to settle, if anything is waiting.
    pub fn current(&self) -> Option<u64> {
        (!self.pending.is_empty()).then_some(self.generation)
    }

    /// Moves the pending launches to `ready`, unless something arrived after
    /// `generation`. Returns whether it did.
    ///
    /// A request the UI has not taken yet is extended rather than replaced,
    /// and so is one settled less than [`FOLLOW_UP`] ago with the same
    /// action: that is a straggler from the same Explorer gesture, and the UI
    /// gets the whole set again instead of just the late file.
    pub fn settle(&mut self, generation: u64, now: Instant) -> bool {
        if generation != self.generation || self.pending.is_empty() {
            return false;
        }
        let batch = std::mem::take(&mut self.pending);
        let mut request = match self.ready.take() {
            Some(ready) => ready,
            None => match &self.last {
                Some((at, previous))
                    if now.saturating_duration_since(*at) < FOLLOW_UP
                        && previous.action == batch.action =>
                {
                    previous.clone()
                }
                _ => ParsedArgs::default(),
            },
        };
        request.absorb(batch);
        self.last = Some((now, request.clone()));
        self.ready = Some(request);
        true
    }

    /// The settled request, once.
    pub fn take(&mut self) -> Option<LaunchRequest> {
        self.ready.take().map(LaunchRequest::from)
    }
}

#[derive(Debug, Default)]
pub struct LaunchState(Mutex<Inbox>);

impl LaunchState {
    fn with<T>(&self, f: impl FnOnce(&mut Inbox) -> T) -> T {
        f(&mut self.0.lock().unwrap_or_else(PoisonError::into_inner))
    }
}

/// Records one process's command line.
///
/// `arm` starts the quiet-window timer. The first process passes `false`: its
/// own files are read during setup, before the event loop runs, and the other
/// processes Explorer started are queued behind that loop. Timing from setup
/// could hand the first file over alone; [`arm`] starts the timer once the
/// loop is running instead.
pub fn receive<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>, cwd: &Path, arm: bool) {
    let parsed = parse_args(&argv, cwd, Path::is_file);
    if !parsed.is_empty() {
        log::info!(
            "launch: action {:?}, {} file(s), {} skipped",
            parsed.action,
            parsed.files.len(),
            parsed.skipped
        );
    }
    let Some(state) = app.try_state::<LaunchState>() else {
        return;
    };
    let generation = state.with(|inbox| inbox.push(parsed));
    if let (Some(generation), true) = (generation, arm) {
        settle_later(app.clone(), generation);
    }
}

/// Starts the quiet-window timer for whatever arrived before the event loop.
pub fn arm<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<LaunchState>() else {
        return;
    };
    if let Some(generation) = state.with(|inbox| inbox.current()) {
        settle_later(app.clone(), generation);
    }
}

fn settle_later<R: Runtime>(app: AppHandle<R>, generation: u64) {
    std::thread::spawn(move || {
        std::thread::sleep(QUIET_WINDOW);
        let settled = app
            .try_state::<LaunchState>()
            .is_some_and(|state| state.with(|inbox| inbox.settle(generation, Instant::now())));
        if settled {
            if let Err(error) = app.emit(LAUNCH_EVENT, ()) {
                log::warn!("could not announce a launch request: {error}");
            }
        }
    });
}

/// Brings the window forward for a launch forwarded from another process.
pub fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The files Windows handed over, once they have stopped arriving. `None`
/// when there is nothing (yet).
#[tauri::command]
pub fn take_launch_request(state: State<'_, LaunchState>) -> Option<LaunchRequest> {
    let request = state.with(Inbox::take);
    if let Some(request) = &request {
        log::info!(
            "launch: handed over action {:?}, {} file(s), {} skipped",
            request.action,
            request.files.len(),
            request.skipped
        );
    }
    request
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> Instant {
        Instant::now()
    }

    fn cwd() -> PathBuf {
        std::env::temp_dir().join("launch tests")
    }

    /// argv as Windows hands it over: the exe first.
    fn argv(args: &[&str]) -> Vec<String> {
        std::iter::once("iLoathePDF.exe")
            .chain(args.iter().copied())
            .map(String::from)
            .collect()
    }

    /// A fake file system holding `names`, relative to `cwd()`.
    fn files(names: &[&str]) -> impl Fn(&Path) -> bool {
        let keys: HashSet<Vec<String>> = names.iter().map(|n| path_key(&cwd().join(n))).collect();
        move |p: &Path| keys.contains(&path_key(p))
    }

    fn abs(name: &str) -> PathBuf {
        cwd().join(name)
    }

    fn abs_str(name: &str) -> String {
        abs(name).to_string_lossy().into_owned()
    }

    #[test]
    fn plain_files_without_action() {
        let parsed = parse_args(
            argv(&["a.pdf", "b.pdf"]),
            &cwd(),
            files(&["a.pdf", "b.pdf"]),
        );
        assert_eq!(parsed.action, None);
        assert_eq!(parsed.files, vec![abs("a.pdf"), abs("b.pdf")]);
        assert_eq!(parsed.skipped, 0);
    }

    #[test]
    fn action_with_separate_value() {
        let parsed = parse_args(
            argv(&["--action", "image-to-pdf", "photo.jpg"]),
            &cwd(),
            files(&["photo.jpg"]),
        );
        assert_eq!(parsed.action.as_deref(), Some("image-to-pdf"));
        assert_eq!(parsed.files, vec![abs("photo.jpg")]);
    }

    #[test]
    fn action_with_equals_and_after_the_files() {
        let parsed = parse_args(
            argv(&["x.pdf", "--action=compress"]),
            &cwd(),
            files(&["x.pdf"]),
        );
        assert_eq!(parsed.action.as_deref(), Some("compress"));
        assert_eq!(parsed.files, vec![abs("x.pdf")]);
    }

    #[test]
    fn empty_or_dangling_action_is_no_action() {
        let parsed = parse_args(argv(&["--action"]), &cwd(), files(&[]));
        assert_eq!(parsed, ParsedArgs::default());
        let parsed = parse_args(argv(&["--action=", "a.pdf"]), &cwd(), files(&["a.pdf"]));
        assert_eq!(parsed.action, None);
        assert_eq!(parsed.files, vec![abs("a.pdf")]);
    }

    #[test]
    fn first_action_wins() {
        let parsed = parse_args(
            argv(&["--action", "merge", "--action", "split"]),
            &cwd(),
            files(&[]),
        );
        assert_eq!(parsed.action.as_deref(), Some("merge"));
    }

    #[test]
    fn unknown_action_is_passed_through_for_the_ui_to_explain() {
        let parsed = parse_args(argv(&["--action", "make-coffee"]), &cwd(), files(&[]));
        assert_eq!(parsed.action.as_deref(), Some("make-coffee"));
    }

    #[test]
    fn spaces_and_non_ascii_names() {
        let names = ["My Scans", "Résumé 2026.pdf", "दस्तावेज़ फ़ाइल.pdf"];
        let nested = PathBuf::from(names[0]).join("page 1.jpg");
        let nested = nested.to_string_lossy().into_owned();
        let args = [nested.as_str(), names[1], names[2]];
        let parsed = parse_args(argv(&args), &cwd(), files(&args));
        assert_eq!(
            parsed.files,
            vec![abs(&nested), abs(names[1]), abs(names[2])]
        );
    }

    #[test]
    fn absolute_paths_ignore_cwd() {
        let elsewhere = std::env::temp_dir().join("other folder").join("deed.pdf");
        let arg = elsewhere.to_string_lossy().into_owned();
        let target = elsewhere.clone();
        let parsed = parse_args(argv(&[arg.as_str()]), &cwd(), move |p: &Path| {
            path_key(p) == path_key(&target)
        });
        assert_eq!(parsed.files, vec![elsewhere]);
    }

    #[test]
    fn flags_are_ignored_and_not_counted() {
        let parsed = parse_args(
            argv(&[
                "--remote-debugging-port=9222",
                "-v",
                "--edge-webview-switches",
                "a.pdf",
            ]),
            &cwd(),
            files(&["a.pdf"]),
        );
        assert_eq!(parsed.files, vec![abs("a.pdf")]);
        assert_eq!(parsed.skipped, 0);
    }

    #[test]
    fn missing_files_and_folders_are_counted_not_kept() {
        let parsed = parse_args(
            argv(&["gone.pdf", "here.pdf", "Some Folder"]),
            &cwd(),
            files(&["here.pdf"]),
        );
        assert_eq!(parsed.files, vec![abs("here.pdf")]);
        assert_eq!(parsed.skipped, 2);
    }

    #[test]
    fn argv0_and_blank_arguments_are_skipped() {
        let parsed = parse_args(argv(&["", "  "]), &cwd(), |_| true);
        assert_eq!(parsed, ParsedArgs::default());
    }

    #[test]
    fn natural_order() {
        let mut names = vec![
            "scan 10.jpg",
            "Scan 2.jpg",
            "scan 1.jpg",
            "a.jpg",
            "scan 02.jpg",
        ];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(
            names,
            vec![
                "a.jpg",
                "scan 1.jpg",
                "Scan 2.jpg",
                "scan 02.jpg",
                "scan 10.jpg"
            ]
        );
    }

    fn launch(action: Option<&str>, names: &[&str]) -> ParsedArgs {
        ParsedArgs {
            action: action.map(String::from),
            files: names.iter().map(|n| abs(n)).collect(),
            skipped: 0,
        }
    }

    #[test]
    fn near_simultaneous_launches_become_one_request() {
        let mut inbox = Inbox::default();
        let mut generations = Vec::new();
        // Explorer: one process per selected file, in no particular order.
        for name in ["p10.jpg", "p2.jpg", "p1.jpg", "p2.jpg"] {
            generations.push(inbox.push(launch(Some("image-to-pdf"), &[name])).unwrap());
        }
        // Timers for earlier arrivals find a newer generation and do nothing.
        for g in &generations[..generations.len() - 1] {
            assert!(!inbox.settle(*g, now()));
            assert_eq!(inbox.take(), None);
        }
        assert!(inbox.settle(*generations.last().unwrap(), now()));
        assert_eq!(
            inbox.take(),
            Some(LaunchRequest {
                action: Some("image-to-pdf".into()),
                files: vec![abs_str("p1.jpg"), abs_str("p2.jpg"), abs_str("p10.jpg")],
                skipped: 0,
            })
        );
        assert_eq!(inbox.take(), None, "a request is handed over once");
    }

    #[test]
    fn duplicates_differing_only_in_case_are_merged() {
        let mut inbox = Inbox::default();
        inbox.push(launch(None, &["Deed.PDF"]));
        let g = inbox.push(launch(None, &["deed.pdf"])).unwrap();
        assert!(inbox.settle(g, now()));
        assert_eq!(inbox.take().unwrap().files.len(), 1);
    }

    #[test]
    fn first_process_and_forwarded_launches_merge() {
        let mut inbox = Inbox::default();
        // The first process's own argv, recorded during setup (not armed).
        inbox.push(launch(Some("merge"), &["b.pdf"]));
        // Siblings forwarded once the event loop runs.
        inbox.push(launch(Some("merge"), &["a.pdf"]));
        let g = inbox.current().unwrap();
        assert!(inbox.settle(g, now()));
        let request = inbox.take().unwrap();
        assert_eq!(request.action.as_deref(), Some("merge"));
        assert_eq!(request.files, vec![abs_str("a.pdf"), abs_str("b.pdf")]);
    }

    #[test]
    fn untaken_request_is_extended_not_replaced() {
        let mut inbox = Inbox::default();
        let g = inbox.push(launch(Some("merge"), &["a.pdf"])).unwrap();
        assert!(inbox.settle(g, now()));
        let g = inbox.push(launch(Some("merge"), &["c.pdf"])).unwrap();
        assert!(inbox.settle(g, now()));
        assert_eq!(
            inbox.take().unwrap().files,
            vec![abs_str("a.pdf"), abs_str("c.pdf")]
        );
    }

    #[test]
    fn a_straggler_rejoins_the_request_already_handed_over() {
        let mut inbox = Inbox::default();
        let t = now();
        let g = inbox
            .push(launch(Some("merge"), &["b.pdf", "a.pdf"]))
            .unwrap();
        assert!(inbox.settle(g, t));
        assert_eq!(inbox.take().unwrap().files.len(), 2);
        // A slow process from the same selection, plus a repeat of a file.
        inbox.push(launch(Some("merge"), &["c.pdf"]));
        let g = inbox.push(launch(Some("merge"), &["a.pdf"])).unwrap();
        assert!(inbox.settle(g, t + Duration::from_secs(1)));
        assert_eq!(
            inbox.take().unwrap().files,
            vec![abs_str("a.pdf"), abs_str("b.pdf"), abs_str("c.pdf")]
        );
    }

    #[test]
    fn a_later_or_different_launch_starts_afresh() {
        let mut inbox = Inbox::default();
        let t = now();
        let g = inbox.push(launch(Some("merge"), &["a.pdf"])).unwrap();
        assert!(inbox.settle(g, t));
        inbox.take();
        // Same action, but well after the first one.
        let g = inbox.push(launch(Some("merge"), &["b.pdf"])).unwrap();
        assert!(inbox.settle(g, t + FOLLOW_UP + Duration::from_secs(1)));
        assert_eq!(inbox.take().unwrap().files, vec![abs_str("b.pdf")]);
        // Straight after, but a different action.
        let g = inbox.push(launch(Some("compress"), &["c.pdf"])).unwrap();
        assert!(inbox.settle(g, t + FOLLOW_UP + Duration::from_secs(2)));
        let request = inbox.take().unwrap();
        assert_eq!(request.action.as_deref(), Some("compress"));
        assert_eq!(request.files, vec![abs_str("c.pdf")]);
    }

    #[test]
    fn empty_launch_is_not_a_request() {
        let mut inbox = Inbox::default();
        assert_eq!(inbox.push(ParsedArgs::default()), None);
        assert_eq!(inbox.current(), None);
        assert!(!inbox.settle(0, now()));
        assert_eq!(inbox.take(), None);
    }

    #[test]
    fn skipped_counts_add_up() {
        let mut inbox = Inbox::default();
        inbox.push(ParsedArgs {
            skipped: 2,
            ..ParsedArgs::default()
        });
        let g = inbox
            .push(ParsedArgs {
                skipped: 1,
                ..launch(None, &["a.pdf"])
            })
            .unwrap();
        assert!(inbox.settle(g, now()));
        let request = inbox.take().unwrap();
        assert_eq!(request.skipped, 3);
        assert_eq!(request.files, vec![abs_str("a.pdf")]);
    }

    #[test]
    fn request_serialises_for_the_ui() {
        let request = LaunchRequest {
            action: Some("merge".into()),
            files: vec!["x".into()],
            skipped: 1,
        };
        assert_eq!(
            serde_json::to_value(&request).unwrap(),
            serde_json::json!({ "action": "merge", "files": ["x"], "skipped": 1 })
        );
    }
}
