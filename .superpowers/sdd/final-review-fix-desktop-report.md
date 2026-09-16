# Final review fix: desktop half of OCR -> Searchable PDF

Scope: `apps/desktop/sidecar/ops/pdf_ocr.py` and
`apps/desktop/sidecar/tests/test_pdf_ocr.py`, addressing the two Important
findings from the whole-branch review, plus two Minor cleanups.

## Environment note

This worktree was fast-forwarded from `89c09d6` to the current tip of
`feature/ocr-searchable-pdf` (`43f311f`) before starting -- it had been
created before the OCR feature commits landed. Ghostscript happened to be
reachable here via PATH (`vendor/ghostscript/bin/gswin64c.exe` in the main
checkout), but **no native Tesseract binary is present anywhere on this
machine** (checked PATH, `vendor/tesseract/`, common Windows install
locations, and a full-disk scan for `tesseract.exe`/`tesseract*`). All
`@needs_tesseract`-gated tests, including the two new ones, therefore
**skip** rather than run in this environment -- exactly the scenario the
task description anticipated. They have not been executed for real here.

## Finding 1 (Important) -- weak round-trip test assertions

Added `test_ocr_round_trip_recognizes_the_actual_text` in
`test_pdf_ocr.py`, replacing "some text exists" with an assertion on the
actual recognized content, mirroring the web engine's
`apps/web/src/engines/ocr.test.ts` ("adds selectable text that pdf.js can
extract back out").

Investigated the extraction options named in the task:

- `pikepdf.Page.extract_text()` -- confirmed absent from pikepdf 10.12.0
  (the version pinned in `sidecar/requirements.txt`); did not fabricate a
  call to it.
- Reading Tesseract's PDF `Tj` operands directly -- confirmed not viable
  within reasonable effort: Tesseract's `pdf` mode draws text through a
  "GlyphLessFont" whose content-stream strings are per-glyph codes, not
  ASCII; getting real text back out would mean manually walking the font's
  ToUnicode CMap and decoding each `Tj` operand by hand -- a small text
  extraction engine, not a one-off test helper.
- Went with the task's suggested approach (a): the new test independently
  reruns Tesseract in plain `txt` output mode (`tesseract <image>
  <output_base> -l eng txt`) on the exact same rasterized page image that
  `pdf_ocr.run` produces internally, via a new test-local helper
  `_ocr_txt_mode()`. This decouples "did Tesseract read the fixture
  correctly" from "how is that text encoded inside the output PDF", which
  is exactly the property the finding wants verified, without depending on
  a text-extraction API that doesn't exist.

Also addressed the reviewer's fixture concern: rather than fighting the
shared `make_pdf` fixture (a 72 DPI PIL render whose embedded image gets
upscaled ~4x when rasterized at the OCR's 300 DPI, which is fairly blurry),
added a test-local `_make_sharp_scan_pdf()` in `test_pdf_ocr.py` only. It
renders "HELLO WORLD" directly at `pdf_ocr._OCR_DPI` (300) with
`PIL.ImageFont.load_default(size=200)` and embeds the bitmap tagged with
the true 300 DPI it was drawn at, so Ghostscript's rasterization is a 1:1
copy rather than an upsample. `conftest.py`'s shared `make_pdf` fixture was
**not** touched -- confirmed via grep that ~9 other test files across the
suite depend on it.

Sanity-checked the fixture builder directly with the system Python (outside
pytest, since Tesseract isn't available to run the real test): the PDF
saves correctly, `MediaBox` comes out `[0, 0, 432.0, 144.0]` (1800x600px @
300 DPI), and the text bounding box (`100,153` to `1502,297`) sits
comfortably inside the 1800x600 image -- so the fixture is sound even
though the OCR step itself couldn't be exercised here.

The original weaker test, `test_ocr_round_trip_produces_selectable_text`,
was left in place (page count, result fields, `_page_has_text`) rather than
replaced, since it's still valid coverage and cheap to keep alongside the
new stricter one.

## Finding 2 (Important) -- no page-dimension assertion

Added `test_ocr_round_trip_preserves_page_dimensions`: runs a normal
round trip via the existing `make_pdf` fixture, then opens both the input
and output PDFs with pikepdf and asserts `after.pages[0].MediaBox ==
pytest.approx(before.pages[0].MediaBox, abs=1.0)`. `abs=1.0` (one PDF
point, 1/72") allows for benign sub-point rounding in the
px-per-inch <-> point round trip through Ghostscript's rasterizer and
Tesseract/Leptonica's DPI-based page sizing, while still catching a real
regression (e.g. DPI silently read back as 72 instead of 300, which would
be off by roughly 4x -- far outside this tolerance).

## Minor cleanups

- `apps/desktop/sidecar/tests/test_common.py`: removed the unused `OpError`
  import from `test_find_tesseract_honors_env_override` (it doesn't raise
  or catch anything in that test; the sibling test
  `test_find_tesseract_raises_tesseract_missing_when_nothing_found` still
  imports and uses `OpError` correctly).
- `apps/desktop/sidecar/ops/pdf_ocr.py`: removed the redundant
  `pages_total = total` alias in `run()` and inlined `total` at every call
  site (progress messages, the page loop, and the returned `"pages"`
  field). One clean rename, no behavior change.

## Test results

Ran from `apps/desktop/` with the system Python (this worktree has no
`.venv`; `pip install -r sidecar/requirements.txt`'s packages -- pikepdf,
Pillow, reportlab, pytest -- were already present on the system
interpreter, so no venv setup was needed to exercise the non-Tesseract
paths):

```
python -m pytest sidecar/tests/test_pdf_ocr.py -v
```
`7 passed, 6 skipped` -- all 6 skips are the `@needs_tesseract`-gated
tests (`test_ocr_page_produces_a_searchable_single_page_pdf`,
`test_ocr_round_trip_produces_selectable_text`,
`test_ocr_round_trip_recognizes_the_actual_text` [new],
`test_ocr_preserves_page_count_on_multi_page_input`,
`test_ocr_progress_reaches_100`,
`test_ocr_round_trip_preserves_page_dimensions` [new]), skipped because no
Tesseract binary exists in this environment. The 7 that ran (guard tests,
cyclic-XObject recursion test, fail-fast tests, encrypted/corrupt
propagation, missing-input) all pass -- GREEN, no regressions.

```
python -m pytest sidecar/ -v
```
`195 passed, 7 skipped, 1 warning` (the extra skip beyond pdf_ocr's 6 is
pre-existing, in `test_images.py`, unrelated to this change). No
regressions anywhere else in the suite. The 1 warning
(`test_pdf_protect.py::test_unlock_on_non_encrypted_input_is_a_harmless_no_op`)
is pre-existing and unrelated.

**Not verified for real**: the actual OCR-and-assert-content behavior of
`test_ocr_round_trip_recognizes_the_actual_text` and the actual
dimension-preservation behavior of
`test_ocr_round_trip_preserves_page_dimensions`, since both need Tesseract
to run past their `@needs_tesseract` guard. Both were written carefully
against the existing, already-passing tests' patterns (`_rasterize_page`,
`_ocr_page`, `find_tesseract`, `_tessdata_dir_for` argv construction) and
manually sanity-checked wherever possible without a real Tesseract binary
(fixture PDF generation, MediaBox shape, text-bbox fit). Recommend the
controller re-run `pytest sidecar/tests/test_pdf_ocr.py -v` once
Ghostscript+Tesseract are vendored into this worktree to confirm both pass
for real.

## Concerns

- The `abs=1.0` point tolerance on the MediaBox comparison is a judgment
  call, untested against a real Ghostscript+Tesseract round trip in this
  environment. If it proves too tight once run for real (unlikely, but
  possible depending on exact Ghostscript/Leptonica rounding behavior), it
  should be loosened slightly rather than the test being weakened to "same
  aspect ratio" or similar.
- The sharp fixture's exact pass/fail against real Tesseract is unverified.
  If "HELLO WORLD" at `ImageFont.load_default(size=200)` turns out not to
  OCR cleanly for some reason once run for real, the fix is a larger font
  size or more padding, not abandoning the independent-txt-mode approach.
