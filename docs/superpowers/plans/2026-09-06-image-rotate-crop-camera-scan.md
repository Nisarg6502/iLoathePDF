# Image rotate/crop editing and camera scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user rotate/crop each image before running **Images to PDF** or **Convert images**, and add a "Scan with camera" capture flow as an alternative to dropping files, on the website (`apps/web`) only.

**Architecture:** A single pure canvas-transform function (`renderRotatedCropped`) is shared by a live-preview editor modal and both engines, so the editor's preview is pixel-for-pixel what gets produced. Edits are stored as an index-keyed map on each tool's existing `options` object — no new state container, no `ToolConfig` schema change. Camera capture reuses the exact same `onFiles` entry point `FileDropZone` already uses, so `ToolPage` needs no new data flow, only new UI in two spots.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom + the `canvas` npm package backing `HTMLCanvasElement`), pdf-lib. No new dependencies.

## Global Constraints

- No new npm dependencies (spec: "no new npm dependencies").
- Applies ONLY to `images-to-pdf` and `convert-images` tools (`tool.category === "image"`); PDF tools are untouched.
- No PDF-page-level rotate/crop — Organize already has per-page rotate.
- Crop is freeform only — no aspect-ratio lock, no zoom.
- Camera capture is only offered in the empty (no files yet) state.
- `imagesToPdf.ts` must keep its existing direct-embed fast path for any file with no edit — only rasterize through canvas when an edit is actually present.
- `edits` is keyed by index into the `files` array (neither tool reorders files today).

---

## Task 1: Shared rotate/crop renderer

**Files:**
- Create: `apps/web/src/tools/imageEdit.ts`
- Test: `apps/web/src/tools/imageEdit.test.ts`

**Interfaces:**
- Produces: `Rect { x: number; y: number; w: number; h: number }` (normalized 0..1), `ImageEdit { rotate: 0 | 90 | 180 | 270; crop: Rect | null }`, `ImageEdits = Record<number, ImageEdit>`, `DEFAULT_IMAGE_EDIT: ImageEdit`, `isNoopEdit(edit: ImageEdit | undefined): boolean`, `renderRotatedCropped(image: CanvasImageSource & { width: number; height: number }, edit: ImageEdit): HTMLCanvasElement`. Every later task imports from this module.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/tools/imageEdit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderRotatedCropped, isNoopEdit, DEFAULT_IMAGE_EDIT } from "./imageEdit";

function makeSourceCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in test environment.");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

describe("renderRotatedCropped", () => {
  it("keeps dimensions unchanged with no rotate and no crop", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 0, crop: null });
    expect(out.width).toBe(10);
    expect(out.height).toBe(6);
  });

  it("swaps width/height for a 90 degree rotation", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 90, crop: null });
    expect(out.width).toBe(6);
    expect(out.height).toBe(10);
  });

  it("keeps dimensions for a 180 degree rotation", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 180, crop: null });
    expect(out.width).toBe(10);
    expect(out.height).toBe(6);
  });

  it("swaps width/height for a 270 degree rotation", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 270, crop: null });
    expect(out.width).toBe(6);
    expect(out.height).toBe(10);
  });

  it("crops relative to the unrotated bounding box", () => {
    const src = makeSourceCanvas(10, 6);
    const out = renderRotatedCropped(src, { rotate: 0, crop: { x: 0.2, y: 0, w: 0.5, h: 1 } });
    expect(out.width).toBe(5);
    expect(out.height).toBe(6);
  });

  it("crops relative to the rotated bounding box after a 90 degree rotation", () => {
    const src = makeSourceCanvas(10, 6); // rotated box is 6 wide x 10 tall
    const out = renderRotatedCropped(src, { rotate: 90, crop: { x: 0, y: 0, w: 1, h: 0.5 } });
    expect(out.width).toBe(6);
    expect(out.height).toBe(5);
  });
});

describe("isNoopEdit", () => {
  it("is true for undefined", () => {
    expect(isNoopEdit(undefined)).toBe(true);
  });

  it("is true for the default edit", () => {
    expect(isNoopEdit(DEFAULT_IMAGE_EDIT)).toBe(true);
  });

  it("is false when rotate is set", () => {
    expect(isNoopEdit({ rotate: 90, crop: null })).toBe(false);
  });

  it("is false when crop is set", () => {
    expect(isNoopEdit({ rotate: 0, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- imageEdit.test.ts`
Expected: FAIL — `Failed to resolve import "./imageEdit"` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/tools/imageEdit.ts`:

```ts
export interface Rect {
  x: number; // 0..1, relative to the rotated bounding box
  y: number;
  w: number;
  h: number;
}

export interface ImageEdit {
  rotate: 0 | 90 | 180 | 270;
  crop: Rect | null;
}

export type ImageEdits = Record<number, ImageEdit>;

export const DEFAULT_IMAGE_EDIT: ImageEdit = { rotate: 0, crop: null };

export function isNoopEdit(edit: ImageEdit | undefined): boolean {
  return !edit || (edit.rotate === 0 && edit.crop === null);
}

type DrawableImage = CanvasImageSource & { width: number; height: number };

/**
 * Rotates `image` by `edit.rotate` (in 90-degree steps), then crops the
 * result to `edit.crop` (normalized against the ROTATED bounding box).
 * Shared by the live editor preview and both image engines so the preview
 * is exactly what gets produced.
 */
export function renderRotatedCropped(image: DrawableImage, edit: ImageEdit): HTMLCanvasElement {
  const sourceW = image.width;
  const sourceH = image.height;
  const swapped = edit.rotate === 90 || edit.rotate === 270;
  const rotatedW = swapped ? sourceH : sourceW;
  const rotatedH = swapped ? sourceW : sourceH;

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = rotatedW;
  rotatedCanvas.height = rotatedH;
  const rctx = rotatedCanvas.getContext("2d");
  if (!rctx) throw new Error("Canvas 2D context unavailable.");
  rctx.translate(rotatedW / 2, rotatedH / 2);
  rctx.rotate((edit.rotate * Math.PI) / 180);
  rctx.drawImage(image, -sourceW / 2, -sourceH / 2, sourceW, sourceH);

  if (!edit.crop) return rotatedCanvas;

  const sx = edit.crop.x * rotatedW;
  const sy = edit.crop.y * rotatedH;
  const sw = Math.max(1, Math.round(edit.crop.w * rotatedW));
  const sh = Math.max(1, Math.round(edit.crop.h * rotatedH));

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cctx = cropCanvas.getContext("2d");
  if (!cctx) throw new Error("Canvas 2D context unavailable.");
  cctx.drawImage(rotatedCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropCanvas;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- imageEdit.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/tools/imageEdit.ts apps/web/src/tools/imageEdit.test.ts
git commit -m "Add shared rotate/crop canvas renderer for image tools"
```

---

## Task 2: Wire edits into the Convert images engine

**Files:**
- Modify: `apps/web/src/engines/convertImages.ts`
- Modify: `apps/web/src/engines/testHelpers.ts`
- Test: `apps/web/src/engines/convertImages.test.ts`

**Interfaces:**
- Consumes: `renderRotatedCropped`, `DEFAULT_IMAGE_EDIT`, `ImageEdit`, `ImageEdits` from `@/tools/imageEdit` (Task 1). New `makeTestImageFile(width: number, height: number, name?: string): Promise<File>` from `./testHelpers`.
- Produces: `convertImagesEngine` now reads `options.edits: ImageEdits` (index-keyed) and applies rotate/crop before encoding. No change to its exported signature or `EngineResult` shape.

- [ ] **Step 1: Add a synthetic-image test helper**

`apps/web/src/engines/testHelpers.ts` currently ends with `makeTestPng`. Add after it:

```ts
// A synthetic image with real, distinguishable width/height — for tests
// that need to assert on rotate/crop output dimensions (a 1x1 PNG can't).
export async function makeTestImageFile(width: number, height: number, name = "test.png"): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in test environment.");
  ctx.fillStyle = "#3366ff";
  ctx.fillRect(0, 0, width, height);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
  return new File([blob], name, { type: "image/png" });
}
```

- [ ] **Step 2: Write the failing test**

Append to `apps/web/src/engines/convertImages.test.ts` (add the import at the top alongside the existing ones):

```ts
import { makeTestPng, makeTestImageFile } from "./testHelpers";
```

Add these two `it` blocks inside the existing `describe("convertImagesEngine", ...)`:

```ts
  it("rotates before converting", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const result = await convertImagesEngine({
      files: [file],
      options: { to: "png", edits: { 0: { rotate: 90, crop: null } } },
    });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(10);
    expect(bitmap.height).toBe(20);
  });

  it("crops within the rotated bounding box before converting", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const result = await convertImagesEngine({
      files: [file],
      options: { to: "png", edits: { 0: { rotate: 0, crop: { x: 0, y: 0, w: 0.5, h: 1 } } } },
    });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(10);
    expect(bitmap.height).toBe(10);
  });

  it("leaves a file with no edit entry untouched in size", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const result = await convertImagesEngine({ files: [file], options: { to: "png" } });

    const bitmap = await createImageBitmap(result.files[0].blob);
    expect(bitmap.width).toBe(20);
    expect(bitmap.height).toBe(10);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- convertImages.test.ts`
Expected: FAIL — the two new "rotates"/"crops" tests fail because `options.edits` is not read yet (rotated case: `bitmap.width` is `20`, not `10`).

- [ ] **Step 4: Write the implementation**

Replace the full contents of `apps/web/src/engines/convertImages.ts`:

```ts
import type { Engine, EngineOutputFile } from "./types";
import { renderRotatedCropped, DEFAULT_IMAGE_EDIT, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || /\.heic$|\.heif$/i.test(file.name);
}

async function convertOne(file: File, to: string, edit: ImageEdit): Promise<EngineOutputFile> {
  const bitmap = await createImageBitmap(file);
  const canvas = renderRotatedCropped(bitmap, edit);

  const mimeType = MIME_BY_FORMAT[to];
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mimeType, 0.92);
  });

  const newName = file.name.replace(/\.[^.]+$/, "") + "." + to;
  return { name: newName, blob };
}

export const convertImagesEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const to = (options.to as string) ?? "png";
  if (!Object.hasOwn(MIME_BY_FORMAT, to)) throw new Error(`Unsupported target format: ${to}`);

  const edits = (options.edits as ImageEdits | undefined) ?? {};
  const entries = files.map((file, index) => ({ file, index }));
  const heicEntries = entries.filter((e) => isHeic(e.file));
  const liveEntries = entries.filter((e) => !isHeic(e.file));

  const converted = await Promise.all(
    liveEntries.map((e) => convertOne(e.file, to, edits[e.index] ?? DEFAULT_IMAGE_EDIT)),
  );

  if (heicEntries.length > 0) {
    return {
      files: converted,
      summary:
        converted.length > 0
          ? `${converted.length} converted · ${heicEntries.length} HEIC file(s) need the full engine (preview) and were skipped`
          : `HEIC decoding is a preview feature — 0 of ${heicEntries.length} file(s) converted yet`,
      isPreview: true,
    };
  }

  return {
    files: converted,
    summary: `${converted.length} image(s) converted to ${to.toUpperCase()}`,
    isPreview: false,
  };
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- convertImages.test.ts`
Expected: PASS (all 6 tests — the 3 original plus the 3 new ones)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/engines/convertImages.ts apps/web/src/engines/convertImages.test.ts apps/web/src/engines/testHelpers.ts
git commit -m "Apply per-image rotate/crop edits in the Convert images engine"
```

---

## Task 3: Wire edits into the Images to PDF engine

**Files:**
- Modify: `apps/web/src/engines/imagesToPdf.ts`
- Test: `apps/web/src/engines/imagesToPdf.test.ts`

**Interfaces:**
- Consumes: `renderRotatedCropped`, `isNoopEdit`, `ImageEdit`, `ImageEdits` from `@/tools/imageEdit` (Task 1).
- Produces: `imagesToPdfEngine` now reads `options.edits: ImageEdits`. Files with no edit (or `isNoopEdit`) keep the existing direct `embedPng`/`embedJpg` fast path; files with an edit are rasterized through `renderRotatedCropped` first and embedded as PNG.

- [ ] **Step 1: Write the failing test**

Add this import to the top of `apps/web/src/engines/imagesToPdf.test.ts`:

```ts
import { makeTestImageFile } from "./testHelpers";
```

Add this `it` block inside `describe("imagesToPdfEngine", ...)`:

```ts
  it("rasterizes through canvas when a file has a rotate/crop edit", async () => {
    const file = await makeTestImageFile(20, 10, "wide.png");
    const spy = vi.spyOn(globalThis, "createImageBitmap");

    const result = await imagesToPdfEngine({
      files: [file],
      options: { margin: 0, edits: { 0: { rotate: 90, crop: null } } },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const out = await PDFDocument.load(await result.files[0].blob.arrayBuffer());
    expect(out.getPageCount()).toBe(1);
    spy.mockRestore();
  });

  it("skips rasterization and embeds directly when a file has no edit (fast path)", async () => {
    const a = toFile(makeTestPng(), "a.png");
    const spy = vi.spyOn(globalThis, "createImageBitmap");

    await imagesToPdfEngine({ files: [a], options: { margin: 0 } });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
```

Also add `vi` to the existing `import { describe, it, expect } from "vitest";` line, making it:

```ts
import { describe, it, expect, vi } from "vitest";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- imagesToPdf.test.ts`
Expected: FAIL on the first new test ("rasterizes through canvas...") — the current implementation never reads `options.edits` and never calls `createImageBitmap` at all, so `spy` has 0 calls instead of the expected 1. The second new test ("skips rasterization...") passes even before the implementation change, since the current code already never rasterizes anything — it becomes a meaningful regression guard once Task 3's implementation exists (it pins down that the fast path stays fast).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `apps/web/src/engines/imagesToPdf.ts`:

```ts
import { PDFDocument, type PDFImage } from "pdf-lib";
import type { Engine } from "./types";
import { renderRotatedCropped, isNoopEdit, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

const A4 = [595.28, 841.89] as const; // points

async function embedImage(doc: PDFDocument, file: File, edit: ImageEdit | undefined): Promise<PDFImage> {
  if (isNoopEdit(edit)) {
    const bytes = await file.arrayBuffer();
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    return isPng ? doc.embedPng(bytes) : doc.embedJpg(bytes);
  }

  const bitmap = await createImageBitmap(file);
  const canvas = renderRotatedCropped(bitmap, edit!);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), "image/png");
  });
  const bytes = await blob.arrayBuffer();
  return doc.embedPng(bytes);
}

export const imagesToPdfEngine: Engine = async ({ files, options }) => {
  if (files.length === 0) throw new Error("Add at least one image.");

  const margin = Number(options.margin ?? 24);
  if (margin < 0) throw new Error("Margin cannot be negative.");

  const edits = (options.edits as ImageEdits | undefined) ?? {};
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const image = await embedImage(doc, files[i], edits[i]);

    const [pageW, pageH] = A4;
    const page = doc.addPage([pageW, pageH]);
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;

    page.drawImage(image, {
      x: (pageW - w) / 2,
      y: (pageH - h) / 2,
      width: w,
      height: h,
    });
  }

  const outBytes = await doc.save();
  return {
    files: [{ name: "images.pdf", blob: new Blob([outBytes as BlobPart], { type: "application/pdf" }) }],
    summary: `${files.length} images → 1 PDF, ${files.length} pages`,
    isPreview: false,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- imagesToPdf.test.ts`
Expected: PASS (all 5 tests — the 3 original plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/engines/imagesToPdf.ts apps/web/src/engines/imagesToPdf.test.ts
git commit -m "Apply per-image rotate/crop edits in the Images to PDF engine"
```

---

## Task 4: Image edit modal (rotate + freeform crop UI)

**Files:**
- Create: `apps/web/src/components/ImageEditModal.tsx`
- Test: `apps/web/src/components/ImageEditModal.test.tsx`

**Interfaces:**
- Consumes: `ImageEdit`, `Rect`, `renderRotatedCropped` from `@/tools/imageEdit` (Task 1); `makeTestPng` from `@/engines/testHelpers` (test only).
- Produces: `ImageEditModal({ file: File; edit: ImageEdit; onApply: (edit: ImageEdit) => void; onClose: () => void })`. Task 5 (`ImageInputList`) renders this directly.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ImageEditModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageEditModal } from "./ImageEditModal";
import { DEFAULT_IMAGE_EDIT } from "@/tools/imageEdit";
import { makeTestPng } from "@/engines/testHelpers";

function makeFile() {
  return new File([makeTestPng() as BlobPart], "a.png", { type: "image/png" });
}

describe("ImageEditModal", () => {
  it("applies a 90 degree rotation when Rotate right then Apply is clicked", async () => {
    const onApply = vi.fn();
    render(<ImageEditModal file={makeFile()} edit={DEFAULT_IMAGE_EDIT} onApply={onApply} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledWith({ rotate: 90, crop: null });
  });

  it("wraps rotation from 270 back to 0", async () => {
    const onApply = vi.fn();
    render(
      <ImageEditModal file={makeFile()} edit={{ rotate: 270, crop: null }} onApply={onApply} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledWith({ rotate: 0, crop: null });
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<ImageEditModal file={makeFile()} edit={DEFAULT_IMAGE_EDIT} onApply={vi.fn()} onClose={onClose} />);

    fireEvent.click(await screen.findByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("Reset clears rotation back to 0 before Apply", async () => {
    const onApply = vi.fn();
    render(
      <ImageEditModal file={makeFile()} edit={{ rotate: 180, crop: null }} onApply={onApply} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByText("Reset"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledWith({ rotate: 0, crop: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- ImageEditModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./ImageEditModal"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/ImageEditModal.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { renderRotatedCropped, type ImageEdit, type Rect } from "@/tools/imageEdit";

const MIN_SIZE = 0.06;
const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };
const CORNERS = ["nw", "ne", "sw", "se"] as const;
type Handle = "move" | (typeof CORNERS)[number];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

interface Drag {
  handle: Handle;
  startX: number;
  startY: number;
  startRect: Rect;
}

export function ImageEditModal({
  file,
  edit,
  onApply,
  onClose,
}: {
  file: File;
  edit: ImageEdit;
  onApply: (edit: ImageEdit) => void;
  onClose: () => void;
}) {
  const [rotate, setRotate] = useState(edit.rotate);
  const [crop, setCrop] = useState<Rect | null>(edit.crop);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    let cancelled = false;
    createImageBitmap(file).then((b) => {
      if (!cancelled) setBitmap(b);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const rotatedAspect = useMemo(() => {
    if (!bitmap) return 1;
    const swapped = rotate === 90 || rotate === 270;
    const w = swapped ? bitmap.height : bitmap.width;
    const h = swapped ? bitmap.width : bitmap.height;
    return w / h;
  }, [bitmap, rotate]);

  useEffect(() => {
    if (!bitmap || !canvasRef.current) return;
    const rotatedOnly = renderRotatedCropped(bitmap, { rotate, crop: null });
    canvasRef.current.width = rotatedOnly.width;
    canvasRef.current.height = rotatedOnly.height;
    canvasRef.current.getContext("2d")?.drawImage(rotatedOnly, 0, 0);
  }, [bitmap, rotate]);

  const displayRect = crop ?? FULL_RECT;

  function onHandlePointerDown(handle: Handle, e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startRect: displayRect };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / bounds.width;
    const dy = (e.clientY - drag.startY) / bounds.height;
    const s = drag.startRect;

    if (drag.handle === "move") {
      setCrop({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      return;
    }

    let { x, y, w, h } = s;
    if (drag.handle === "nw" || drag.handle === "sw") {
      const newX = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
      w = s.w - (newX - s.x);
      x = newX;
    }
    if (drag.handle === "ne" || drag.handle === "se") {
      w = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
    }
    if (drag.handle === "nw" || drag.handle === "ne") {
      const newY = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
      h = s.h - (newY - s.y);
      y = newY;
    }
    if (drag.handle === "sw" || drag.handle === "se") {
      h = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
    }
    setCrop({ x, y, w, h });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function rotateBy(delta: 90 | -90) {
    setRotate(((rotate + delta + 360) % 360) as ImageEdit["rotate"]);
    setCrop(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-[560px] flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Edit {file.name}</span>
          <button type="button" onClick={onClose} className="text-muted hover:text-text" aria-label="Close">
            ×
          </button>
        </div>

        <div
          ref={frameRef}
          className="relative mx-auto w-full touch-none overflow-hidden rounded-xl border border-border bg-surface-2"
          style={{ aspectRatio: rotatedAspect || 1, maxHeight: "50vh" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div
            className="absolute cursor-move border-2 border-accent bg-accent/10"
            style={{
              left: `${displayRect.x * 100}%`,
              top: `${displayRect.y * 100}%`,
              width: `${displayRect.w * 100}%`,
              height: `${displayRect.h * 100}%`,
            }}
            onPointerDown={(e) => onHandlePointerDown("move", e)}
          >
            {CORNERS.map((corner) => (
              <span
                key={corner}
                onPointerDown={(e) => onHandlePointerDown(corner, e)}
                className="absolute size-3 rounded-full border border-accent bg-surface"
                style={{
                  left: corner.includes("w") ? -6 : undefined,
                  right: corner.includes("e") ? -6 : undefined,
                  top: corner.includes("n") ? -6 : undefined,
                  bottom: corner.includes("s") ? -6 : undefined,
                  cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => rotateBy(-90)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px]">
            Rotate left
          </button>
          <button type="button" onClick={() => rotateBy(90)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px]">
            Rotate right
          </button>
          <button
            type="button"
            onClick={() => {
              setRotate(0);
              setCrop(null);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] text-muted"
          >
            Reset
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply({ rotate, crop })}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- ImageEditModal.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ImageEditModal.tsx apps/web/src/components/ImageEditModal.test.tsx
git commit -m "Add ImageEditModal: rotate + freeform crop editor for one image"
```

---

## Task 5: Image input list (thumbnails + Edit trigger)

**Files:**
- Create: `apps/web/src/components/ImageInputList.tsx`
- Test: `apps/web/src/components/ImageInputList.test.tsx`

**Interfaces:**
- Consumes: `ImageEditModal` (Task 4); `DEFAULT_IMAGE_EDIT`, `ImageEdit`, `ImageEdits` from `@/tools/imageEdit` (Task 1).
- Produces: `ImageInputList({ files: File[]; options: Record<string, unknown>; onChange: (options: Record<string, unknown>) => void; disabled: boolean })`. Task 7 (`ToolPage`) renders this for `tool.category === "image"`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ImageInputList.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageInputList } from "./ImageInputList";
import { makeTestPng } from "@/engines/testHelpers";

function makeFile(name: string) {
  return new File([makeTestPng() as BlobPart], name, { type: "image/png" });
}

describe("ImageInputList", () => {
  it("lists every file with an Edit button", () => {
    render(
      <ImageInputList files={[makeFile("a.png"), makeFile("b.png")]} options={{}} onChange={vi.fn()} disabled={false} />,
    );

    expect(screen.getByText("a.png")).toBeInTheDocument();
    expect(screen.getByText("b.png")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
  });

  it("shows an edit summary badge once an edit exists for that index", () => {
    render(
      <ImageInputList
        files={[makeFile("a.png")]}
        options={{ edits: { 0: { rotate: 90, crop: null } } }}
        onChange={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText(/rotated 90/)).toBeInTheDocument();
  });

  it("opens the editor and writes the applied edit back through onChange", async () => {
    const onChange = vi.fn();
    render(<ImageInputList files={[makeFile("a.png")]} options={{}} onChange={onChange} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByText("Rotate right"));
    fireEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith({ edits: { 0: { rotate: 90, crop: null } } });
  });

  it("disables the Edit button when disabled is true", () => {
    render(<ImageInputList files={[makeFile("a.png")]} options={{}} onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- ImageInputList.test.tsx`
Expected: FAIL — `Failed to resolve import "./ImageInputList"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/ImageInputList.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ImageEditModal } from "./ImageEditModal";
import { DEFAULT_IMAGE_EDIT, type ImageEdit, type ImageEdits } from "@/tools/imageEdit";

function Thumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (
    <img src={url} alt="" className="size-11 flex-none rounded-lg border border-border object-cover" />
  ) : (
    <span className="size-11 flex-none rounded-lg border border-border bg-surface-3" />
  );
}

function describeEdit(edit: ImageEdit | undefined): string | null {
  if (!edit) return null;
  const parts: string[] = [];
  if (edit.rotate !== 0) parts.push(`rotated ${edit.rotate}°`);
  if (edit.crop) parts.push("cropped");
  return parts.length ? parts.join(" · ") : null;
}

export function ImageInputList({
  files,
  options,
  onChange,
  disabled,
}: {
  files: File[];
  options: Record<string, unknown>;
  onChange: (options: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const edits = (options.edits as ImageEdits | undefined) ?? {};

  function applyEdit(index: number, edit: ImageEdit) {
    onChange({ ...options, edits: { ...edits, [index]: edit } });
    setEditingIndex(null);
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {files.map((f, i) => {
          const summary = describeEdit(edits[i]);
          return (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
              <Thumbnail file={f} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.name}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                  {(f.size / 1024).toFixed(0)} KB{summary ? ` · ${summary}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setEditingIndex(i)}
                className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-50"
              >
                Edit
              </button>
            </li>
          );
        })}
      </ul>
      {editingIndex !== null && files[editingIndex] && (
        <ImageEditModal
          file={files[editingIndex]}
          edit={edits[editingIndex] ?? DEFAULT_IMAGE_EDIT}
          onApply={(edit) => applyEdit(editingIndex, edit)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- ImageInputList.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ImageInputList.tsx apps/web/src/components/ImageInputList.test.tsx
git commit -m "Add ImageInputList: thumbnails + per-image Edit trigger"
```

---

## Task 6: Camera capture

**Files:**
- Create: `apps/web/src/components/CameraCapture.tsx`
- Test: `apps/web/src/components/CameraCapture.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (self-contained; talks to `navigator.mediaDevices` directly).
- Produces: `CameraCapture({ onDone: (files: File[]) => void; onClose: () => void })`. Task 7 (`ToolPage`) renders this, wiring `onDone` to the same `handleFiles` used by `FileDropZone`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/CameraCapture.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CameraCapture } from "./CameraCapture";

describe("CameraCapture", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    });
  });

  it("shows a graceful error message when the camera can't be accessed", async () => {
    render(<CameraCapture onDone={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByText(/couldn't access the camera/i)).toBeInTheDocument();
  });

  it("does not render a Capture button while the camera failed to start", async () => {
    render(<CameraCapture onDone={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(/couldn't access the camera/i);
    expect(screen.queryByRole("button", { name: /^capture$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- CameraCapture.test.tsx`
Expected: FAIL — `Failed to resolve import "./CameraCapture"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/CameraCapture.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

interface Shot {
  file: File;
  url: string;
}

export function CameraCapture({
  onDone,
  onClose,
}: {
  onDone: (files: File[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotCount = useRef(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch {
          if (!cancelled) {
            setError("Couldn't access the camera. Check your browser's camera permission and try again.");
          }
          return;
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopAndClose() {
    stopStream();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onClose();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        shotCount.current += 1;
        const file = new File([blob], `scan-${shotCount.current}.jpg`, { type: "image/jpeg" });
        setShots((prev) => [...prev, { file, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.92,
    );
  }

  function removeShot(index: number) {
    setShots((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function finish() {
    stopStream();
    onDone(shots.map((s) => s.file));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex w-full max-w-[520px] flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Scan with camera</span>
          <button type="button" onClick={stopAndClose} className="text-muted hover:text-text" aria-label="Close">
            ×
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-border bg-surface-2 p-4 text-[13px] text-muted">{error}</div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-surface-3">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no captions apply */}
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
            </div>
            <button
              type="button"
              onClick={capture}
              className="h-10 rounded-[11px] bg-accent text-sm font-semibold text-on-accent transition-transform duration-100 active:scale-[0.97]"
            >
              Capture
            </button>
          </>
        )}

        {shots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shots.map((s, i) => (
              <div key={s.url} className="relative">
                <img src={s.url} alt="" className="size-14 rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => removeShot(i)}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-surface text-[11px]"
                  aria-label={`Remove shot ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={stopAndClose} className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={finish}
            disabled={shots.length === 0}
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
          >
            Use {shots.length} photo{shots.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- CameraCapture.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/CameraCapture.tsx apps/web/src/components/CameraCapture.test.tsx
git commit -m "Add CameraCapture: multi-shot camera scan modal"
```

---

## Task 7: Wire ImageInputList and CameraCapture into ToolPage

**Files:**
- Modify: `apps/web/src/components/ToolPage.tsx`
- Modify: `apps/web/src/components/ToolPage.test.tsx`

**Interfaces:**
- Consumes: `ImageInputList` (Task 5), `CameraCapture` (Task 6).
- Produces: no exported change — `ToolPage`'s existing `{ tool: ToolConfig }` prop is unchanged. Behavior only: image-category tools get a thumbnail/edit list instead of the plain file list, and a "Scan with camera" entry point in the empty state.

- [ ] **Step 1: Write the failing test**

Add this `it` block inside `describe("ToolPage", ...)` in `apps/web/src/components/ToolPage.test.tsx`:

```tsx
  it("offers camera scan and an image edit list for image-category tools", async () => {
    const tool = makeTool({ category: "image", accept: [".png"], multiple: true });
    render(<ToolPage tool={tool} />);

    expect(screen.getByRole("button", { name: /scan with camera/i })).toBeInTheDocument();

    const file = new File(["content"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("does not offer camera scan for pdf-category tools", () => {
    const tool = makeTool({ category: "pdf" });
    render(<ToolPage tool={tool} />);
    expect(screen.queryByRole("button", { name: /scan with camera/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test -- ToolPage.test.tsx`
Expected: FAIL on the first new test — no "Scan with camera" button exists yet.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/components/ToolPage.tsx`, update the imports at the top:

```tsx
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ToolConfig } from "@/tools/ToolConfig";
import type { EngineResult } from "@/engines/types";
import { tintButtonBg } from "@/tools/tint";
import { FileDropZone } from "./FileDropZone";
import { ResultCard } from "./ResultCard";
import { ImageInputList } from "./ImageInputList";
import { CameraCapture } from "./CameraCapture";
```

Add a `showCamera` state next to the existing `useState` calls (after the `dismissedSizeWarning` line):

```tsx
  const [dismissedSizeWarning, setDismissedSizeWarning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
```

Replace the `step === "empty"` block:

```tsx
            {step === "empty" && (
              <motion.div key="empty" {...stepFade}>
                <FileDropZone accept={tool.accept} multiple={tool.multiple} onFiles={handleFiles} />
                {tool.category === "image" && (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[12px] text-faint">or</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[11px] border border-border bg-surface text-sm font-medium text-text transition-transform duration-100 hover:bg-surface-2 active:scale-[0.97]"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h1l.8-1.2A1 1 0 0 1 6.6 2.4h2.8a1 1 0 0 1 .8.4L11 4h1a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-6z" />
                        <circle cx="8" cy="8.2" r="2.4" />
                      </svg>
                      Scan with camera
                    </button>
                  </>
                )}
              </motion.div>
            )}
```

Replace the `<ul>...</ul>` file list inside the `(step === "ready" || step === "running")` block:

```tsx
                <ul className="flex flex-col gap-2">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{f.name}</div>
                        <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                          {(f.size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                      {step === "running" && (
                        <svg className="spinner size-4 flex-none text-accent" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                          <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </li>
                  ))}
                </ul>
```

with:

```tsx
                {tool.category === "image" ? (
                  <ImageInputList files={files} options={options} onChange={setOptions} disabled={step === "running"} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {files.map((f) => (
                      <li key={f.name} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 p-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{f.name}</div>
                          <div className="mt-0.5 font-mono text-[11.5px] text-muted">
                            {(f.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                        {step === "running" && (
                          <svg className="spinner size-4 flex-none text-accent" viewBox="0 0 20 20" fill="none">
                            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                            <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
```

Finally, render the camera modal at the end of the component's returned JSX, as a sibling of the outermost `<div className="mx-auto max-w-6xl px-8 py-8">`:

```tsx
      </div>

      {showCamera && (
        <CameraCapture
          onDone={(capturedFiles) => {
            setShowCamera(false);
            if (capturedFiles.length > 0) handleFiles(capturedFiles);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
```

(This replaces the component's final `</div>\n  );\n}` with the same closing tags plus the new conditional block inserted before the outer `</div>`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/web run test -- ToolPage.test.tsx`
Expected: PASS (all 4 tests — the 2 original plus the 2 new ones)

- [ ] **Step 5: Run the full test suite**

Run: `npm --prefix apps/web run test`
Expected: PASS, no regressions in any other test file.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ToolPage.tsx apps/web/src/components/ToolPage.test.tsx
git commit -m "Wire camera scan and image edit list into ToolPage for image tools"
```

---

## Task 8: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `npm --prefix apps/web run typecheck`
Expected: no errors.

- [ ] **Step 2: Start the dev server**

Use `preview_start` with the `web` launch config (`.claude/launch.json`), or run:

```bash
npm --prefix apps/web run dev
```

- [ ] **Step 3: Verify Images to PDF**

Navigate to `/tools/images-to-pdf`. Drop 2 image files. Confirm:
- Each file shows a thumbnail and an "Edit" button (not the old plain text-only row).
- Clicking "Edit" opens the modal with a live preview of that image.
- "Rotate right" visibly rotates the preview; dragging the crop box's corner handles resizes it and dragging inside moves it.
- "Apply" closes the modal and the file row now shows a "rotated…"/"cropped" summary.
- Running the tool produces a PDF; open the downloaded PDF and confirm the edited image appears rotated/cropped as edited, and any untouched image is unchanged.

- [ ] **Step 4: Verify Convert images**

Navigate to `/tools/convert-images`. Repeat the same edit flow, run the tool, and confirm the downloaded image file reflects the rotate/crop.

- [ ] **Step 5: Verify camera scan UI (permission-denied path)**

Since this environment's browser preview cannot grant real camera hardware access, verify the graceful-failure path: open `/tools/images-to-pdf` with no files added, click "Scan with camera", and confirm the modal shows the "Couldn't access the camera…" message rather than crashing (the automated test in Task 6 already covers this branch directly; this step confirms it renders correctly inside the full page, not just in isolation).

- [ ] **Step 6: Confirm PDF tools are unaffected**

Navigate to `/tools/merge` (a `pdf`-category tool). Confirm there is no "Scan with camera" button and the file list still shows the original plain rows (no thumbnails, no Edit button) — image-only behavior did not leak into PDF tools.

- [ ] **Step 7: Full regression pass**

Run: `npm --prefix apps/web run test` and `npm --prefix apps/web run typecheck` one more time after any fixes made during manual verification.
Expected: both pass clean.
