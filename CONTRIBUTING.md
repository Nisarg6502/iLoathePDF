# Contributing to iLoathePDF

Thanks for wanting to help. Bug reports, tool ideas, translations of the
docs and code are all welcome.

The one rule that shapes everything: **a user's files must never leave their
machine.** A change that adds a network call, analytics, a remote font or a CDN
script won't be merged, however useful. If you're unsure, open an issue first.

## Ways to contribute

- **Report a bug or suggest a tool** with an [issue](https://github.com/Nisarg6502/iLoathePDF/issues/new/choose).
  Include the app version, Windows version (desktop) or browser (web), and
  steps to reproduce. Don't attach real personal documents.
- **Report a security problem privately**, see [SECURITY.md](SECURITY.md).
- **Send a pull request.** For anything bigger than a small fix, please open an
  issue first so we agree on the approach before you spend the time.

## Setting up

```bash
git clone https://github.com/Nisarg6502/iLoathePDF.git
cd iLoathePDF
npm install                       # both apps (npm workspaces)
git config core.hooksPath .githooks   # refuses accidental pushes to main
```

- **Web app:** `npm run dev --workspace=apps/web`. The OCR tool needs the
  vendored Tesseract files described in the [README](README.md#getting-set-up).
- **Desktop app:** needs Node 22, Python 3.11, Rust (MSVC toolchain) and
  Ghostscript. See [apps/desktop/README.md](apps/desktop/README.md).

## Before you open a pull request

Branch from `main` (direct pushes to `main` are blocked) and make sure the
checks CI runs pass locally:

```bash
npm run lint --workspace=apps/desktop
npm run typecheck --workspace=apps/desktop
npm run check:version --workspace=apps/desktop
npm run typecheck --workspace=apps/web
npm run test --workspace=apps/web

# document engine
cd apps/desktop && python -m pytest

# Rust shell
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Then:

1. Keep the pull request focused, one change per PR.
2. Add or update tests. Every tool has engine tests (Python for the desktop,
   Vitest for the web).
3. If you touch user-visible behaviour, update the README and
   [CHANGELOG.md](CHANGELOG.md).
4. A desktop-app change that ships in a release also bumps the version in every
   place `npm run check:version` checks, and adds an entry to
   `apps/desktop/src/lib/changelog.ts`.
5. Pull requests are squash-merged once the required checks pass.

## Style

- TypeScript and Python are formatted the way the surrounding code is; the
  linters (`oxlint`, `cargo fmt`, `clippy`) are the arbiter.
- Comments explain *why*, not what. Prefer plain, specific error messages a
  non-technical person can act on.
- New dependencies need a reason. Check the license is compatible (MIT, Apache,
  BSD or similar) and add it to
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) if it ships to users.

## Conduct

Everyone taking part is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
