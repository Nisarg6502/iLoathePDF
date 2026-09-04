import { useEffect, useState } from "react";
import type { OptionsPanelProps } from "@/tools/ToolConfig";

export function OrganizeOptions({ options, onChange, disabled }: OptionsPanelProps) {
  const order = (options.order as number[]) ?? [];
  const remove = new Set((options.remove as number[]) ?? []);
  const [pageCount, setPageCount] = useState(order.length);

  useEffect(() => {
    if (order.length === 0 && pageCount > 0) {
      onChange({ ...options, order: Array.from({ length: pageCount }, (_, i) => i) });
    }
  }, [pageCount]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold">Page count (from your PDF)</span>
        <input
          type="number"
          min={1}
          disabled={disabled}
          value={pageCount || ""}
          onChange={(e) => setPageCount(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
      </label>
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
