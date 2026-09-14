# Protect & Unlock PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Protect & Unlock PDF" tool (set/remove an AES-256 open password) to both the desktop app and the website.

**Architecture:** Desktop gets a new Python sidecar op (`pdf.protect`, pikepdf) plus the usual tools.ts/jobs.ts/run.ts/OptionsPanel.tsx wiring. Web gets a new engine (`protect.ts`) built on `@pdfsmaller/pdf-encrypt` / `@pdfsmaller/pdf-decrypt` (pure JS, Web Crypto API, `pdf-lib` peer dep already present) plus the usual registry.tsx/OptionsPanel/icon/tint wiring. Both surfaces expose one tool with a Protect/Unlock mode toggle.

**Tech Stack:** Python 3.11 + pikepdf (desktop sidecar), TypeScript/React 19 + `@pdfsmaller/pdf-encrypt`/`@pdfsmaller/pdf-decrypt` (web), TypeScript/React 19 + Tauri invoke (desktop UI).

## Global Constraints

- Op name: `pdf.protect`. Params: `{"input": str, "output": str, "mode": "protect"|"unlock", "password": str}`. Result: `{"output": str, "bytes": int}`. (Design: `docs/superpowers/specs/2026-09-14-protect-unlock-pdf-design.md`.)
- New protocol error code: `WRONG_PASSWORD` (unlock, password doesn't match).
- Minimum password length: 4 characters, enforced both client-side (UI) and at the op boundary (`BAD_PARAMS`).
- Protecting an already-encrypted file is refused (`ENCRYPTED_PDF`) — user must unlock first. This is existing `open_pdf()` behavior, not new code.
- Owner password always equals the user password (no separate permissions UI in v1).
- Web dependency versions (checked against npm on 2026-09-14): `@pdfsmaller/pdf-encrypt@^1.2.0`, `@pdfsmaller/pdf-decrypt@^1.0.1`.
- New tint key `"i"`, hue 230 (the largest open gap between the existing 8 hues), added to both apps' CSS and tint-key types.

---

### Task 1: Desktop sidecar op `pdf.protect`

**Files:**
- Modify: `apps/desktop/sidecar/ops/_common.py`
- Create: `apps/desktop/sidecar/ops/pdf_protect.py`
- Modify: `apps/desktop/sidecar/main.py:26-36` (DISPATCH table)
- Modify: `apps/desktop/sidecar/PROTOCOL.md`
- Modify: `apps/desktop/sidecar/tests/test_common.py`
- Create: `apps/desktop/sidecar/tests/test_pdf_protect.py`

**Interfaces:**
- Consumes: `_common.py`'s `require`, `one_of`, `existing_file`, `open_pdf`, `atomic_output`, `size_of`, `OpError`, `ProgressFn` (all already exist).
- Produces: `ops.pdf_protect.run(params: dict, progress: ProgressFn) -> dict`, registered in `main.py`'s `DISPATCH` under op name `"pdf.protect"`. Also produces `_common.open_pdf_with_password(path: Path, password: str)`, a pikepdf-open-with-password helper other ops don't need but this one does.
- This task does not touch any TypeScript file. Tasks 2 and 4 depend only on the frozen param/result contract above, not on this task's code, so all three can run in parallel.

- [ ] **Step 1: Write the failing helper test**

Add to the end of `apps/desktop/sidecar/tests/test_common.py`:

```python
def test_open_pdf_with_password_round_trips(tmp_path):
    import pikepdf

    from ops._common import open_pdf_with_password

    plain = tmp_path / "plain.pdf"
    with pikepdf.Pdf.new() as pdf:
        pdf.add_blank_page()
        pdf.save(str(plain))

    protected = tmp_path / "protected.pdf"
    with pikepdf.open(str(plain)) as pdf:
        pdf.save(str(protected), encryption=pikepdf.Encryption(owner="o", user="o", R=6))

    with open_pdf_with_password(protected, "o") as pdf:
        assert len(pdf.pages) == 1


def test_open_pdf_with_password_rejects_wrong_password(tmp_path):
    import pikepdf

    from ops._common import open_pdf_with_password

    plain = tmp_path / "plain.pdf"
    with pikepdf.Pdf.new() as pdf:
        pdf.add_blank_page()
        pdf.save(str(plain))

    protected = tmp_path / "protected.pdf"
    with pikepdf.open(str(plain)) as pdf:
        pdf.save(str(protected), encryption=pikepdf.Encryption(owner="o", user="o", R=6))

    with pytest.raises(OpError) as exc:
        open_pdf_with_password(protected, "wrong")
    assert exc.value.code == "WRONG_PASSWORD"
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest sidecar/tests/test_common.py -v -k open_pdf_with_password`
Expected: FAIL — `ImportError: cannot import name 'open_pdf_with_password'`

- [ ] **Step 3: Implement `open_pdf_with_password`**

Add to `apps/desktop/sidecar/ops/_common.py`, directly after `open_pdf` (after line 193):

```python
def open_pdf_with_password(path: Path, password: str):
    """pikepdf.open with a password, protocol-shaped errors.

    Only pdf.protect's unlock mode calls this -- every other op treats a
    password-protected input as unsupported (ENCRYPTED_PDF via open_pdf).
    """
    import pikepdf

    try:
        return pikepdf.open(str(path), password=password)
    except pikepdf.PasswordError as exc:
        raise OpError("WRONG_PASSWORD", "Incorrect password") from exc
    except pikepdf.PdfError as exc:
        raise OpError("CORRUPT_PDF", f"{path.name} could not be read: {exc}") from exc
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest sidecar/tests/test_common.py -v -k open_pdf_with_password`
Expected: PASS (2 tests). A `UserWarning` about an unneeded password may print for unrelated existing tests — ignore it, it's pikepdf's own warning, not a failure.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/sidecar/ops/_common.py apps/desktop/sidecar/tests/test_common.py
git commit -m "feat(desktop): add open_pdf_with_password sidecar helper"
```

- [ ] **Step 6: Write the failing op tests**

Create `apps/desktop/sidecar/tests/test_pdf_protect.py`:

```python
"""Tests for pdf.protect."""
import pytest

from ops._common import OpError, noop_progress
from ops.pdf_protect import run


def test_protect_then_unlock_round_trips_content(make_pdf, out_dir):
    import pikepdf

    src = make_pdf("a", pages=3)
    protected = out_dir / "protected.pdf"
    run(
        {"input": str(src), "output": str(protected), "mode": "protect", "password": "secret1"},
        noop_progress,
    )

    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(str(protected))

    unlocked = out_dir / "unlocked.pdf"
    result = run(
        {"input": str(protected), "output": str(unlocked), "mode": "unlock", "password": "secret1"},
        noop_progress,
    )
    assert result["output"] == str(unlocked)
    assert result["bytes"] > 0
    with pikepdf.open(str(unlocked)) as pdf:
        assert len(pdf.pages) == 3


def test_protect_rejects_already_encrypted_input(encrypted_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(encrypted_pdf), "output": str(out_dir / "o.pdf"),
             "mode": "protect", "password": "secret1"},
            noop_progress,
        )
    assert exc.value.code == "ENCRYPTED_PDF"


def test_unlock_rejects_wrong_password(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    protected = out_dir / "protected.pdf"
    run(
        {"input": str(src), "output": str(protected), "mode": "protect", "password": "correct-pw"},
        noop_progress,
    )

    with pytest.raises(OpError) as exc:
        run(
            {"input": str(protected), "output": str(out_dir / "o.pdf"),
             "mode": "unlock", "password": "wrong-pw"},
            noop_progress,
        )
    assert exc.value.code == "WRONG_PASSWORD"


def test_unlock_on_non_encrypted_input_is_a_harmless_no_op(make_pdf, out_dir):
    # pikepdf.open(path, password=...) on an unencrypted file just opens it
    # and ignores the password (verified against pikepdf 10.12.0), so unlock
    # on a plain PDF succeeds rather than erroring.
    src = make_pdf("a", pages=1)
    result = run(
        {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "unlock", "password": "whatever"},
        noop_progress,
    )
    assert result["bytes"] > 0


@pytest.mark.parametrize("password", ["", "abc", None])
def test_rejects_short_or_missing_password(make_pdf, out_dir, password):
    src = make_pdf("a", pages=1)
    params = {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "protect"}
    if password is not None:
        params["password"] = password
    with pytest.raises(OpError) as exc:
        run(params, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


@pytest.mark.parametrize("mode", ["lock", "", None])
def test_rejects_bad_mode(make_pdf, out_dir, mode):
    src = make_pdf("a", pages=1)
    params = {"input": str(src), "output": str(out_dir / "o.pdf"), "password": "secret1"}
    if mode is not None:
        params["mode"] = mode
    with pytest.raises(OpError) as exc:
        run(params, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


def test_missing_input_file(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(tmp_path / "ghost.pdf"), "output": str(out_dir / "o.pdf"),
             "mode": "protect", "password": "secret1"},
            noop_progress,
        )
    assert exc.value.code == "FILE_NOT_FOUND"


def test_corrupt_input(corrupt_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(corrupt_pdf), "output": str(out_dir / "o.pdf"),
             "mode": "protect", "password": "secret1"},
            noop_progress,
        )
    assert exc.value.code == "CORRUPT_PDF"


def test_progress_is_reported(make_pdf, out_dir):
    calls = []
    src = make_pdf("a", pages=1)
    run(
        {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "protect", "password": "secret1"},
        lambda pct, note="": calls.append((pct, note)),
    )
    assert calls
    assert calls[-1][0] == 100
```

- [ ] **Step 7: Run to confirm it fails**

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest sidecar/tests/test_pdf_protect.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ops.pdf_protect'`

- [ ] **Step 8: Implement `pdf_protect.py`**

Create `apps/desktop/sidecar/ops/pdf_protect.py`:

```python
"""pdf.protect -- add or remove a password on a PDF. See PROTOCOL.md.

protect: open_pdf() already rejects an already-encrypted input with
ENCRYPTED_PDF, so re-protecting a protected file is refused rather than
silently juggling two passwords -- unlock first, then protect again.

unlock: opens with the supplied password (WRONG_PASSWORD if it matches
neither the user nor owner password) and re-saves with no encryption.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    one_of,
    open_pdf,
    open_pdf_with_password,
    require,
    size_of,
)

MODES = ("protect", "unlock")
MIN_PASSWORD_LENGTH = 4


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    mode = one_of(params, "mode", MODES)
    password = require(params, "password")
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        raise OpError("BAD_PARAMS", f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    progress(5, f"Reading {src.name}")

    if mode == "protect":
        import pikepdf

        with open_pdf(src) as pdf:
            progress(40, "Encrypting")
            with atomic_output(dest) as tmp:
                pdf.save(
                    str(tmp),
                    encryption=pikepdf.Encryption(owner=password, user=password, R=6),
                )
    else:
        with open_pdf_with_password(src, password) as pdf:
            progress(40, "Removing password")
            with atomic_output(dest) as tmp:
                pdf.save(str(tmp))

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest)}
```

- [ ] **Step 9: Register the op in `main.py`**

In `apps/desktop/sidecar/main.py`, add a line to the `DISPATCH` dict (after `"pdf.sign": "ops.pdf_sign:run",` at line 32):

```python
    "pdf.protect": "ops.pdf_protect:run",
```

- [ ] **Step 10: Run to confirm it passes**

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest sidecar/tests/test_pdf_protect.py -v`
Expected: PASS (9 tests)

Run the full sidecar suite to confirm nothing else broke: `cd apps/desktop && .venv\Scripts\python.exe -m pytest`
Expected: PASS, all tests (existing + new)

- [ ] **Step 11: Update the frozen protocol doc**

In `apps/desktop/sidecar/PROTOCOL.md`, add a row to the error code table (after the `CORRUPT_PDF` row, line 34):

```markdown
| `WRONG_PASSWORD` | Incorrect password given to `pdf.protect` unlock |
```

Add a new operation section, after `### pdf.sign` (after line 150, before `## Page range spec`):

````markdown
### `pdf.protect`
params:
```json
{"input": "a.pdf", "output": "out.pdf", "mode": "protect|unlock", "password": "secret"}
```
`protect` sets an AES-256 (R=6) password required to open the PDF, with the
owner password equal to the user password. Rejects an already-encrypted
input with `ENCRYPTED_PDF` -- unlock it first. `unlock` removes password
protection given the correct password; a wrong password fails with
`WRONG_PASSWORD`. `password` must be at least 4 characters (`BAD_PARAMS`
otherwise).
result: `{"output": "...", "bytes": 4096}`
````

- [ ] **Step 12: Commit**

```bash
git add apps/desktop/sidecar/ops/pdf_protect.py apps/desktop/sidecar/main.py apps/desktop/sidecar/PROTOCOL.md apps/desktop/sidecar/tests/test_pdf_protect.py
git commit -m "feat(desktop): add pdf.protect sidecar op"
```

---

### Task 2: Web engine `protect.ts`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/engines/protect.ts`
- Create: `apps/web/src/engines/protect.test.ts`

**Interfaces:**
- Consumes: `Engine`, `EngineInput`, `EngineResult` from `./types` (existing, unchanged).
- Produces: `protectEngine: Engine` from `apps/web/src/engines/protect.ts`, reading `options.mode` (`"protect"|"unlock"`, default `"protect"`) and `options.password` (string). Task 3 imports this exact export.
- Independent of Task 1 and Task 4 — different language, different repo area. Independent of Task 3 at write time (Task 3 only needs this export to exist, which this task's contract guarantees), but Task 3 must be executed after this task lands so its typecheck/import actually resolves.

- [ ] **Step 1: Add the dependencies**

In `apps/web/package.json`, add two lines to `"dependencies"` (alphabetically, after `"motion"` and before `"pdf-lib"`... actually insert immediately before the `"pdf-lib"` line since both new packages sort before it):

```json
    "@pdfsmaller/pdf-decrypt": "^1.0.1",
    "@pdfsmaller/pdf-encrypt": "^1.2.0",
```

Run: `npm install --workspace=apps/web`
Expected: installs cleanly, `apps/web/node_modules/@pdfsmaller/pdf-encrypt` and `.../pdf-decrypt` exist.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/engines/protect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { isEncrypted } from "@pdfsmaller/pdf-decrypt";
import { protectEngine } from "./protect";
import { makeTestPdf } from "./testHelpers";

async function toFile(bytes: Uint8Array, name = "doc.pdf") {
  return new File([bytes as BlobPart], name, { type: "application/pdf" });
}

describe("protectEngine", () => {
  it("protect mode encrypts the PDF with the given password", async () => {
    const file = await toFile(await makeTestPdf(2));

    const result = await protectEngine({
      files: [file],
      options: { mode: "protect", password: "secret1" },
    });

    expect(result.files).toHaveLength(1);
    expect(result.isPreview).toBe(false);
    const outBytes = new Uint8Array(await result.files[0].blob.arrayBuffer());
    await expect(PDFDocument.load(outBytes)).rejects.toThrow();
    const info = await isEncrypted(outBytes);
    expect(info.encrypted).toBe(true);
    expect(info.algorithm).toBe("AES-256");
  });

  it("unlock mode removes protection given the correct password", async () => {
    const plain = await toFile(await makeTestPdf(3));
    const protectedResult = await protectEngine({
      files: [plain],
      options: { mode: "protect", password: "secret1" },
    });
    const protectedFile = await toFile(
      new Uint8Array(await protectedResult.files[0].blob.arrayBuffer()),
    );

    const unlocked = await protectEngine({
      files: [protectedFile],
      options: { mode: "unlock", password: "secret1" },
    });

    const outBytes = new Uint8Array(await unlocked.files[0].blob.arrayBuffer());
    const doc = await PDFDocument.load(outBytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("unlock mode rejects the wrong password", async () => {
    const plain = await toFile(await makeTestPdf(1));
    const protectedResult = await protectEngine({
      files: [plain],
      options: { mode: "protect", password: "secret1" },
    });
    const protectedFile = await toFile(
      new Uint8Array(await protectedResult.files[0].blob.arrayBuffer()),
    );

    await expect(
      protectEngine({ files: [protectedFile], options: { mode: "unlock", password: "wrong" } }),
    ).rejects.toThrow(/password/i);
  });

  it("protect mode rejects an already-encrypted input", async () => {
    const plain = await toFile(await makeTestPdf(1));
    const protectedResult = await protectEngine({
      files: [plain],
      options: { mode: "protect", password: "secret1" },
    });
    const protectedFile = await toFile(
      new Uint8Array(await protectedResult.files[0].blob.arrayBuffer()),
    );

    await expect(
      protectEngine({ files: [protectedFile], options: { mode: "protect", password: "secret2" } }),
    ).rejects.toThrow(/already/i);
  });

  it("rejects a password shorter than 4 characters", async () => {
    const file = await toFile(await makeTestPdf(1));
    await expect(
      protectEngine({ files: [file], options: { mode: "protect", password: "abc" } }),
    ).rejects.toThrow();
  });

  it("rejects an empty file list", async () => {
    await expect(
      protectEngine({ files: [], options: { mode: "protect", password: "secret1" } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `npm run test --workspace=apps/web -- protect.test.ts`
Expected: FAIL — `Cannot find module './protect'`

- [ ] **Step 4: Implement `protect.ts`**

Create `apps/web/src/engines/protect.ts`:

```ts
import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import { decryptPDF, isEncrypted } from "@pdfsmaller/pdf-decrypt";
import type { Engine } from "./types";

const MIN_PASSWORD_LENGTH = 4;

export const protectEngine: Engine = async ({ files, options }) => {
  const file = files[0];
  if (!file) throw new Error("Add a PDF to protect or unlock.");

  const mode = (options.mode as string) ?? "protect";
  const password = (options.password as string) ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (mode === "protect") {
    const info = await isEncrypted(bytes);
    if (info.encrypted) {
      throw new Error("This PDF already has a password — unlock it first.");
    }
    const encrypted = await encryptPDF(bytes, password);
    return {
      files: [
        {
          name: file.name.replace(/\.pdf$/i, "-protected.pdf"),
          blob: new Blob([encrypted as BlobPart], { type: "application/pdf" }),
        },
      ],
      summary: "Password protection added.",
      isPreview: false,
    };
  }

  if (mode === "unlock") {
    let decrypted: Uint8Array;
    try {
      decrypted = await decryptPDF(bytes, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        message.toLowerCase().includes("not encrypted")
          ? "This PDF isn't password protected."
          : "Incorrect password.",
      );
    }
    return {
      files: [
        {
          name: file.name.replace(/\.pdf$/i, "-unlocked.pdf"),
          blob: new Blob([decrypted as BlobPart], { type: "application/pdf" }),
        },
      ],
      summary: "Password protection removed.",
      isPreview: false,
    };
  }

  throw new Error(`Unknown mode: ${mode}`);
};
```

- [ ] **Step 5: Run to confirm it passes**

Run: `npm run test --workspace=apps/web -- protect.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full web test suite and typecheck**

Run: `npm run test --workspace=apps/web`
Expected: PASS, all tests

Run: `npm run typecheck --workspace=apps/web`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/engines/protect.ts apps/web/src/engines/protect.test.ts
git commit -m "feat(web): add protect/unlock PDF engine"
```

---

### Task 3: Web UI wiring (depends on Task 2)

**Files:**
- Modify: `apps/web/src/tools/tint.ts`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/tools/icons.tsx`
- Create: `apps/web/src/tools/options/ProtectOptions.tsx`
- Modify: `apps/web/src/tools/registry.tsx`
- Modify: `apps/web/src/components/ToolPage.tsx`

**Interfaces:**
- Consumes: `protectEngine` from `@/engines/protect` (Task 2), `ToolConfig`/`OptionsPanelProps` from `./ToolConfig` (existing, unchanged).
- Produces: nothing consumed elsewhere — this is the leaf that assembles the tool for the router (`ToolDetail.tsx` already renders any `TOOLS` entry generically, no further wiring needed).
- Run this task only after Task 2 has landed (its import of `@/engines/protect` must resolve).

- [ ] **Step 1: Add the tint key**

In `apps/web/src/tools/tint.ts:1`, change:

```ts
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
```

to:

```ts
export type TintKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i";
```

- [ ] **Step 2: Add the tint CSS variables**

In `apps/web/src/index.css`, add one line after `--tint-h: oklch(0.575 0.145 120);` (line 81):

```css
  --tint-i: oklch(0.575 0.145 230);
```

Add one line after `--tint-h-btn: oklch(0.5 0.145 120);` (line 89):

```css
  --tint-i-btn: oklch(0.5 0.145 230);
```

Add one line after the dark-mode `--tint-h: oklch(0.8 0.125 120);` (line 126):

```css
  --tint-i: oklch(0.8 0.125 230);
```

Add one line after the dark-mode `--tint-h-btn: var(--tint-h);` (line 134):

```css
  --tint-i-btn: var(--tint-i);
```

- [ ] **Step 3: Add the icon**

In `apps/web/src/tools/icons.tsx`, add after the `SignIcon` export (or any existing export — order doesn't matter, append at the end of the file):

```tsx
export function ProtectIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="var(--tint-i)" strokeWidth="1.5" {...props}>
      <rect x="3.5" y="8" width="11" height="7.5" rx="1.2" />
      <path d="M5.5 8V5.5a3.5 3.5 0 0 1 7 0V8" />
      <circle cx="9" cy="11.5" r="1" fill="var(--tint-i)" stroke="none" />
      <path d="M9 12.5v1.5" />
    </svg>
  );
}
```

- [ ] **Step 4: Build the options panel**

Create `apps/web/src/tools/options/ProtectOptions.tsx`:

```tsx
import { useState } from "react";
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function ProtectOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const [showPassword, setShowPassword] = useState(false);
  const mode = (options.mode as string) ?? "protect";
  const password = (options.password as string) ?? "";
  const confirmPassword = (options.confirmPassword as string) ?? "";
  const mismatch = mode === "protect" && confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {(["protect", "unlock"] as const).map((m) => (
          <label
            key={m}
            className={`flex-1 cursor-pointer rounded-lg border p-2.5 text-center ${mode === m ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}
          >
            <input
              type="radio"
              name="protect-mode"
              className="sr-only"
              checked={mode === m}
              disabled={disabled}
              onChange={() => onChange({ ...options, mode: m, password: "", confirmPassword: "" })}
            />
            <div className="text-[12.5px] font-semibold capitalize">{m}</div>
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">
          {mode === "protect" ? "Set password" : "Enter password"}
        </span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            disabled={disabled}
            value={password}
            onChange={(e) => onChange({ ...options, password: e.target.value })}
            placeholder="At least 4 characters"
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 pr-14 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11.5px] text-muted hover:text-text"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {mode === "protect" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold">Confirm password</span>
          <input
            type={showPassword ? "text" : "password"}
            disabled={disabled}
            value={confirmPassword}
            onChange={(e) => onChange({ ...options, confirmPassword: e.target.value })}
            placeholder="Repeat the password"
            className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
          />
          {mismatch && <span className="text-[11.5px] text-danger">Passwords do not match.</span>}
        </label>
      )}

      <div className="rounded-lg bg-accent-soft p-3 text-[11.5px] leading-relaxed text-on-accent">
        {mode === "protect"
          ? "Anyone opening this PDF will need the password you set here."
          : "Enter the PDF's current password to remove it."}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Register the tool**

In `apps/web/src/tools/registry.tsx`, add two import lines after the `SignWorkspace` import block (after line 18):

```tsx
import { ProtectOptions } from "./options/ProtectOptions";
import { protectEngine } from "@/engines/protect";
```

Add `ProtectIcon` to the icon import list (line 19-28), so it reads:

```tsx
import {
  CompressIcon,
  MergeIcon,
  SplitIcon,
  OrganizeIcon,
  PdfToImagesIcon,
  ImagesToPdfIcon,
  ConvertImagesIcon,
  SignIcon,
  ProtectIcon,
} from "./icons";
```

Add a new entry to the `TOOLS` array (after the `sign` entry, before the closing `];` on line 39):

```tsx
  { slug: "protect", name: "Protect & Unlock PDF", description: "Add or remove a password that's required to open the file.", category: "pdf", Icon: ProtectIcon, accept: [".pdf"], multiple: false, defaultOptions: { mode: "protect", password: "", confirmPassword: "" }, OptionsPanel: ProtectOptions, engine: protectEngine, status: "live", tint: "i" },
```

- [ ] **Step 6: Wire Run-button validation into `ToolPage`**

In `apps/web/src/components/ToolPage.tsx`, add a new computed value after the `showSizeWarning` line (after line 32):

```tsx
  const protectInvalid =
    tool.slug === "protect" &&
    (() => {
      const mode = String(options.mode ?? "protect");
      const password = String(options.password ?? "");
      if (password.length < 4) return true;
      if (mode === "protect" && password !== String(options.confirmPassword ?? "")) return true;
      return false;
    })();
```

Change the Run button's `disabled` prop (line 183) from:

```tsx
              disabled={step === "empty" || step === "running"}
```

to:

```tsx
              disabled={step === "empty" || step === "running" || protectInvalid}
```

- [ ] **Step 7: Typecheck and run the full web test suite**

Run: `npm run typecheck --workspace=apps/web`
Expected: no errors

Run: `npm run test --workspace=apps/web`
Expected: PASS, all tests

Run: `npm run build --workspace=apps/web`
Expected: builds cleanly

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/tools/tint.ts apps/web/src/index.css apps/web/src/tools/icons.tsx apps/web/src/tools/options/ProtectOptions.tsx apps/web/src/tools/registry.tsx apps/web/src/components/ToolPage.tsx
git commit -m "feat(web): wire up the Protect & Unlock PDF tool"
```

---

### Task 4: Desktop UI wiring

**Files:**
- Modify: `apps/desktop/src/lib/tools.ts`
- Modify: `apps/desktop/src/lib/jobs.ts`
- Modify: `apps/desktop/src/lib/run.ts`
- Modify: `apps/desktop/src/components/OptionsPanel.tsx`
- Modify: `apps/desktop/src/routes/ToolWorkspace.tsx`
- Modify: `apps/desktop/src/index.css`

**Interfaces:**
- Consumes: the frozen `pdf.protect` param/result contract from Task 1's spec (this task is TypeScript-only and typechecks without Task 1's Python code existing — it only needs the contract, documented above in Global Constraints).
- Produces: a `"protect"` entry in `TOOLS` (`apps/desktop/src/lib/tools.ts`), consumed by the router and Home grid automatically (both already iterate `TOOLS`, no further wiring).
- Independent of Tasks 1-3 — different files, different app. Safe to run in parallel with all of them.

- [ ] **Step 1: Add the tint variant and tool entry to `tools.ts`**

In `apps/desktop/src/lib/tools.ts:24`, change:

```ts
export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
```

to:

```ts
export type Tint = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i";
```

Add `Lock` to the `lucide-react` import (line 10-19):

```ts
import {
  Combine,
  FileImage,
  FileOutput,
  Images,
  Lock,
  Minimize2,
  Replace,
  Scissors,
  Signature,
} from "lucide-react";
```

Add a new entry to the `TOOLS` array, after the `sign` entry (after line 133, before the `compress` entry):

```ts
  {
    id: "protect",
    path: "/t/protect",
    title: "Protect & Unlock PDF",
    description: "Add or remove a password that's required to open the file.",
    icon: Lock,
    group: "pdf",
    tint: "i",
    op: "pdf.protect",
    accepts: ["pdf"],
    acceptsLabel: "a PDF file",
    multiple: false,
    ordered: false,
    action: "Save PDF",
    defaults: { mode: "protect", password: "", confirmPassword: "" },
  },
```

- [ ] **Step 2: Add the op to `jobs.ts`**

In `apps/desktop/src/lib/jobs.ts`, add `"pdf.protect"` to the `OpName` union (after `| "pdf.sign"`, line ~10):

```ts
  | "pdf.protect"
```

Add `"WRONG_PASSWORD"` to the `ErrorCode` union (after `| "CORRUPT_PDF"`):

```ts
  | "WRONG_PASSWORD"
```

Add params/result types, after `PdfSignResult` (after the line `export interface PdfSignResult { output: string; bytes: number; pages: number; elements: number }`):

```ts
export type ProtectMode = "protect" | "unlock";
export interface PdfProtectParams { input: string; output: string; mode: ProtectMode; password: string }
export interface PdfProtectResult { output: string; bytes: number }
```

Add a line to the `OpMap` interface (after `"pdf.sign": [PdfSignParams, PdfSignResult];`):

```ts
  "pdf.protect": [PdfProtectParams, PdfProtectResult];
```

- [ ] **Step 3: Add the runner case to `run.ts`**

In `apps/desktop/src/lib/run.ts`, add a new `case` in the `execute` function's `switch (op)`, after the `"pdf.sign"` case (after its closing `}` around line 184, before `case "pdf.to_img":`):

```ts
    case "pdf.protect": {
      const mode = str("mode", "protect") as "protect" | "unlock";
      const suffix = mode === "protect" ? "protected" : "unlocked";
      const r = await runJob(
        "pdf.protect",
        {
          input: first.path,
          output: join(`${base}-${suffix}.pdf`),
          mode,
          password: str("password"),
        },
        opts,
      );
      return {
        outputs: [{ path: r.output, bytes: r.bytes }],
        summary: mode === "protect" ? "Password protection added." : "Password protection removed.",
      };
    }
```

- [ ] **Step 4: Add the options form to `OptionsPanel.tsx`**

In `apps/desktop/src/components/OptionsPanel.tsx`, add a `useState` import (change line 1 from `import { useId, type ReactNode } from "react";` to):

```tsx
import { useId, useState, type ReactNode } from "react";
```

Add `RadioGroup`/`RadioGroupItem` are already imported. Add a new `case` in the `ToolOptions` function's `switch (tool.id)`, after the `case "compress":` block (after its closing `);` before `case "pdf-to-image":`):

```tsx
    case "protect": {
      const mode = str("mode", "protect") as "protect" | "unlock";
      const password = str("password");
      const confirmPassword = str("confirmPassword");
      const mismatch = mode === "protect" && confirmPassword.length > 0 && password !== confirmPassword;
      return (
        <OptionsPanel
          className={className}
          description={
            mode === "protect"
              ? "Anyone opening this PDF will need the password you set here."
              : "Enter the PDF's current password to remove it."
          }
        >
          <Field label="Mode">
            {() => (
              <RadioGroup
                value={mode}
                onValueChange={(v) => set({ mode: v, password: "", confirmPassword: "" })}
                aria-label="Protect or unlock"
              >
                <RadioGroupItem value="protect" label="Protect" hint="Set a password to open the PDF." />
                <RadioGroupItem value="unlock" label="Unlock" hint="Remove an existing password." />
              </RadioGroup>
            )}
          </Field>
          <ProtectPasswordField
            label={mode === "protect" ? "Set password" : "Enter password"}
            value={password}
            onChange={(v) => set({ password: v })}
          />
          {mode === "protect" ? (
            <ProtectPasswordField
              label="Confirm password"
              value={confirmPassword}
              onChange={(v) => set({ confirmPassword: v })}
              hint={mismatch ? "Passwords do not match." : undefined}
            />
          ) : null}
        </OptionsPanel>
      );
    }
```

Add the small local helper component at the end of the file (after the `ToolOptions` function's closing `}`):

```tsx
function ProtectPasswordField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="relative">
          <Input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            placeholder="At least 4 characters"
            className="pr-14"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-text"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      )}
    </Field>
  );
}
```

- [ ] **Step 5: Add Run-button validation to `ToolWorkspace.tsx`**

In `apps/desktop/src/routes/ToolWorkspace.tsx`, extend the `blocker` `useMemo` (lines 96-103) from:

```tsx
  const blocker = useMemo(() => {
    if (files.length === 0) return `Add ${tool.acceptsLabel} to continue.`;
    if (tool.id === "merge" && files.length < 2) return "Merging needs at least two PDFs.";
    if (tool.id === "sign" && signElements.length === 0) {
      return "Add a signature, text, date or initials to continue.";
    }
    return null;
  }, [files.length, tool, signElements.length]);
```

to:

```tsx
  const blocker = useMemo(() => {
    if (files.length === 0) return `Add ${tool.acceptsLabel} to continue.`;
    if (tool.id === "merge" && files.length < 2) return "Merging needs at least two PDFs.";
    if (tool.id === "sign" && signElements.length === 0) {
      return "Add a signature, text, date or initials to continue.";
    }
    if (tool.id === "protect") {
      const password = String(values.password ?? "");
      const mode = String(values.mode ?? "protect");
      if (password.length < 4) return "Enter a password of at least 4 characters.";
      if (mode === "protect" && password !== String(values.confirmPassword ?? "")) {
        return "Passwords do not match.";
      }
    }
    return null;
  }, [files.length, tool, signElements.length, values]);
```

- [ ] **Step 6: Add the tint CSS variables**

In `apps/desktop/src/index.css`, add one line after `--tint-h: oklch(0.575 0.145 120);` (line 103):

```css
  --tint-i: oklch(0.575 0.145 230);
```

Add one line after the dark-mode `--tint-h: oklch(0.8 0.125 120);` (line 146):

```css
  --tint-i: oklch(0.8 0.125 230);
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck --workspace=apps/desktop`
Expected: no errors

Run: `npm run lint --workspace=apps/desktop`
Expected: no errors (or only pre-existing warnings unrelated to these files)

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/lib/tools.ts apps/desktop/src/lib/jobs.ts apps/desktop/src/lib/run.ts apps/desktop/src/components/OptionsPanel.tsx apps/desktop/src/routes/ToolWorkspace.tsx apps/desktop/src/index.css
git commit -m "feat(desktop): wire up the Protect & Unlock PDF tool"
```

---

### Task 5: Copy updates (after Tasks 3 and 4)

**Files:**
- Modify: `README.md`
- Modify: `apps/web/src/pages/Download.tsx`

**Interfaces:** None — text-only changes, no code consumed or produced.

- [ ] **Step 1: Update the README**

In `README.md`, change the heading `## The eight tools` (line 37) to:

```markdown
## The nine tools
```

Add a row to the tools table (after the `Sign & Fill` row, line 44):

```markdown
| Protect & Unlock PDF | Add or remove a password that's required to open the file |
```

- [ ] **Step 2: Update the Download page**

In `apps/web/src/pages/Download.tsx:64`, change:

```tsx
            The same eight tools, with no browser in the way.
```

to:

```tsx
            The same nine tools, with no browser in the way.
```

- [ ] **Step 3: Commit**

```bash
git add README.md apps/web/src/pages/Download.tsx
git commit -m "docs: update tool count to nine after adding Protect & Unlock PDF"
```

---

### Task 6: Integration verification (after all prior tasks)

**Files:** None modified — verification only.

**Interfaces:** None.

- [ ] **Step 1: Full test suites**

Run: `npm run test --workspace=apps/web`
Expected: PASS, all tests

Run: `cd apps/desktop && .venv\Scripts\python.exe -m pytest`
Expected: PASS, all tests

- [ ] **Step 2: Full typechecks and builds**

Run: `npm run typecheck --workspace=apps/web && npm run build --workspace=apps/web`
Expected: no errors, build succeeds

Run: `npm run typecheck --workspace=apps/desktop`
Expected: no errors

- [ ] **Step 3: Manual browser verification of the web tool**

Start the web dev server and open `/t/protect`. Confirm:
- The Protect/Unlock toggle renders and switches the form.
- Uploading a PDF and setting a password under 4 characters keeps Run disabled; a valid password enables it.
- Protect mode with mismatched confirm-password keeps Run disabled and shows "Passwords do not match."
- Running Protect on a real multi-page PDF downloads a file that a plain `PDFDocument.load` (e.g. via the browser console or another tool page) refuses to open without a password.
- Switching to Unlock, uploading that protected file, and entering the correct password produces a file that opens normally; the wrong password surfaces "Incorrect password."
- The new tool tile appears on the tools index with its own (9th) tint color, distinct from the other eight.

- [ ] **Step 4: Manual desktop verification**

If a Tauri dev environment is available (Rust + the MSVC toolchain, per `apps/desktop/README.md`), run `npm run tauri dev --workspace=apps/desktop`, open Protect & Unlock PDF, and repeat the same checks as Step 3 against the real pikepdf-backed sidecar — in particular, confirm a PDF protected by the **web** engine unlocks correctly in the **desktop** app, and vice versa, proving both engines produce spec-compliant AES-256 rather than merely mutually-compatible output. If no Tauri toolchain is available in this environment, note that this step was skipped and say so explicitly rather than claiming it passed.
