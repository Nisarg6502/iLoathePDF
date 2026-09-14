# Protect & Unlock PDF

Status: approved (design confirmed via Q&A), proceeding to writing-plans.

## Problem

"Password protect a PDF" is one of the most commonly searched PDF operations
and is entirely absent from the current eight tools. Competitors (iLovePDF,
SmallPDF) offer it but require uploading the file to their servers — exactly
the trade-off this project exists to avoid. Adding it locally, on both apps,
is a direct table-stakes gap with a built-in privacy differentiator.

## Scope

One new tool, **Protect & Unlock PDF**, slug `protect`, category `pdf`, on
both the desktop app and the website. A mode toggle (Protect / Unlock) swaps
the form, matching how Convert Images already handles multiple directions
in one tool.

- **Protect**: set a password required to open the PDF (standard AES-256
  user/owner password, both set to the same value — no separate
  permissions/restrictions UI in v1).
- **Unlock**: given the correct password, remove the encryption entirely.
- Re-protecting an already-encrypted file is not supported directly — the
  user must unlock first. This keeps the op's contract simple (one
  password in, one password out) instead of juggling old/new passwords in
  one form.
- No password-strength meter, no "restrict printing/copying" permissions,
  no forgotten-password recovery (not possible, and out of scope even as a
  paid/cloud upsell — this tool does not phone home).

## 1. Desktop: `pdf_protect.py`

New op at `apps/desktop/sidecar/ops/pdf_protect.py`, following the shape of
[`pdf_compress.py`](../../../apps/desktop/sidecar/ops/pdf_compress.py):
progress callbacks, `atomic_output`, protocol-shaped errors, registered in
`PROTOCOL.md` and the Rust op dispatch table the same mechanical way every
other op is.

```python
def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    mode = one_of(params, "mode", ("protect", "unlock"))
    password = require(params, "password")
    ...
```

- **Protect**: `open_pdf(src)` (existing helper) — if `src` is already
  encrypted this already raises `ENCRYPTED_PDF`, which is the desired
  behavior. On success, `pdf.save(dest, encryption=pikepdf.Encryption(
  owner=password, user=password, R=6))` (AES-256, PDF 2.0 revision 6).
- **Unlock**: new `_common.py` helper `open_pdf_with_password(path,
  password)` — `pikepdf.open(str(path), password=password)`, catching
  `pikepdf.PasswordError` and re-raising as a new protocol error
  `WRONG_PASSWORD` (distinct from `ENCRYPTED_PDF`, which means "no password
  was supplied at all"). On success, `pdf.save(dest)` with no `encryption=`
  argument, which strips protection.
- `PROTOCOL.md` gains `WRONG_PASSWORD` in its error taxonomy, next to the
  existing `ENCRYPTED_PDF` / `CORRUPT_PDF`.

## 2. Web: `protect.ts` engine

New `apps/web/src/engines/protect.ts`, using
[`@pdfsmaller/pdf-encrypt`](https://www.npmjs.com/package/@pdfsmaller/pdf-encrypt)
and
[`@pdfsmaller/pdf-decrypt`](https://www.npmjs.com/package/@pdfsmaller/pdf-decrypt) —
pure JS, Web Crypto API, `pdf-lib` as their only peer dependency (already a
web app dependency). No WASM, no native deps, no meaningful bundle-size
concern.

- **Protect**: load the file with `pdf-lib` as normal (source isn't
  encrypted), apply `@pdfsmaller/pdf-encrypt` with the supplied password,
  AES-256.
- **Unlock**: `pdf-lib` itself cannot open encrypted bytes, so
  `@pdfsmaller/pdf-decrypt` must operate on the raw `ArrayBuffer` directly.
  Its exact call shape hasn't been verified against real encrypted output
  yet — first implementation task is a spike: encrypt a test PDF with the
  desktop op (or `pikepdf` directly) and confirm `@pdfsmaller/pdf-decrypt`
  can unlock it, before wiring the UI around it. If the library's actual
  API doesn't match its documented surface, fall back to shipping this
  tool's web side with a `"preview"` status (same pattern already used for
  Compress and HEIC convert) rather than blocking the whole feature.
- Ships `status: "live"` once the spike confirms the round trip.

## 3. Shared UI

New `OptionsPanel` for the `protect` tool (plain `ToolConfig`, no bespoke
`Workspace` — single-file drop zone + run, like Compress):

- Segmented control: **Protect** / **Unlock**.
- Password field with show/hide toggle.
- Confirm-password field, **Protect mode only**.
- Minimum password length enforced client-side (4 characters) with an
  inline hint — no server-side concept applies here, but an empty or
  single-character password is a mistake, not a valid request.
- Run button disabled until the password (and confirm, in Protect mode)
  are valid — never a submit-then-fail round trip for a client-side-only
  check.

## 4. Error handling

- Unlock with wrong password → inline error, form stays populated for
  retry. No lockout/rate-limiting — this is a local tool operating on the
  user's own file, not a security boundary against brute force.
- Protect on an already-encrypted file → clear message: "This PDF already
  has a password — unlock it first."
- Corrupt/unreadable input → existing `CORRUPT_PDF` path, unchanged.

## 5. Testing

- **Desktop**: pytest cases in `apps/desktop/sidecar/tests`, mirroring
  existing op test style — protect → unlock round trip (byte-identical
  page content before/after), wrong-password rejection on unlock,
  already-encrypted-input rejection on protect.
- **Web**: `apps/web/src/engines/protect.test.ts`, mirroring
  `compress.test.ts` — protect produces bytes `pdf-lib` can no longer open
  without a password; unlock with the correct password recovers the
  original content; wrong password is rejected.
- **Manual cross-compatibility check**: a PDF protected by the web engine
  opens correctly (password-prompted) in a real PDF viewer and in the
  desktop app's unlock flow, and vice versa for a PDF protected by
  `pikepdf` — confirms both engines produce spec-compliant AES-256, not
  just mutually-compatible output.
