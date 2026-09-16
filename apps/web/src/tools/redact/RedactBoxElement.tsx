import { useRef } from "react";
import type { RedactBox } from "./types";

/** One placed redaction box: draggable by its body, resizable from the bottom-right handle. */
export function RedactBoxElement({
  box,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  containerRef,
}: {
  box: RedactBox;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Pick<RedactBox, "xPct" | "yPct" | "wPct" | "hPct">>) => void;
  onDelete: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: RedactBox } | null>(null);

  function onPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dxPct = (e.clientX - d.startX) / rect.width;
    const dyPct = (e.clientY - d.startY) / rect.height;
    if (d.mode === "move") {
      const xPct = clamp(d.box.xPct + dxPct, 0, 1 - d.box.wPct);
      const yPct = clamp(d.box.yPct + dyPct, 0, 1 - d.box.hPct);
      onUpdate({ xPct, yPct });
    } else {
      const wPct = clamp(d.box.wPct + dxPct, 0.02, 1 - d.box.xPct);
      const hPct = clamp(d.box.hPct + dyPct, 0.02, 1 - d.box.yPct);
      onUpdate({ wPct, hPct });
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${box.xPct * 100}%`,
    top: `${box.yPct * 100}%`,
    width: `${box.wPct * 100}%`,
    height: `${box.hPct * 100}%`,
  };

  return (
    <div
      style={style}
      className={`group cursor-move select-none rounded-sm bg-black ${
        selected ? "outline outline-2 outline-accent" : "outline outline-1 outline-dashed outline-white/40 hover:outline-accent/60"
      }`}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
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
            aria-label="Delete box"
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
