//! macOS: the Finder right-click menu, as Quick Actions.
//!
//! Windows gets its right-click menu from the installer (windows/
//! context-menu.nsh). A Mac .dmg has no install step, so the app puts the
//! menu in place itself: one Automator Quick Action per item, written to
//! `~/Library/Services/iLoathePDF-<run|action>-<id>.workflow`. Finder lists
//! them under Quick Actions in the right-click menu (and in the Services
//! menu), only for the file types each one names.
//!
//! Every item runs the app with the same launch contract as Windows
//! (launch.rs):
//!
//! ```text
//! open -n -g -a <app> --args --run <quick-action-id> <file> ...
//! open -n -a <app> --args --action <tool-id> <file> ...
//! ```
//!
//! `open -n` always starts a fresh process through Launch Services. When the
//! app is already running, that process hands its command line to the
//! running one (the single-instance plugin) and exits, exactly as on
//! Windows; otherwise it becomes the app. `-g` leaves Finder in front for
//! the in-place actions, which only show the small progress card.
//!
//! The UI owns the list and the labels (src/lib/finderActions.ts), so the
//! menu speaks the app's language, and calls [`set_finder_actions`] at every
//! start and whenever the list or the language changes: that also repoints
//! the items when the app has been moved. Files are only rewritten when
//! their contents change. A Settings switch removes them all.
//!
//! The generators below are plain functions with no macOS dependency, so
//! they are unit-tested on every platform.

use std::path::{Path, PathBuf};

use serde::Deserialize;

/// Every bundle this app writes starts with this, and nothing else in
/// ~/Library/Services is ever touched.
const PREFIX: &str = "iLoathePDF-";
const SUFFIX: &str = ".workflow";

/// One right-click item, as the UI sends it.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct FinderAction {
    /// "run" (do it in place) or "action" (open the app on a tool).
    pub flag: String,
    /// A quick action id (src/lib/quickActions.ts) or a tool id
    /// (src/lib/tools.ts).
    pub id: String,
    /// The menu text, already translated.
    pub label: String,
    /// Uniform type identifiers the item is offered for, e.g. com.adobe.pdf.
    pub types: Vec<String>,
}

impl FinderAction {
    fn bundle_name(&self) -> String {
        format!("{PREFIX}{}-{}{SUFFIX}", self.flag, self.id)
    }

    /// Rejects anything that would not make a safe file name or command
    /// line, so a bad list from the UI can never write outside the bundle
    /// or inject into the script.
    fn validate(&self) -> Result<(), String> {
        let plain = |s: &str| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        };
        if self.flag != "run" && self.flag != "action" {
            return Err(format!("unknown flag {:?}", self.flag));
        }
        if !plain(&self.id) {
            return Err(format!("bad id {:?}", self.id));
        }
        if self.label.trim().is_empty() || self.label.chars().any(char::is_control) {
            return Err(format!("bad label for {}", self.id));
        }
        let uti = |s: &String| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        };
        if self.types.is_empty() || !self.types.iter().all(uti) {
            return Err(format!("bad file types for {}", self.id));
        }
        Ok(())
    }
}

/// Text that goes inside a plist `<string>`.
fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// A single-quoted shell word: safe for any path.
fn shell_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

/// The script the Quick Action runs; Finder passes the selected files as
/// its arguments, each an absolute path.
pub fn script(action: &FinderAction, app: &Path) -> String {
    let app = shell_quote(&app.to_string_lossy());
    // In place: leave Finder in front. Opening a tool: bring the app up.
    let background = if action.flag == "run" { " -g" } else { "" };
    format!(
        "# Written by iLoathePDF; Settings > Finder right-click menu removes it.\n\
         app={app}\n\
         [ -d \"$app\" ] || exit 0\n\
         exec /usr/bin/open -n{background} -a \"$app\" --args --{flag} {id} \"$@\"\n",
        flag = action.flag,
        id = action.id,
    )
}

const PLIST_HEAD: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
"#;

/// Contents/Info.plist: what Finder reads to decide where the item shows.
pub fn info_plist(action: &FinderAction) -> String {
    let types: String = action
        .types
        .iter()
        .map(|t| format!("\t\t\t\t<string>{}</string>\n", xml_escape(t)))
        .collect();
    format!(
        "{PLIST_HEAD}<dict>
\t<key>NSServices</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSBackgroundColorName</key>
\t\t\t<string>background</string>
\t\t\t<key>NSIconName</key>
\t\t\t<string>NSActionTemplate</string>
\t\t\t<key>NSMenuItem</key>
\t\t\t<dict>
\t\t\t\t<key>default</key>
\t\t\t\t<string>{label}</string>
\t\t\t</dict>
\t\t\t<key>NSMessage</key>
\t\t\t<string>runWorkflowAsService</string>
\t\t\t<key>NSRequiredContext</key>
\t\t\t<dict>
\t\t\t\t<key>NSApplicationIdentifier</key>
\t\t\t\t<string>com.apple.finder</string>
\t\t\t</dict>
\t\t\t<key>NSSendFileTypes</key>
\t\t\t<array>
{types}\t\t\t</array>
\t\t</dict>
\t</array>
</dict>
</plist>
",
        label = xml_escape(&action.label),
    )
}

/// A stable UUID-shaped string per item and role, so rewriting the same
/// item produces the same bytes (and no needless Services refresh).
fn stable_uuid(seed: &str) -> String {
    // FNV-1a, twice with different offsets, for 128 bits.
    let hash = |offset: u64| {
        seed.bytes().fold(offset, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
        })
    };
    let (a, b) = (hash(0xcbf2_9ce4_8422_2325), hash(0x6c62_272e_07bb_0142));
    let hex = format!("{a:016X}{b:016X}");
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

/// Contents/document.wflow: an Automator workflow of one "Run Shell Script"
/// action that takes Finder's selection as arguments (inputMethod 1).
pub fn document_wflow(action: &FinderAction, app: &Path) -> String {
    let seed = format!("{}-{}", action.flag, action.id);
    format!(
        "{PLIST_HEAD}<dict>
\t<key>AMApplicationBuild</key>
\t<string>523</string>
\t<key>AMApplicationVersion</key>
\t<string>2.10</string>
\t<key>AMDocumentVersion</key>
\t<string>2</string>
\t<key>actions</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<dict>
\t\t\t\t<key>AMAccepts</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>Container</key>
\t\t\t\t\t<string>List</string>
\t\t\t\t\t<key>Optional</key>
\t\t\t\t\t<true/>
\t\t\t\t\t<key>Types</key>
\t\t\t\t\t<array>
\t\t\t\t\t\t<string>com.apple.cocoa.string</string>
\t\t\t\t\t</array>
\t\t\t\t</dict>
\t\t\t\t<key>AMActionVersion</key>
\t\t\t\t<string>2.0.3</string>
\t\t\t\t<key>AMApplication</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Automator</string>
\t\t\t\t</array>
\t\t\t\t<key>AMParameterProperties</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>COMMAND_STRING</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>CheckedForUserDefaultShell</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>inputMethod</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>shell</key>
\t\t\t\t\t<dict/>
\t\t\t\t\t<key>source</key>
\t\t\t\t\t<dict/>
\t\t\t\t</dict>
\t\t\t\t<key>AMProvides</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>Container</key>
\t\t\t\t\t<string>List</string>
\t\t\t\t\t<key>Types</key>
\t\t\t\t\t<array>
\t\t\t\t\t\t<string>com.apple.cocoa.string</string>
\t\t\t\t\t</array>
\t\t\t\t</dict>
\t\t\t\t<key>ActionBundlePath</key>
\t\t\t\t<string>/System/Library/Automator/Run Shell Script.action</string>
\t\t\t\t<key>ActionName</key>
\t\t\t\t<string>Run Shell Script</string>
\t\t\t\t<key>ActionParameters</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>COMMAND_STRING</key>
\t\t\t\t\t<string>{command}</string>
\t\t\t\t\t<key>CheckedForUserDefaultShell</key>
\t\t\t\t\t<true/>
\t\t\t\t\t<key>inputMethod</key>
\t\t\t\t\t<integer>1</integer>
\t\t\t\t\t<key>shell</key>
\t\t\t\t\t<string>/bin/sh</string>
\t\t\t\t\t<key>source</key>
\t\t\t\t\t<string></string>
\t\t\t\t</dict>
\t\t\t\t<key>BundleIdentifier</key>
\t\t\t\t<string>com.apple.RunShellScript</string>
\t\t\t\t<key>CFBundleVersion</key>
\t\t\t\t<string>2.0.3</string>
\t\t\t\t<key>CanShowSelectedItemsWhenRun</key>
\t\t\t\t<false/>
\t\t\t\t<key>CanShowWhenRun</key>
\t\t\t\t<true/>
\t\t\t\t<key>Category</key>
\t\t\t\t<array>
\t\t\t\t\t<string>AMCategoryUtilities</string>
\t\t\t\t</array>
\t\t\t\t<key>Class Name</key>
\t\t\t\t<string>RunShellScriptAction</string>
\t\t\t\t<key>InputUUID</key>
\t\t\t\t<string>{input_uuid}</string>
\t\t\t\t<key>Keywords</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Shell</string>
\t\t\t\t\t<string>Script</string>
\t\t\t\t\t<string>Command</string>
\t\t\t\t\t<string>Run</string>
\t\t\t\t\t<string>Unix</string>
\t\t\t\t</array>
\t\t\t\t<key>OutputUUID</key>
\t\t\t\t<string>{output_uuid}</string>
\t\t\t\t<key>UUID</key>
\t\t\t\t<string>{uuid}</string>
\t\t\t\t<key>UnlocalizedApplications</key>
\t\t\t\t<array>
\t\t\t\t\t<string>Automator</string>
\t\t\t\t</array>
\t\t\t\t<key>isViewVisible</key>
\t\t\t\t<integer>1</integer>
\t\t\t\t<key>location</key>
\t\t\t\t<string>309.000000:316.000000</string>
\t\t\t\t<key>nibPath</key>
\t\t\t\t<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
\t\t\t</dict>
\t\t\t<key>isViewVisible</key>
\t\t\t<integer>1</integer>
\t\t</dict>
\t</array>
\t<key>connectors</key>
\t<dict/>
\t<key>workflowMetaData</key>
\t<dict>
\t\t<key>applicationBundleID</key>
\t\t<string>com.apple.finder</string>
\t\t<key>applicationBundleIDsByPath</key>
\t\t<dict>
\t\t\t<key>/System/Library/CoreServices/Finder.app</key>
\t\t\t<string>com.apple.finder</string>
\t\t</dict>
\t\t<key>applicationPath</key>
\t\t<string>/System/Library/CoreServices/Finder.app</string>
\t\t<key>applicationPaths</key>
\t\t<array>
\t\t\t<string>/System/Library/CoreServices/Finder.app</string>
\t\t</array>
\t\t<key>inputTypeIdentifier</key>
\t\t<string>com.apple.Automator.fileSystemObject</string>
\t\t<key>outputTypeIdentifier</key>
\t\t<string>com.apple.Automator.nothing</string>
\t\t<key>presentationMode</key>
\t\t<integer>15</integer>
\t\t<key>processesInput</key>
\t\t<false/>
\t\t<key>serviceApplicationBundleID</key>
\t\t<string>com.apple.finder</string>
\t\t<key>serviceApplicationPath</key>
\t\t<string>/System/Library/CoreServices/Finder.app</string>
\t\t<key>serviceInputTypeIdentifier</key>
\t\t<string>com.apple.Automator.fileSystemObject</string>
\t\t<key>serviceOutputTypeIdentifier</key>
\t\t<string>com.apple.Automator.nothing</string>
\t\t<key>serviceProcessesInput</key>
\t\t<false/>
\t\t<key>systemImageName</key>
\t\t<string>NSActionTemplate</string>
\t\t<key>useAutomaticInputType</key>
\t\t<false/>
\t\t<key>workflowTypeIdentifier</key>
\t\t<string>com.apple.Automator.servicesMenu</string>
\t</dict>
</dict>
</plist>
",
        command = xml_escape(&script(action, app)),
        input_uuid = stable_uuid(&format!("{seed}/input")),
        output_uuid = stable_uuid(&format!("{seed}/output")),
        uuid = stable_uuid(&format!("{seed}/action")),
    )
}

/// Writes `contents` to `path` unless it already holds exactly that.
/// Returns whether anything changed.
fn write_if_changed(path: &Path, contents: &str) -> std::io::Result<bool> {
    if std::fs::read(path).ok().as_deref() == Some(contents.as_bytes()) {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, contents)?;
    Ok(true)
}

/// Brings `services` (a ~/Library/Services folder) in line with `actions`
/// for the app at `app`: writes or updates each item's bundle and removes
/// any other bundle of ours (an item the list dropped, or all of them when
/// `actions` is empty). Returns whether anything changed.
pub fn sync(services: &Path, app: &Path, actions: &[FinderAction]) -> Result<bool, String> {
    for action in actions {
        action.validate()?;
    }
    let wanted: Vec<String> = actions.iter().map(FinderAction::bundle_name).collect();
    let mut changed = false;

    if let Ok(entries) = std::fs::read_dir(services) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with(PREFIX) && name.ends_with(SUFFIX) && !wanted.contains(&name) {
                std::fs::remove_dir_all(entry.path())
                    .map_err(|e| format!("could not remove {name}: {e}"))?;
                changed = true;
            }
        }
    }

    for action in actions {
        let contents = services.join(action.bundle_name()).join("Contents");
        let io = |e: std::io::Error| format!("could not write {}: {e}", action.bundle_name());
        changed |= write_if_changed(&contents.join("Info.plist"), &info_plist(action)).map_err(io)?;
        changed |= write_if_changed(&contents.join("document.wflow"), &document_wflow(action, app))
            .map_err(io)?;
    }
    Ok(changed)
}

/// The .app bundle this process runs from:
/// `<x>.app/Contents/MacOS/<binary>` -> `<x>.app`. `None` for a dev build.
fn app_bundle(exe: &Path) -> Option<PathBuf> {
    let app = exe.parent()?.parent()?.parent()?;
    let is_app = app.extension().is_some_and(|e| e == "app")
        && exe.parent()?.file_name()? == "MacOS"
        && exe.parent()?.parent()?.file_name()? == "Contents";
    is_app.then(|| app.to_path_buf())
}

/// Puts the Finder menu in place (`enabled`) or takes it away. Returns
/// whether anything changed. macOS only; an error elsewhere.
#[tauri::command]
pub fn set_finder_actions(enabled: bool, actions: Vec<FinderAction>) -> Result<bool, String> {
    if !cfg!(target_os = "macos") {
        return Err("the Finder menu exists only on macOS".into());
    }
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    let services = PathBuf::from(home).join("Library").join("Services");
    let actions = if enabled { actions } else { Vec::new() };
    let app = if actions.is_empty() {
        // Removing needs no app path.
        PathBuf::new()
    } else {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        app_bundle(&exe).ok_or("not running from an .app bundle (a development build?)")?
    };
    let changed = sync(&services, &app, &actions)?;
    if changed {
        log::info!(
            "finder: {} quick action(s) in {}",
            actions.len(),
            services.display()
        );
        // Tell the system's Services list to look again, so Finder shows
        // the change now rather than after the next login.
        if let Err(error) = std::process::Command::new("/System/Library/CoreServices/pbs")
            .arg("-update")
            .status()
        {
            log::warn!("could not refresh the Services list: {error}");
        }
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn action(flag: &str, id: &str, label: &str) -> FinderAction {
        FinderAction {
            flag: flag.into(),
            id: id.into(),
            label: label.into(),
            types: vec!["com.adobe.pdf".into()],
        }
    }

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("iloathepdf-finder-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn script_runs_the_launch_contract_on_the_selection() {
        let app = Path::new("/Applications/iLoathePDF.app");
        let run = script(&action("run", "compress", "x"), app);
        assert!(run.contains("app='/Applications/iLoathePDF.app'\n"));
        assert!(run.contains(
            "exec /usr/bin/open -n -g -a \"$app\" --args --run compress \"$@\"\n"
        ));
        let open = script(&action("action", "split", "x"), app);
        assert!(open.contains("exec /usr/bin/open -n -a \"$app\" --args --action split \"$@\"\n"));
    }

    #[test]
    fn odd_app_paths_stay_one_shell_word() {
        let s = script(&action("run", "compress", "x"), Path::new("/Users/o'neil/Apps/i L.app"));
        assert!(s.contains(r"app='/Users/o'\''neil/Apps/i L.app'"));
    }

    #[test]
    fn labels_and_paths_are_escaped_in_the_plists() {
        let a = action("run", "compress", "Compress <fast> & \"small\"");
        let info = info_plist(&a);
        assert!(info.contains("<string>Compress &lt;fast&gt; &amp; &quot;small&quot;</string>"));
        assert!(info.contains("<string>com.adobe.pdf</string>"));
        let doc = document_wflow(&a, Path::new("/A&B/iLoathePDF.app"));
        assert!(doc.contains("app='/A&amp;B/iLoathePDF.app'"));
        assert!(doc.contains("&quot;$@&quot;"));
    }

    #[test]
    fn the_same_item_always_produces_the_same_bytes() {
        let a = action("run", "compress", "Compress");
        let app = Path::new("/Applications/iLoathePDF.app");
        assert_eq!(document_wflow(&a, app), document_wflow(&a, app));
        assert_ne!(
            document_wflow(&a, app),
            document_wflow(&action("action", "compress", "Compress"), app)
        );
        let uuid = stable_uuid("x");
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid.matches('-').count(), 4);
    }

    #[test]
    fn bad_items_are_refused_before_anything_is_written() {
        let dir = scratch_dir("refuse");
        let app = Path::new("/Applications/iLoathePDF.app");
        for bad in [
            action("exec", "compress", "x"),
            action("run", "../../evil", "x"),
            action("run", "Compress", "x"),
            action("run", "compress", "two\nlines"),
            FinderAction { types: vec![], ..action("run", "compress", "x") },
            FinderAction { types: vec!["a b".into()], ..action("run", "compress", "x") },
        ] {
            assert!(sync(&dir, app, &[action("run", "ok", "x"), bad]).is_err());
        }
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn sync_writes_updates_and_removes_only_our_bundles() {
        let dir = scratch_dir("sync");
        let app = Path::new("/Applications/iLoathePDF.app");
        let mine = dir.join("Someone else's.workflow");
        std::fs::create_dir_all(&mine).unwrap();

        let both = [action("run", "compress", "Compress"), action("action", "split", "Split…")];
        assert!(sync(&dir, app, &both).unwrap());
        let info = dir.join("iLoathePDF-run-compress.workflow/Contents/Info.plist");
        assert!(std::fs::read_to_string(&info).unwrap().contains("Compress"));
        assert!(dir
            .join("iLoathePDF-action-split.workflow/Contents/document.wflow")
            .is_file());

        assert!(!sync(&dir, app, &both).unwrap(), "nothing new to write");

        let renamed = [action("run", "compress", "Comprimir")];
        assert!(sync(&dir, app, &renamed).unwrap());
        assert!(std::fs::read_to_string(&info).unwrap().contains("Comprimir"));
        assert!(!dir.join("iLoathePDF-action-split.workflow").exists());

        assert!(sync(&dir, Path::new(""), &[]).unwrap());
        assert!(!dir.join("iLoathePDF-run-compress.workflow").exists());
        assert!(mine.is_dir(), "other people's Quick Actions are left alone");
        assert!(!sync(&dir, Path::new(""), &[]).unwrap());
    }

    #[test]
    fn app_bundle_is_found_only_inside_an_app() {
        assert_eq!(
            app_bundle(Path::new("/Applications/iLoathePDF.app/Contents/MacOS/iLoathePDF")),
            Some(PathBuf::from("/Applications/iLoathePDF.app"))
        );
        assert_eq!(app_bundle(Path::new("/src/target/debug/iloathepdf")), None);
    }
}
