import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { trimCanvasToInk } from "@/lib/trimCanvas";
import { loadSavedMarks, saveMark, removeMark, type SavedSignKind, type SavedSignMark } from "@/lib/signatureStore";

const CANVAS_SIZE: Record<SavedSignKind, { w: number; h: number }> = {
  signature: { w: 560, h: 200 },
  initials: { w: 260, h: 160 },
};

export function SignatureCapture({
  kind,
  onClose,
  onPick,
}: {
  kind: SavedSignKind;
  onClose: () => void;
  onPick: (imageDataUrl: string) => void;
}) {
  const [tab, setTab] = useState<"draw" | "upload">("draw");
  const [saved, setSaved] = useState<SavedSignMark[]>(() => loadSavedMarks(kind));
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const label = kind === "signature" ? "signature" : "initials";
  const size = CANVAS_SIZE[kind];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = kind === "signature" ? 2.6 : 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111111";
  }, [kind]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearDraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function useSaved(mark: SavedSignMark) {
    onPick(mark.imageDataUrl);
  }

  function removeSaved(id: string) {
    setSaved(removeMark(kind, id));
  }

  function confirm() {
    if (tab === "upload") {
      if (!uploadPreview) return;
      setSaved(saveMark(kind, uploadPreview));
      onPick(uploadPreview);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const trimmed = trimCanvasToInk(canvas);
    const dataUrl = trimmed.toDataURL("image/png");
    setSaved(saveMark(kind, dataUrl));
    onPick(dataUrl);
  }

  const canConfirm = tab === "draw" ? hasInk : Boolean(uploadPreview);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="w-full max-w-[620px] rounded-card border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[16px] font-semibold capitalize text-text">Add {label}</h2>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        {saved.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Saved {label}s</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {saved.map((m) => (
                <div key={m.id} className="group relative rounded-lg border border-border bg-white p-1.5">
                  <button type="button" onClick={() => useSaved(m)} className="block">
                    <img src={m.imageDataUrl} alt="Saved mark" className="h-10 w-auto object-contain" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSaved(m.id)}
                    className="absolute -right-1.5 -top-1.5 hidden size-4.5 place-items-center rounded-full bg-surface-3 text-[10px] text-muted group-hover:grid hover:text-danger"
                    aria-label="Remove saved mark"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-1.5 rounded-[10px] border border-border bg-surface-2 p-1 text-[13px]">
          <button
            type="button"
            onClick={() => setTab("draw")}
            className={`flex-1 rounded-lg py-1.5 font-medium ${tab === "draw" ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`flex-1 rounded-lg py-1.5 font-medium ${tab === "upload" ? "bg-surface shadow-sm" : "text-muted"}`}
          >
            Upload
          </button>
        </div>

        {tab === "draw" ? (
          <div className="mt-3">
            <canvas
              ref={canvasRef}
              width={size.w}
              height={size.h}
              className="w-full touch-none rounded-xl border border-border bg-white"
              style={{ aspectRatio: `${size.w} / ${size.h}` }}
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
            <button type="button" onClick={clearDraw} className="mt-2 text-[12.5px] text-muted hover:text-text">
              Clear
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="block w-full text-[13px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
            />
            {uploadPreview && (
              <div className="mt-3 grid place-items-center rounded-xl border border-border bg-white p-3">
                <img src={uploadPreview} alt="Upload preview" className="max-h-[140px] object-contain" />
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={confirm} disabled={!canConfirm}>
            Use this {label}
          </Button>
        </div>
      </div>
    </div>
  );
}
