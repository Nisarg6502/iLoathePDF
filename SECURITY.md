# Security policy

iLoathePDF exists because people don't want to hand their documents to a
stranger's server, so security reports are taken seriously.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.** Report it
privately instead:

1. Go to the [Security tab](https://github.com/Nisarg6502/iLoathePDF/security/advisories/new)
   and choose **Report a vulnerability**.
2. Describe what you found, the version (Settings → About in the desktop app,
   or the page URL for the web app), and how to reproduce it. A small sample
   file helps. **Please don't attach real personal documents.**

You'll get an acknowledgement within a few days. This is a small, volunteer
project, so there's no formal SLA, but confirmed vulnerabilities are fixed
ahead of everything else and credited in the release notes unless you'd
rather stay anonymous.

## Supported versions

Only the **latest release** of the desktop app and the **current web app** on
GitHub Pages receive fixes. The desktop app can update itself (opt-in, in
Settings), so please update before reporting.

## What is in scope

- The desktop app (Tauri shell, the Python document engine, the bundled
  Ghostscript and Tesseract) and its signed update mechanism.
- The web app at <https://nisarg6502.github.io/iLoathePDF/>.
- Anything that would make a file leave the user's machine, or run code
  because of a crafted PDF, image, ZIP or HTML input.
- The release pipeline (workflows that build and sign the installer).

Out of scope: vulnerabilities in third-party software that iLoathePDF merely
bundles, unless iLoathePDF's use of it makes it exploitable (please report
those upstream too), and issues that need an already-compromised machine.

## The security model, briefly

- **Your files never leave your machine.** The web app has no backend and a
  request counter on every tool page proves it. The desktop app has exactly one
  network feature, an update check that is **off by default**, and it never
  touches your files.
- **Updates are signed.** The desktop app only installs an update whose
  signature verifies against a public key compiled into the app.
- **The document engine has no network code.** It's a separate process that
  reads and writes local files and speaks JSON on stdin/stdout.
- **Untrusted input is expected.** Ghostscript runs with `-dSAFER`, archives
  are size-limited and extracted to scratch names (never to paths taken from
  the archive), and all paths handed to the engine must be absolute.

## How the repository is watched

Dependabot keeps npm, Cargo, pip and GitHub Actions dependencies current,
and the [Security workflow](.github/workflows/security.yml) runs CodeQL,
`npm audit`, `pip-audit` and `cargo audit` on every pull request and weekly.
Secret scanning with push protection is on. Any advisory that has been
reviewed and deliberately ignored is listed, with the reason, in
[`apps/desktop/src-tauri/.cargo/audit.toml`](apps/desktop/src-tauri/.cargo/audit.toml).
