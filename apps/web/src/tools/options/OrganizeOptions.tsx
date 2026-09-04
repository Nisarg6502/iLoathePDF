import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function OrganizeOptions({ options, onChange, disabled, files }: OptionsPanelProps) {
  const order = (options.order as number[]) ?? [];
  const remove = new Set((options.remove as number[]) ?? []);
  const file = files?.[0];
  const [error, setError] = useState<string | null>(null);

  // Derive the page count from the actual PDF instead of asking the user to
  // type it in — a mismatched or missing count used to silently produce a
  // zero-page (or out-of-range) output.
  useEffect(() => {
    let cancelled = false;
    if (!file) return;
    setError(null);
    file
      .arrayBuffer()
      .then((bytes) => PDFDocument.load(bytes))
      .then((doc) => {
        if (cancelled) return;
        const count = doc.getPageCount();
        onChange({ ...options, order: Array.from({ length: count }, (_, i) => i) });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't read that PDF to count its pages.");
      });
    return () => {
      cancelled = true;
    };
    // Only re-derive when the selected file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ ...options, order: next });
  }

  function toggleRemove(pageIndex: number) {
    const next = new Set(remove);
    next.has(pageIndex) ? next.delete(pageIndex) : next.add(pageIndex);
    onChange({ ...options, remove: Array.from(next) });
  }

  if (error) {
    return <p className="text-[12.5px] text-danger">{error}</p>;
  }

  if (order.length === 0) {
    return <p className="text-[12.5px] text-muted">Add a PDF to see its pages here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[12.5px] font-semibold">{order.length} pages</span>
      <ul className="flex flex-col gap-1.5">
        {order.map((pageIndex, position) => (
          <li key={pageIndex} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12.5px]">
            <span className={remove.has(pageIndex) ? "text-faint line-through" : ""}>Page {pageIndex + 1}</span>
            <span className="flex-1" />
            <button type="button" disabled={disabled} onClick={() => move(position, position - 1)}>↑</button>
            <button type="button" disabled={disabled} onClick={() => move(position, position + 1)}>↓</button>
            <button type="button" disabled={disabled} onClick={() => toggleRemove(pageIndex)}>
              {remove.has(pageIndex) ? "Keep" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
