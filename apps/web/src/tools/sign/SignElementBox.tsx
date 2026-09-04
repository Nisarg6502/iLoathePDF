import { useRef } from "react";
import type { SignElement } from "./types";
import { isImageElement } from "./types";

/** One placed element: draggable by its body, resizable from the bottom-right handle. */
export function SignElementBox({
  element,
  pxPerPt,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  containerRef,
}: {
  element: SignElement;
  /** CSS px per PDF point at this page's current render size, for font sizing. */
  pxPerPt: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Pick<SignElement, "xPct" | "yPct" | "wPct" | "hPct">>) => void;
  onDelete: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; el: SignElement } | null>(null);

  function onPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, el: element };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dxPct = (e.clientX - d.startX) / rect.width;
    const dyPct = (e.clientY - d.startY) / rect.height;
    if (d.mode === "move") {
      const xPct = clamp(d.el.xPct + dxPct, 0, 1 - d.el.wPct);
      const yPct = clamp(d.el.yPct + dyPct, 0, 1 - d.el.hPct);
      onUpdate({ xPct, yPct });
    } else {
      const wPct = clamp(d.el.wPct + dxPct, 0.02, 1 - d.el.xPct);
      const hPct = clamp(d.el.hPct + dyPct, 0.015, 1 - d.el.yPct);
      onUpdate({ wPct, hPct });
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${element.xPct * 100}%`,
    top: `${element.yPct * 100}%`,
    width: `${element.wPct * 100}%`,
    height: `${element.hPct * 100}%`,
  };

  return (
    <div
      style={style}
      className={`group cursor-move select-none rounded-sm ${
        selected ? "outline outline-2 outline-accent" : "outline outline-1 outline-dashed outline-black/20 hover:outline-accent/60"
      }`}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {isImageElement(element) ? (
        <img src={element.imageDataUrl} alt="" className="pointer-events-none size-full object-contain" draggable={false} />
      ) : (
        <div
          className="pointer-events-none flex size-full items-center overflow-hidden whitespace-nowrap"
          style={{ fontSize: `${element.fontSize * pxPerPt}px`, color: element.color, lineHeight: 1 }}
        >
          {element.text || " "}
        </div>
      )}

      {selected && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-danger text-[10px] text-white shadow"
            aria-label="Delete element"
          >
            ✕
          </button>
          <div
            onPointerDown={(e) => onPointerDown(e, "resize")}
            className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize rounded-full border-2 border-accent bg-white"
          />
        </>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (hi < lo) hi = lo;
  return Math.min(hi, Math.max(lo, n));
}
