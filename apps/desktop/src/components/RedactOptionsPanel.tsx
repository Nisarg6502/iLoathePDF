import { Button } from "./ui/button";
import type { RedactBox, RedactMode } from "@/lib/redactTypes";
import { msg, tr, useTranslation } from "@iloathepdf/i18n";

const MODE_COPY: Record<RedactMode, string> = {
  visual:
    msg("Draws a black box over each area. The PDF's original text and images are still underneath — recoverable by anyone who knows to look."),
  true:
    msg("Flattens every page that has a box to a picture, so nothing underneath survives. Only pages with a box are affected; the rest of the document stays fully searchable."),
};

export function RedactOptionsPanel({
  mode,
  onModeChange,
  boxes,
  selectedId,
  activePageIndex,
  onAddBox,
  onSelect,
  onDelete,
}: {
  mode: RedactMode;
  onModeChange: (mode: RedactMode) => void;
  boxes: RedactBox[];
  selectedId: string | null;
  activePageIndex: number;
  onAddBox: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">{t("MODE")}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === "visual" ? "primary" : "secondary"} size="sm" onClick={() => onModeChange("visual")}>
            {t("Visual cover-up")}
          </Button>
          <Button variant={mode === "true" ? "primary" : "secondary"} size="sm" onClick={() => onModeChange("true")}>
            {t("True redact")}
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-muted">{tr(MODE_COPY[mode])}</p>
      </div>

      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          {t("PAGE {{page}}", { page: activePageIndex + 1 })}
        </div>
        <Button variant="secondary" size="sm" onClick={onAddBox} className="w-full">
          {t("Add box")}
        </Button>
      </div>

      <div>
        <div className="mb-2 font-mono text-[11px] font-bold tracking-[0.13em] text-faint">
          {t("BOXES ({{count}})", { count: boxes.length })}
        </div>
        <ul className="flex flex-col gap-1.5">
          {boxes.map((b) => (
            <li
              key={b.id}
              onClick={() => onSelect(b.id)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12.5px] ${
                selectedId === b.id ? "border-accent bg-accent-soft" : "border-border bg-surface-2"
              }`}
            >
              <span className="text-text">{t("Box · p{{page}}", { page: b.pageIndex + 1 })}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(b.id);
                }}
                className="text-muted hover:text-danger"
              >
                ✕
              </button>
            </li>
          ))}
          {boxes.length === 0 && <li className="text-[12.5px] text-muted">{t("Nothing placed yet.")}</li>}
        </ul>
      </div>
    </div>
  );
}
