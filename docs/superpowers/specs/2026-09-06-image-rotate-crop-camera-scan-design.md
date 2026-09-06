# Rotate/crop editing and camera scan for image tools

Status: approved (design confirmed via Q&A), proceeding to writing-plans.

## Problem

Two of the website's tools accept raw image files as-is, with no way to fix
them up before they're used:

- **Images to PDF** — each image is centered on its own A4 page exactly as
  uploaded. A sideways phone photo stays sideways; an image with excess
  background can't be trimmed.
- **Convert images** — format conversion only; same limitation.

Neither tool offers a way to bring in a document via the device's camera —
today the only input path is drag-and-drop or the file picker.

## Scope

Add, to **Images to PDF** and **Convert images** only:

1. Per-image **rotate** (90° steps) and **crop** (freeform rectangle),
   edited before running the tool.
2. A **"Scan with camera"** capture flow as an alternative to dropping
   files, producing the same kind of `File[]` the drop zone produces.

No new tools, no new PDF-page-level rotate/crop (Organize already has
per-page rotate), no new npm dependencies. Re-scanning after files are
already loaded is not supported in v1 — use "Remove" and start over.

## 1. Per-image edit state

Both tools' `options` gain an `edits` map, keyed by index into the `files`
array (files aren't reordered by either tool today, so index is a stable
key for the lifetime of one run):

```ts
interface ImageEdit {
  rotate: 0 | 90 | 180 | 270;
  crop: { x: number; y: number; w: number; h: number } | null; // normalized 0..1, relative to the ROTATED image's bounding box
}
type ImageEdits = Record<number, ImageEdit>;
```

A file with no entry in `edits` is untouched (today's behavior/perf path
unchanged). `defaultOptions` for both tools stays as-is; `edits` is read as
`(options.edits as ImageEdits | undefined) ?? {}`.

## 2. Shared rotate/crop renderer

New `apps/web/src/tools/imageEdit.ts`:

```ts
export interface ImageEdit { rotate: 0 | 90 | 180 | 270; crop: Rect | null }
export interface Rect { x: number; y: number; w: number; h: number }

export function renderRotatedCropped(
  bitmap: ImageBitmap,
  edit: ImageEdit,
): HTMLCanvasElement
```

Two-pass implementation:
1. Rotate the source bitmap onto an intermediate canvas sized to the
   rotated bounding box (swap width/height for 90°/270°), via
   `ctx.translate` + `ctx.rotate` + `drawImage` centered.
2. If `edit.crop` is set, draw the cropped sub-rectangle (denormalized
   against the rotated canvas's own width/height) onto a second, smaller
   canvas. Otherwise the rotated canvas *is* the result.

Pure and DOM-only (canvas + ImageBitmap), so it runs identically in the
live editor preview and inside both engines — what you see in the editor
is what gets produced.

## 3. New UI components

### `ImageInputList` (`apps/web/src/components/ImageInputList.tsx`)
Replaces `ToolPage`'s plain `<ul>` file list when `tool.category ===
"image"`. Per file: a thumbnail (`URL.createObjectURL`, revoked on
unmount/change), name, size, a small "rotated"/"cropped" badge when an
edit exists, and an "Edit" button opening `ImageEditModal` for that index.

### `ImageEditModal` (`apps/web/src/components/ImageEditModal.tsx`)
One image at a time, rendered full-screen-ish modal:
- Rotate-left / rotate-right buttons (step the `rotate` field by ±90,
  wrapping 0↔270).
- A crop rectangle overlaid on the (rotated) preview image, built from
  absolutely-positioned handle `<div>`s driven by pointer events — drag
  inside to move, drag a corner to resize, clamped to the image bounds.
  No aspect-ratio lock, no zoom (freeform only, per scope).
- Live preview redraws via `renderRotatedCropped` at a display resolution
  (not full source resolution — this is a preview canvas, not the export).
- Reset (clears crop, rotate back to 0) / Cancel (discard) / Apply (calls
  back with the new `ImageEdit`, closes).

### `CameraCapture` (`apps/web/src/components/CameraCapture.tsx`)
Modal triggered by a "Scan with camera" button, shown next to
`FileDropZone` only when `tool.category === "image"` and only in the
empty (no files yet) state.
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`,
  falling back to `{ video: true }` if the constrained request fails
  (desktop browsers without a rear/front distinction).
- Live `<video>` preview; a shutter button draws the current frame to an
  offscreen canvas at the video's native resolution and encodes it
  (`canvas.toBlob(..., "image/jpeg", 0.92)`) into a `File` named
  `scan-<n>.jpg`.
- A thumbnail strip of shots taken so far in this session, each removable
  before finishing.
- "Use N photo(s)" hands the accumulated `File[]` to the same `onFiles`
  callback `FileDropZone` already uses — no `ToolPage` plumbing changes
  needed, camera capture is just another producer of the initial file
  list.
- All `MediaStreamTrack`s are stopped on close (Cancel, Done, or
  unmount) so the camera indicator doesn't stay lit.
- If `getUserMedia` throws (no camera, permission denied, or insecure
  context — it requires HTTPS or localhost) show an inline error message
  with a Close button instead of crashing.

### `ToolPage` changes
- Empty step: when `tool.category === "image"`, render the "Scan with
  camera" trigger alongside `FileDropZone`.
- Ready/running step: when `tool.category === "image"`, render
  `ImageInputList` (passed `files`, `options`, `setOptions`) instead of
  the existing plain list; other tools (`pdf` category) are unaffected.

## 4. Engine changes

### `convertImages.ts`
`convertOne` already rasterizes every file to a canvas unconditionally.
Extend it to accept the file's `ImageEdit | undefined` and, when present,
draw through `renderRotatedCropped` first instead of `drawImage(bitmap, 0,
0)` directly. No change to the untouched-file path's output format/
quality.

### `imagesToPdf.ts`
Currently embeds raw file bytes directly via `embedPng`/`embedJpg` (no
rasterization) — the fast path. When a file has an edit, rasterize it
through `renderRotatedCropped` first, `canvas.toBlob("image/png")`, and
`embedPng` the result instead; sizing/placement math on the PDF page is
unchanged (it already scales from the embedded image's own width/height).
Files with no edit keep the existing direct-embed path untouched.

## 5. Testing

- `apps/web/src/tools/imageEdit.test.ts`: `renderRotatedCropped` produces
  the expected output canvas dimensions for each rotate value and for
  crop rectangles (using the existing `canvas` npm package already in
  devDependencies for node-side canvas support in tests).
- `apps/web/src/engines/convertImages.test.ts`,
  `imagesToPdf.test.ts`: extend with cases that pass `options.edits` and
  assert the output reflects the rotated/cropped dimensions.
- `CameraCapture`/`ImageEditModal` interaction: no automated coverage for
  live camera access (not meaningfully testable under jsdom); verified
  manually in the browser preview — rotate a file, crop a file, run each
  tool, confirm the output; open the camera modal and confirm the
  permission-denied path degrades gracefully (camera hardware access
  itself can't be exercised in this environment, but the error branch
  can be forced by stubbing `getUserMedia` to reject).
