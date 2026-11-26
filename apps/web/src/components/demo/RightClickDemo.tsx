/**
 * The desktop app's right-click menu, played out: select files in File
 * Explorer (or Finder), right-click, and the iLoathePDF items shown are the
 * ones that fit the selection. The in-place ones finish with the app's small
 * progress card and a new file next to the old.
 *
 * The items and their order are the real ones: src-tauri/windows/
 * context-menu.nsh on Windows, src/lib/finderActions.ts on a Mac (both in
 * apps/desktop). Keep them in step when the menu changes.
 */
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { msg } from "@iloathepdf/i18n/msg";
import { useTranslation } from "@iloathepdf/i18n";

import { Cursor, EASE_OUT, MenuFiller, SceneTabs, Stage, popIn, useDemoLoop, type Frame } from "./DemoKit";

export type DemoOs = "windows" | "mac";

const W = 600;
const H = 340;

type Kind = "pdf" | "image" | "zip" | "folder";

interface Row {
  name: string;
  size: string;
  kind: Kind;
}

const FILES: Row[] = [
  { name: "report.pdf", size: "2.4 MB", kind: "pdf" },
  { name: "contract.pdf", size: "860 KB", kind: "pdf" },
  { name: "IMG_2041.heic", size: "3.1 MB", kind: "image" },
  { name: "scan.png", size: "1.8 MB", kind: "image" },
  { name: "photos.zip", size: "12.6 MB", kind: "zip" },
];

/** One per scene, in scene order: what each job leaves next to the files. */
const OUTPUTS: Row[] = [
  { name: "report-compressed.pdf", size: "610 KB", kind: "pdf" },
  { name: "images.pdf", size: "4.2 MB", kind: "pdf" },
  { name: "photos", size: "", kind: "folder" },
];

type Item = { label: string; sep?: false } | { sep: true };

const PDF_ITEMS: Item[] = [
  { label: msg("Compress") },
  { label: msg("Merge into one PDF") },
  { sep: true },
  { label: msg("Merge PDFs…") },
  { label: msg("Compress…") },
  { label: msg("Split…") },
  { label: msg("Convert to images…") },
  { label: msg("Protect with password…") },
];
const IMAGE_ITEMS: Item[] = [
  { label: msg("Convert to PDF") },
  { label: msg("Combine into one PDF") },
  { label: msg("Convert to JPG") },
  { sep: true },
  { label: msg("Images to PDF…") },
  { label: msg("Convert image format…") },
  { label: msg("Make scanned PDF…") },
];
const ZIP_ITEMS: Item[] = [
  { label: msg("Extract here") },
  { label: msg("Extract to a new folder") },
  { sep: true },
  { label: msg("ZIP to PDF…") },
];

interface Scene {
  tab: string;
  /** Rows clicked, in order; the last one is right-clicked. */
  rows: number[];
  items: Item[];
  /** Index into `items` of the one chosen. */
  pick: number;
  running: string;
  runningVars: Record<string, string | number>;
  done: string;
  detail?: string;
}

const SCENES: Scene[] = [
  {
    tab: msg("A PDF"),
    rows: [0],
    items: PDF_ITEMS,
    pick: 0,
    running: msg("Compressing {{name}}"),
    runningVars: { name: "report.pdf" },
    done: msg("Compressed"),
    detail: "2.4 MB → 610 KB",
  },
  {
    tab: msg("Two images"),
    rows: [2, 3],
    items: IMAGE_ITEMS,
    pick: 1,
    running: msg("Combining {{count}} images into one PDF"),
    runningVars: { count: 2 },
    done: msg("Combined into one PDF"),
  },
  {
    tab: msg("A ZIP file"),
    rows: [4],
    items: ZIP_ITEMS,
    pick: 1,
    running: msg("Extracting {{name}}"),
    runningVars: { name: "photos.zip" },
    done: msg("Extracted"),
  },
];

/** The system's own menu around ours: grey bars, separators, our entry. */
type MenuEntry = { bar: number } | { sep: true } | { ours: true };

interface Geometry {
  listX: number;
  rowTop: number;
  rowH: number;
  menuW: number;
  subW: number;
  menu: MenuEntry[];
  /** Mac items carry the app's name: Finder gives them no submenu of their own. */
  prefix: string;
}

const ITEM_H = 22;
const SEP_H = 9;
const PAD = 4;

const GEOMETRY: Record<DemoOs, Geometry> = {
  windows: {
    listX: 124,
    rowTop: 86,
    rowH: 26,
    menuW: 170,
    subW: 196,
    menu: [{ bar: 34 }, { bar: 72 }, { sep: true }, { ours: true }, { sep: true }, { bar: 58 }, { bar: 84 }, { bar: 46 }],
    prefix: "",
  },
  mac: {
    listX: 136,
    rowTop: 68,
    rowH: 24,
    menuW: 176,
    subW: 236,
    menu: [{ bar: 34 }, { bar: 82 }, { sep: true }, { bar: 60 }, { bar: 70 }, { sep: true }, { ours: true }],
    prefix: "iLoathePDF: ",
  },
};

const entryH = (e: MenuEntry | Item) => ("sep" in e && e.sep ? SEP_H : ITEM_H);
const heightOf = (entries: (MenuEntry | Item)[]) => PAD * 2 + entries.reduce((h, e) => h + entryH(e), 0);
const offsetOf = (entries: (MenuEntry | Item)[], index: number) =>
  PAD + entries.slice(0, index).reduce((h, e) => h + entryH(e), 0);

interface DeskFrame extends Frame {
  cursor: [number, number];
  pressed?: boolean;
  selected: number[];
  /** Outputs shown: the files earlier scenes (and this one, once done) made. */
  outputs: number;
  menu?: { x: number; y: number };
  sub?: { x: number; y: number };
  hoverOurs?: boolean;
  hoverItem?: number;
  card?: "running" | "done";
  /** Modifier held for the second click of a multi-select. */
  modifier?: boolean;
}

/** Finder lists Quick Actions with no separators between them. */
function itemsFor(os: DemoOs, scene: Scene): Item[] {
  return os === "mac" ? scene.items.filter((item) => !item.sep) : scene.items;
}

function buildScene(os: DemoOs, index: number): DeskFrame[] {
  const g = GEOMETRY[os];
  const s = SCENES[index];
  // `pick` is always above the first separator, so it is the same index either way.
  const items = itemsFor(os, s);
  const rowCenter = (row: number): [number, number] => [g.listX + 56, g.rowTop + row * g.rowH + g.rowH / 2];
  const frames: DeskFrame[] = [];
  const add = (f: Omit<DeskFrame, "outputs"> & { outputs?: number }) => frames.push({ outputs: index, ...f });

  add({ cursor: [470, 300], selected: [], dur: 700 });
  const selected: number[] = [];
  s.rows.forEach((row, i) => {
    const at = rowCenter(row);
    const modifier = i > 0;
    add({ cursor: at, selected: [...selected], modifier, dur: 650 });
    selected.push(row);
    add({ cursor: at, pressed: true, selected: [...selected], modifier, dur: 140 });
    add({ cursor: at, selected: [...selected], modifier, dur: 320 });
  });

  const [cx, cy] = rowCenter(s.rows[s.rows.length - 1]);
  const menuH = heightOf(g.menu);
  const menu = { x: cx + 2, y: Math.min(cy + 2, H - 6 - menuH) };
  const oursIndex = g.menu.findIndex((e) => "ours" in e);
  const oursTop = menu.y + offsetOf(g.menu, oursIndex);
  const subH = heightOf(items);
  const sub = { x: menu.x + g.menuW - 4, y: Math.min(oursTop - PAD, H - 6 - subH) };
  const itemY = sub.y + offsetOf(items, s.pick) + ITEM_H / 2;
  const oursY = oursTop + ITEM_H / 2;
  const sel = [...selected];

  add({ cursor: [cx, cy], pressed: true, selected: sel, dur: 140 });
  add({ cursor: [cx, cy], selected: sel, menu, dur: 450 });
  add({ cursor: [menu.x + 60, oursY], selected: sel, menu, hoverOurs: true, dur: 600 });
  add({ cursor: [menu.x + 60, oursY], selected: sel, menu, hoverOurs: true, sub, dur: 380 });
  add({ cursor: [sub.x + 70, oursY], selected: sel, menu, hoverOurs: true, sub, dur: 380 });
  add({ cursor: [sub.x + 70, itemY], selected: sel, menu, hoverOurs: true, sub, hoverItem: s.pick, dur: 650 });
  add({ cursor: [sub.x + 70, itemY], pressed: true, selected: sel, menu, hoverOurs: true, sub, hoverItem: s.pick, dur: 140 });
  add({ cursor: [sub.x + 70, itemY], selected: sel, card: "running", dur: 1500 });
  const made = FILES.length + index;
  add({ cursor: [sub.x + 70, itemY], selected: [made], card: "done", outputs: index + 1, dur: 2600 });
  add({ cursor: [sub.x + 70, itemY], selected: [], outputs: index + 1, dur: 500 });
  return frames;
}

const SCENE_FRAMES: Record<DemoOs, DeskFrame[][]> = {
  windows: SCENES.map((_, i) => buildScene("windows", i)),
  mac: SCENES.map((_, i) => buildScene("mac", i)),
};

function FileIcon({ kind }: { kind: Kind }) {
  if (kind === "folder") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.5 4a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="#e8b43a" />
      </svg>
    );
  }
  const color = kind === "pdf" ? "var(--danger)" : kind === "image" ? "var(--tint-a)" : "var(--tint-e)";
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 1.5h6l3 3v10h-9z" fill="var(--surface)" stroke="var(--border-hi)" />
      <rect x="2" y="8" width="9" height="4.5" rx="1" fill={color} />
    </svg>
  );
}

function AppMark({ size = 13 }: { size?: number }) {
  return <span className="inline-block flex-none rounded-[3px] bg-accent" style={{ width: size, height: size }} />;
}

/** The app's progress card (apps/desktop/src/quick), bottom-right. */
function QuickCard({ scene, state, index }: { scene: Scene; state: "running" | "done"; index: number }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const output = OUTPUTS[index];
  return (
    <motion.div
      {...popIn}
      initial={{ opacity: 0, transform: reduce ? "none" : "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      className="absolute bottom-3 right-3 z-30 w-[262px] overflow-hidden rounded-xl border border-border bg-surface shadow-[0_10px_30px_-8px_rgb(0_0_0/0.35)]"
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[11px] text-muted">
        <AppMark size={11} />
        iLoathePDF
      </div>
      <div className="px-3 py-2.5">
        {state === "running" ? (
          <>
            <div className="truncate text-[12px] font-medium">{t(scene.running, scene.runningVars)}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full origin-left rounded-full bg-accent"
                initial={{ transform: "scaleX(0.04)" }}
                animate={{ transform: "scaleX(1)" }}
                transition={{ duration: reduce ? 0 : 1.35, ease: "linear" }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="1.8" className="mt-0.5 flex-none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.3" />
              <path d="M5.2 8.2l2 2 3.6-3.8" />
            </svg>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium">
                {t(scene.done)}: {output.name}
              </div>
              {scene.detail ? <div className="mt-0.5 font-mono text-[10.5px] text-muted">{scene.detail}</div> : null}
              <div className="mt-2 flex gap-1.5">
                <span className="rounded-md bg-accent px-2 py-1 text-[10.5px] font-semibold text-on-accent">{t("Show in folder")}</span>
                <span className="rounded-md border border-border px-2 py-1 text-[10.5px] font-medium">{t("Open")}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ContextMenu({ os, frame, scene }: { os: DemoOs; frame: DeskFrame; scene: Scene }) {
  const { t } = useTranslation();
  const g = GEOMETRY[os];
  const mac = os === "mac";
  const menuClass = mac
    ? "rounded-lg border border-border bg-surface/95 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] backdrop-blur"
    : "rounded-[3px] border border-border-hi bg-surface shadow-[2px_3px_8px_-2px_rgb(0_0_0/0.3)]";
  const hoverClass = mac ? "bg-[#0a64d8] text-white" : "bg-[color-mix(in_oklab,#3b82f6_18%,transparent)]";
  const itemClass = mac ? "mx-1 rounded-[4px] px-2" : "px-3";

  return (
    <>
      {frame.menu ? (
        <motion.div
          {...popIn}
          key="menu"
          className={`absolute z-20 py-1 ${menuClass}`}
          style={{ left: frame.menu.x, top: frame.menu.y, width: g.menuW, transformOrigin: "0 0" }}
        >
          {g.menu.map((e, i) =>
            "sep" in e ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : "bar" in e ? (
              <MenuFiller key={i} widths={[e.bar]} />
            ) : (
              <div
                key={i}
                className={`flex h-[22px] items-center gap-2 text-[12px] ${itemClass} ${frame.hoverOurs ? hoverClass : ""}`}
              >
                {mac ? null : <AppMark />}
                <span className="flex-1">{mac ? t("Quick Actions") : "iLoathePDF"}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <path d="M2.5 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </div>
            ),
          )}
        </motion.div>
      ) : null}
      {frame.sub ? (
        <motion.div
          {...popIn}
          key="sub"
          className={`absolute z-20 py-1 ${menuClass}`}
          style={{ left: frame.sub.x, top: frame.sub.y, width: g.subW, transformOrigin: "0 0" }}
        >
          {itemsFor(os, scene).map((item, i) =>
            item.sep ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : (
              <div
                key={i}
                className={`flex h-[22px] items-center text-[12px] whitespace-nowrap ${itemClass} ${frame.hoverItem === i ? hoverClass : ""}`}
              >
                {g.prefix}
                {t(item.label)}
              </div>
            ),
          )}
        </motion.div>
      ) : null}
    </>
  );
}

function WindowsChrome() {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex h-[30px] items-center gap-2 border-b border-border bg-surface px-3">
        <FileIcon kind="folder" />
        <span className="text-[12px]">{t("Documents")}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-4 pr-1 text-faint">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none" /></svg>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
        </span>
      </div>
      <div className="flex h-[32px] items-center gap-2.5 border-b border-border bg-surface px-3 text-faint">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2L3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <div className="flex h-[22px] flex-1 items-center gap-1.5 border border-border px-2 text-[11px] text-muted">
          <FileIcon kind="folder" />
          {t("Documents")}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 top-[62px] w-[120px] border-r border-border bg-surface px-2 py-2">
        {[54, 70, 48, 62, 56].map((w, i) => (
          <div key={i} className="flex h-[24px] items-center gap-2 px-1.5">
            <span className="size-3 rounded-[2px] bg-surface-3" />
            <span className="h-[6px] rounded-full bg-surface-3" style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="absolute left-[124px] right-2 top-[62px] flex h-[24px] items-center border-b border-border px-2 text-[11px] text-muted">
        <span className="flex-1 pl-6">{t("Name")}</span>
        <span className="w-[70px] text-right">{t("Size")}</span>
      </div>
    </>
  );
}

function MacChrome() {
  const { t } = useTranslation();
  return (
    <>
      <div className="absolute bottom-0 left-0 top-0 w-[128px] border-r border-border bg-surface-2 px-2.5 pt-3">
        <div className="flex gap-1.5 pl-1">
          <span className="size-[11px] rounded-full bg-[#ff5f57]" />
          <span className="size-[11px] rounded-full bg-[#febc2e]" />
          <span className="size-[11px] rounded-full bg-[#28c840]" />
        </div>
        <div className="mt-5 h-[5px] w-10 rounded-full bg-border-hi" />
        {[56, 44, 64, 50].map((w, i) => (
          <div key={i} className="mt-1 flex h-[22px] items-center gap-2 px-1">
            <span className="size-3 rounded-full bg-surface-3" />
            <span className="h-[6px] rounded-full bg-surface-3" style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="absolute left-[128px] right-0 top-0 flex h-[44px] items-center gap-3 border-b border-border px-4">
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-faint" aria-hidden="true"><path d="M7.5 2L3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
        <span className="text-[13px] font-semibold">{t("Documents")}</span>
      </div>
      <div className="absolute left-[136px] right-2 top-[44px] flex h-[24px] items-center border-b border-border px-2 text-[11px] text-muted">
        <span className="flex-1 pl-6">{t("Name")}</span>
        <span className="w-[70px] text-right">{t("Size")}</span>
      </div>
    </>
  );
}

export function RightClickDemo({ os }: { os: DemoOs }) {
  const { t } = useTranslation();
  const scenes = SCENE_FRAMES[os];
  const { ref, scene: sceneIndex, frame, setScene } = useDemoLoop(scenes);
  const g = GEOMETRY[os];
  const scene = SCENES[sceneIndex];
  const mac = os === "mac";
  const rows = [...FILES, ...OUTPUTS.slice(0, frame.outputs)];

  return (
    <MotionConfig reducedMotion="user">
    <div ref={ref} className="flex w-full max-w-[600px] flex-col gap-3">
      <div
        role="img"
        aria-label={
          mac
            ? t("Animation: in Finder, files are selected and right-clicked, and Quick Actions lists the iLoathePDF items for that kind of file.")
            : t("Animation: in File Explorer, files are selected and right-clicked, and the iLoathePDF menu lists the items for that kind of file.")
        }
        className="overflow-hidden rounded-2xl border border-border bg-bg shadow-[var(--shadow-card)]"
      >
        <Stage width={W} height={H}>
          <div className="absolute inset-0 bg-surface">
            {mac ? <MacChrome /> : <WindowsChrome />}

            {rows.map((row, i) => {
              const selected = frame.selected.includes(i);
              const isNew = i >= FILES.length;
              return (
                <motion.div
                  key={row.name}
                  initial={isNew ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  className={`absolute flex items-center gap-2 px-2 text-[12px] ${
                    mac ? "rounded-[5px]" : ""
                  } ${
                    selected
                      ? mac
                        ? "bg-[#0a64d8] text-white"
                        : "bg-[color-mix(in_oklab,#3b82f6_20%,transparent)] outline outline-1 outline-[color-mix(in_oklab,#3b82f6_45%,transparent)]"
                      : mac && i % 2 === 1
                        ? "bg-surface-2/60"
                        : ""
                  }`}
                  style={{ left: g.listX, right: 8, top: g.rowTop + i * g.rowH, height: g.rowH - 2 }}
                >
                  <FileIcon kind={row.kind} />
                  <span className="flex-1 truncate">{row.name}</span>
                  <span className={`w-[70px] text-right font-mono text-[10.5px] ${selected && mac ? "text-white/80" : "text-muted"}`}>
                    {row.size || "—"}
                  </span>
                </motion.div>
              );
            })}

            <AnimatePresence>
              {frame.menu || frame.sub ? <ContextMenu key={`menus-${sceneIndex}`} os={os} frame={frame} scene={scene} /> : null}
            </AnimatePresence>
            <AnimatePresence>
              {frame.card ? <QuickCard key={`card-${sceneIndex}`} scene={scene} state={frame.card} index={sceneIndex} /> : null}
            </AnimatePresence>

            <AnimatePresence>
              {frame.modifier ? (
                <motion.span
                  key="modifier"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-40 rounded-md border border-border-hi bg-surface px-1.5 py-0.5 font-mono text-[10.5px] font-bold shadow-sm"
                  style={{ left: frame.cursor[0] + 18, top: frame.cursor[1] + 14 }}
                >
                  {mac ? "⌘" : "Ctrl"}
                </motion.span>
              ) : null}
            </AnimatePresence>

            <Cursor x={frame.cursor[0]} y={frame.cursor[1]} pressed={frame.pressed} />
          </div>
        </Stage>
      </div>
      <SceneTabs label={t("Pick what is selected")} scenes={SCENES.map((s) => t(s.tab))} current={sceneIndex} onPick={setScene} />
    </div>
    </MotionConfig>
  );
}
