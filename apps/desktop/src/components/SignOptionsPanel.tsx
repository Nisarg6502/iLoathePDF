import { Button } from "./ui/button";
import { SIGN_TEXT_COLORS, isImageSignElement, type SignElement } from "@/lib/signTypes";

export function SignOptionsPanel({
  elements,
  selectedId,
  activePageIndex,
  onAddCapture,
  onAddText,
  onSelect,
  onUpdate,
  onDelete,
}: {
  elements: SignElement[];
  selectedId: string | null;
  activePageIndex: number;
  onAddCapture: (kind: "signature" | "initials") => void;
  onAddText: (kind: "text" | "date") => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<SignElement>) => void;
  onDelete: (id: string) => void;
}) {
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          ADD TO PAGE {activePageIndex + 1}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => onAddCapture("signature")}>
            Signature
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAddCapture("initials")}>
            Initials
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAddText("text")}>
            Text
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAddText("date")}>
            Date
          </Button>
        </div>
      </div>

      {selected && !isImageSignElement(selected) && (
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Edit {selected.kind}</div>
          <input
            type="text"
            value={selected.text}
            onChange={(e) => onUpdate(selected.id, { text: e.target.value })}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-text"
          />
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[12px] text-muted">Size</label>
            <input
              type="range"
              min={8}
              max={48}
              value={selected.fontSize}
              onChange={(e) => onUpdate(selected.id, { fontSize: Number(e.target.value) })}
              className="flex-1"
            />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {SIGN_TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onUpdate(selected.id, { color: c })}
                className={`size-5.5 rounded-full border-2 ${selected.color === c ? "border-accent" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          ELEMENTS ({elements.length})
        </div>
        <ul className="flex flex-col gap-1.5">
          {elements.map((el) => (
            <li
              key={el.id}
              onClick={() => onSelect(el.id)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
                selectedId === el.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2"
              }`}
            >
              <span className="capitalize text-text">
                {el.kind} · p{el.pageIndex + 1}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(el.id);
                }}
                className="text-muted hover:text-danger"
              >
                ✕
              </button>
            </li>
          ))}
          {elements.length === 0 && <li className="text-[12.5px] text-muted">Nothing placed yet.</li>}
        </ul>
      </div>
    </div>
  );
}
