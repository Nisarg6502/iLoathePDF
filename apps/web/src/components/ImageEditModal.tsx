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
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    let cancelled = false;
    createImageBitmap(file)
      .then((b) => {
        if (!cancelled) setBitmap(b);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't open this image. It may be corrupted or in an unsupported format.");
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

        {error ? (
          <div className="rounded-xl border border-border bg-surface-2 p-4 text-[13px] text-muted">{error}</div>
        ) : (
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
        )}

        <div className="flex items-center gap-2">
          {!error && (
            <>
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
            </>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px]">
            Cancel
          </button>
          {!error && (
            <button
              type="button"
              onClick={() => onApply({ rotate, crop })}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
