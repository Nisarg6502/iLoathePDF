/**
 * The browser extension, played out in three scenes: fitting a photo to an
 * upload form's limits, saving an image from a page as a PDF, and
 * collecting images from a page into one PDF.
 *
 * Words on the extension's own surfaces (the menu, the Fit panel, the popup)
 * are the extension's real ones (apps/extension/public/_locales/en). Keep them
 * in step when those change.
 */
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { msg } from "@iloathepdf/i18n/msg";
import { useTranslation } from "@iloathepdf/i18n";

import { Cursor, EASE_OUT, MenuFiller, SceneTabs, Stage, popIn, useDemoLoop, type Frame } from "./DemoKit";

const W = 600;
const H = 340;
const PAGE_TOP = 66;
const EXT_ICON: [number, number] = [548, 48];

type Toast = { text: string; vars?: Record<string, string> };

interface ExtFrame extends Frame {
  cursor: [number, number];
  pressed?: boolean;
  /** Fit scene. */
  fitShown?: boolean;
  modal?: "empty" | "file" | "working" | "fits";
  hoverButton?: boolean;
  fieldFilled?: boolean;
  /** Right-click menus. */
  menu?: { x: number; y: number };
  sub?: { x: number; y: number };
  hoverOurs?: boolean;
  hoverItem?: number;
  /** Collect scene: images in the PDF list, and the toolbar popup. */
  badge?: number;
  popup?: "list" | "making";
  toast?: Toast;
  downloaded?: boolean;
}

type Entry = { bar: number } | { sep: true } | { ours: true };

const MENU: Entry[] = [{ bar: 92 }, { bar: 70 }, { bar: 58 }, { bar: 98 }, { sep: true }, { ours: true }, { sep: true }, { bar: 40 }];
const SUB_ITEMS = [msg("Save image as PDF"), msg("Save image as JPG"), msg("Save image as PNG"), msg("Add image to PDF")];
const MENU_W = 236;
const SUB_W = 162;
const ITEM_H = 22;
const SEP_H = 9;
const PAD = 4;

const entryH = (e: Entry) => ("sep" in e ? SEP_H : ITEM_H);
const MENU_H = PAD * 2 + MENU.reduce((h, e) => h + entryH(e), 0);
const OURS_OFFSET = PAD + MENU.slice(0, MENU.findIndex((e) => "ours" in e)).reduce((h, e) => h + entryH(e), 0);
const SUB_H = PAD * 2 + SUB_ITEMS.length * ITEM_H;

/** Frames for right-clicking the image at (x, y) and choosing item `pick`. */
function rightClick(x: number, y: number, pick: number, base: Partial<ExtFrame>): ExtFrame[] {
  const menu = { x: x + 2, y: Math.min(y + 2, H - 6 - MENU_H) };
  const oursY = menu.y + OURS_OFFSET + ITEM_H / 2;
  const right = menu.x + MENU_W - 4;
  const sub = {
    x: right + SUB_W <= W - 4 ? right : menu.x - SUB_W + 4,
    y: Math.min(menu.y + OURS_OFFSET - PAD, H - 6 - SUB_H),
  };
  const itemY = sub.y + PAD + pick * ITEM_H + ITEM_H / 2;
  const subX = sub.x + 60;
  const f = (frame: Partial<ExtFrame> & Pick<ExtFrame, "cursor" | "dur">): ExtFrame => ({ ...base, ...frame });
  return [
    f({ cursor: [x, y], dur: 650 }),
    f({ cursor: [x, y], pressed: true, dur: 140 }),
    f({ cursor: [x, y], menu, dur: 420 }),
    f({ cursor: [menu.x + 70, oursY], menu, hoverOurs: true, dur: 580 }),
    f({ cursor: [menu.x + 70, oursY], menu, hoverOurs: true, sub, dur: 360 }),
    f({ cursor: [subX, oursY], menu, hoverOurs: true, sub, dur: 360 }),
    f({ cursor: [subX, itemY], menu, hoverOurs: true, sub, hoverItem: pick, dur: 600 }),
    f({ cursor: [subX, itemY], pressed: true, menu, hoverOurs: true, sub, hoverItem: pick, dur: 140 }),
  ];
}

// Fit scene geometry.
const FIT_BUTTON: [number, number] = [376, 196];
const CHOOSE: [number, number] = [300, 232];
const PUT: [number, number] = [385, 290];

const FIT: ExtFrame[] = [
  { cursor: [470, 300], dur: 700 },
  { cursor: EXT_ICON, dur: 700 },
  { cursor: EXT_ICON, pressed: true, dur: 140 },
  { cursor: EXT_ICON, fitShown: true, dur: 500 },
  { cursor: FIT_BUTTON, fitShown: true, dur: 700 },
  { cursor: FIT_BUTTON, fitShown: true, pressed: true, dur: 140 },
  { cursor: FIT_BUTTON, fitShown: true, modal: "empty", dur: 500 },
  { cursor: CHOOSE, fitShown: true, modal: "empty", hoverButton: true, dur: 650 },
  { cursor: CHOOSE, fitShown: true, modal: "empty", hoverButton: true, pressed: true, dur: 140 },
  { cursor: CHOOSE, fitShown: true, modal: "file", dur: 500 },
  { cursor: CHOOSE, fitShown: true, modal: "working", dur: 1300 },
  { cursor: CHOOSE, fitShown: true, modal: "fits", dur: 700 },
  { cursor: PUT, fitShown: true, modal: "fits", hoverButton: true, dur: 650 },
  { cursor: PUT, fitShown: true, modal: "fits", hoverButton: true, pressed: true, dur: 140 },
  { cursor: PUT, fitShown: true, fieldFilled: true, toast: { text: msg("Done. The file is in the form.") }, dur: 2600 },
  { cursor: PUT, fitShown: true, fieldFilled: true, dur: 500 },
];

const SAVE: ExtFrame[] = [
  { cursor: [470, 300], dur: 700 },
  ...rightClick(170, 175, 0, {}),
  { cursor: [170, 175], downloaded: true, toast: { text: msg("Saved {{name}} to your Downloads folder."), vars: { name: "sunset.pdf" } }, dur: 2800 },
  { cursor: [170, 175], dur: 500 },
];

// Collect scene: the toolbar popup's Make PDF button.
const MAKE_PDF: [number, number] = [488, 178];

const COLLECT: ExtFrame[] = [
  { cursor: [470, 300], dur: 600 },
  ...rightClick(118, 168, 3, {}),
  { cursor: [118, 168], badge: 1, dur: 500 },
  ...rightClick(296, 168, 3, { badge: 1 }).map((f, i) => (i === 0 ? { ...f, dur: 600 } : f)),
  { cursor: [296, 168], badge: 2, dur: 500 },
  { cursor: EXT_ICON, badge: 2, dur: 700 },
  { cursor: EXT_ICON, badge: 2, pressed: true, dur: 140 },
  { cursor: EXT_ICON, badge: 2, popup: "list", dur: 500 },
  { cursor: MAKE_PDF, badge: 2, popup: "list", hoverButton: true, dur: 650 },
  { cursor: MAKE_PDF, badge: 2, popup: "list", hoverButton: true, pressed: true, dur: 140 },
  { cursor: MAKE_PDF, badge: 2, popup: "making", dur: 900 },
  { cursor: MAKE_PDF, downloaded: true, toast: { text: msg("Saved {{name}} to your Downloads folder."), vars: { name: "images.pdf" } }, dur: 2800 },
  { cursor: MAKE_PDF, dur: 500 },
];

const SCENES = [
  { tab: msg("Fit a file to a form"), address: "apply.example.gov/passport", frames: FIT },
  { tab: msg("Save an image as PDF"), address: "photos.example.com/sunset", frames: SAVE },
  { tab: msg("Collect images into one PDF"), address: "photos.example.com/trip", frames: COLLECT },
];
const SCENE_FRAMES = SCENES.map((s) => s.frames);

function ExtIcon({ size = 16 }: { size?: number }) {
  return (
    <span className="grid flex-none place-items-center rounded-[4px] bg-accent text-on-accent" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.5 1.5h3.5l1.5 1.5v5.5h-5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

/** A photo, drawn: sky, sun and hills in one of three palettes. */
function Picture({ hue, className, style }: { hue: number; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`overflow-hidden rounded-md ${className ?? ""}`} style={style}>
      <svg viewBox="0 0 160 100" preserveAspectRatio="none" className="block size-full" aria-hidden="true">
        <rect width="160" height="100" fill={`oklch(0.82 0.08 ${hue})`} />
        <circle cx="112" cy="36" r="14" fill={`oklch(0.9 0.12 ${hue + 40})`} />
        <path d="M0 74l38-26 30 20 34-30 58 42v20H0z" fill={`oklch(0.55 0.1 ${hue + 120})`} />
        <path d="M0 86l48-18 44 14 68-10v28H0z" fill={`oklch(0.45 0.09 ${hue + 140})`} />
      </svg>
    </div>
  );
}

function Bars({ widths, className }: { widths: number[]; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {widths.map((w, i) => (
        <span key={i} className="h-[7px] rounded-full bg-[var(--paper-line)]" style={{ width: w }} />
      ))}
    </div>
  );
}

function BrowserChrome({ address, frame }: { address: string; frame: ExtFrame }) {
  return (
    <>
      <div className="flex h-[30px] items-end gap-1 bg-surface-3 px-2">
        <div className="flex h-[24px] w-[190px] items-center gap-2 rounded-t-lg bg-surface px-3">
          <span className="size-3 rounded-full bg-border-hi" />
          <span className="h-[6px] w-24 rounded-full bg-surface-3" />
        </div>
      </div>
      <div className="flex h-[36px] items-center gap-2.5 border-b border-border bg-surface px-3 text-faint">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2L3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <div className="flex h-[24px] flex-1 items-center rounded-full bg-surface-2 px-3 font-mono text-[11px] text-muted">{address}</div>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mx-1">
          <path d="M6 2.5h4v2.5a1.5 1.5 0 1 0 0 0V5h3v3.5h-1.5a1.5 1.5 0 1 0 0 3H13V14H3v-4h1.5a1.5 1.5 0 1 0 0-3H3V5h3z" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
        <span className="relative">
          <ExtIcon />
          <AnimatePresence>
            {frame.badge ? (
              <motion.span
                key={frame.badge}
                initial={{ opacity: 0, transform: "scale(0.6)" }}
                animate={{ opacity: 1, transform: "scale(1)" }}
                transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
                className="absolute -right-2 -top-1.5 grid h-[13px] min-w-[13px] place-items-center rounded-full bg-[#1a73e8] px-1 font-mono text-[8.5px] font-bold text-white"
              >
                {frame.badge}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
        <span className="relative grid size-5 place-items-center">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2v8.5M4.5 7l3.5 3.5L11.5 7M3 13.5h10" fill="none" stroke={frame.downloaded ? "#1a73e8" : "currentColor"} strokeWidth="1.5" />
          </svg>
          {frame.downloaded ? (
            <motion.span
              initial={{ opacity: 0.6, transform: "scale(0.6)" }}
              animate={{ opacity: 0, transform: "scale(1.6)" }}
              transition={{ duration: 0.8, ease: EASE_OUT }}
              className="absolute inset-0 rounded-full border-2 border-[#1a73e8]"
            />
          ) : null}
        </span>
      </div>
    </>
  );
}

function ChromeMenu({ frame }: { frame: ExtFrame }) {
  const { t } = useTranslation();
  const hover = "bg-[color-mix(in_oklab,var(--text)_9%,transparent)]";
  const box = "absolute z-20 rounded-lg border border-border bg-surface py-1 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.3)]";
  return (
    <>
      {frame.menu ? (
        <motion.div {...popIn} className={box} style={{ left: frame.menu.x, top: frame.menu.y, width: MENU_W, transformOrigin: "0 0" }}>
          {MENU.map((e, i) =>
            "sep" in e ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : "bar" in e ? (
              <MenuFiller key={i} widths={[e.bar]} />
            ) : (
              <div key={i} className={`flex h-[22px] items-center gap-2 px-3 text-[12px] ${frame.hoverOurs ? hover : ""}`}>
                <ExtIcon size={13} />
                <span className="flex-1 truncate">{t("iLoathePDF: fit files to forms")}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2.5 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
              </div>
            ),
          )}
        </motion.div>
      ) : null}
      {frame.sub ? (
        <motion.div {...popIn} className={box} style={{ left: frame.sub.x, top: frame.sub.y, width: SUB_W, transformOrigin: "0 0" }}>
          {SUB_ITEMS.map((label, i) => (
            <div key={label} className={`flex h-[22px] items-center whitespace-nowrap px-3 text-[12px] ${frame.hoverItem === i ? hover : ""}`}>
              {t(label)}
            </div>
          ))}
        </motion.div>
      ) : null}
    </>
  );
}

function FormPage({ frame }: { frame: ExtFrame }) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 px-10 pt-6">
      <span className="block h-[11px] w-[200px] rounded-full bg-border-hi" />
      <Bars widths={[320, 270]} className="mt-3" />
      <div className="mt-5 text-[12px] font-medium text-[oklch(0.3_0.01_70)]">{t("Passport photo (JPG, max 100 KB)")}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex h-[34px] w-[300px] items-center gap-2 rounded-md border border-[oklch(0.8_0.01_70)] bg-white px-1.5 text-[11.5px] text-[oklch(0.35_0.01_70)]">
          <span className="rounded border border-[oklch(0.8_0.01_70)] bg-[oklch(0.96_0.003_70)] px-2 py-0.5">{t("Choose file")}</span>
          {frame.fieldFilled ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
              IMG_2041.jpg
              <span className="font-mono text-[10px] text-[oklch(0.5_0.01_70)]">94 KB</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="2" aria-hidden="true"><path d="M3 8.4l3 3L13 4.5" /></svg>
            </motion.span>
          ) : (
            <span>{t("No file chosen")}</span>
          )}
        </div>
        <AnimatePresence>
          {frame.fitShown ? (
            <motion.span
              key="fit"
              initial={{ opacity: 0, transform: "scale(0.9)" }}
              animate={{ opacity: 1, transform: "scale(1)" }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="flex h-[28px] items-center gap-1.5 rounded-full bg-accent px-3 text-[11.5px] font-semibold text-on-accent shadow-sm"
            >
              <ExtIcon size={12} />
              {t("Fit")}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <Bars widths={[300, 220, 260]} className="mt-6" />
    </div>
  );
}

function FitModal({ state, hover }: { state: NonNullable<ExtFrame["modal"]>; hover?: boolean }) {
  const { t } = useTranslation();
  const lift = hover ? "brightness-[1.06]" : "";
  return (
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-20 bg-black/25"
      />
      <motion.div
        key="modal"
        {...popIn}
        className="absolute z-30 w-[300px] overflow-hidden rounded-xl border border-border bg-surface text-text shadow-[0_16px_40px_-10px_rgb(0_0_0/0.45)]"
        style={{ left: 150, top: 18 }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 text-[12px] font-semibold">
          <ExtIcon size={13} />
          <span className="flex-1">{t("iLoathePDF: fit a file")}</span>
          <svg width="9" height="9" viewBox="0 0 10 10" className="text-faint" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.3" /></svg>
        </div>
        <div className="px-3.5 pt-2.5">
          <div className="font-mono text-[9.5px] font-bold tracking-[0.12em] text-faint">{t("What the form wants").toUpperCase()}</div>
          <div className="mt-1.5 flex gap-1.5">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10.5px]">JPG</span>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10.5px]">≤ 100 KB</span>
          </div>
        </div>
        <div className="h-[100px] px-3.5 py-2.5">
          {state === "empty" ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-hi text-[11px] text-muted">
              {t("Drop a photo or PDF here")}
              <span className={`rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent ${lift}`}>{t("Choose file")}</span>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
                <Picture hue={60} className="h-[22px] w-[30px] flex-none" />
                <span className="flex-1 text-[11.5px]">IMG_2041.png</span>
                <span className="font-mono text-[10px] text-muted">2.3 MB</span>
              </div>
              {state === "working" ? (
                <div>
                  <div className="text-[11px] text-muted">{t("Making it fit…")}</div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full origin-left rounded-full bg-accent"
                      initial={{ transform: "scaleX(0.05)" }}
                      animate={{ transform: "scaleX(1)" }}
                      transition={{ duration: 1.2, ease: "linear" }}
                    />
                  </div>
                </div>
              ) : state === "fits" ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[11.5px] font-medium text-ok">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 8.4l3 3L13 4.5" /></svg>
                  {t("Fits: {{size}} (limit {{limit}})", { size: "94 KB", limit: "100 KB" })}
                </motion.div>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-border px-3.5 py-2">
          <span
            className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-opacity duration-150 ${
              state === "fits" ? `bg-accent text-on-accent ${lift}` : "bg-surface-3 text-faint"
            }`}
          >
            {t("Put in the form")}
          </span>
        </div>
      </motion.div>
    </>
  );
}

function ArticlePage() {
  return (
    <div className="absolute inset-0 px-10 pt-6">
      <span className="block h-[11px] w-[230px] rounded-full bg-border-hi" />
      <div className="mt-4 flex gap-6">
        <Picture hue={40} style={{ width: 260, height: 170 }} />
        <Bars widths={[200, 230, 180, 220, 160, 210, 190]} className="pt-1" />
      </div>
    </div>
  );
}

function GalleryPage() {
  return (
    <div className="absolute inset-0 px-10 pt-6">
      <span className="block h-[11px] w-[160px] rounded-full bg-border-hi" />
      <div className="mt-5 flex gap-4">
        {[40, 200, 300].map((hue) => (
          <Picture key={hue} hue={hue} style={{ width: 160, height: 108 }} />
        ))}
      </div>
      <Bars widths={[340, 280]} className="mt-5" />
    </div>
  );
}

function ImagesPopup({ state, hover }: { state: "list" | "making"; hover?: boolean }) {
  const { t } = useTranslation();
  return (
    <motion.div
      {...popIn}
      className="absolute right-3 z-30 w-[200px] overflow-hidden rounded-lg border border-border bg-surface shadow-[0_12px_30px_-8px_rgb(0_0_0/0.4)]"
      style={{ top: 62, transformOrigin: "85% 0" }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12px] font-semibold">
        <ExtIcon size={13} />
        {t("Images to PDF")}
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {[
          ["sunset.jpg", 40],
          ["harbour.png", 200],
        ].map(([name, hue]) => (
          <div key={name} className="flex items-center gap-2">
            <Picture hue={hue as number} className="h-[22px] w-[32px] flex-none" />
            <span className="text-[11px]">{name}</span>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3">
        <div
          className={`rounded-md py-1.5 text-center text-[11.5px] font-semibold ${
            state === "making" ? "bg-surface-3 text-muted" : `bg-accent text-on-accent ${hover ? "brightness-[1.06]" : ""}`
          }`}
        >
          {state === "making" ? t("Making PDF…") : t("Make PDF")}
        </div>
      </div>
    </motion.div>
  );
}

export function ExtensionDemo() {
  const { t } = useTranslation();
  const { ref, scene: sceneIndex, frame, setScene } = useDemoLoop(SCENE_FRAMES);
  const scene = SCENES[sceneIndex];

  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} className="flex w-full max-w-[600px] flex-col gap-3">
        <div
          role="img"
          aria-label={t("Animation: the extension fits a photo to an upload form's limits, saves an image from a page as a PDF, and collects images from a page into one PDF.")}
          className="overflow-hidden rounded-2xl border border-border bg-bg shadow-[var(--shadow-card)]"
        >
          <Stage width={W} height={H}>
            <div className="absolute inset-0 bg-surface">
              <BrowserChrome address={scene.address} frame={frame} />
              <div className="absolute inset-x-0 bottom-0 overflow-hidden bg-[var(--paper)]" style={{ top: PAGE_TOP }}>
                {sceneIndex === 0 ? <FormPage frame={frame} /> : sceneIndex === 1 ? <ArticlePage /> : <GalleryPage />}
                <AnimatePresence>
                  {frame.modal ? <FitModal key="fit-modal" state={frame.modal} hover={frame.hoverButton} /> : null}
                </AnimatePresence>
                <AnimatePresence>
                  {frame.toast ? (
                    <motion.div
                      key={`toast-${sceneIndex}`}
                      initial={{ opacity: 0, transform: "translateY(10px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      exit={{ opacity: 0, transform: "translateY(10px)" }}
                      transition={{ duration: 0.22, ease: EASE_OUT }}
                      className="absolute bottom-4 left-1/2 z-30 -ml-[150px] flex w-[300px] items-center gap-2 rounded-lg bg-[oklch(0.25_0.01_70)] px-3 py-2 text-[11.5px] text-white shadow-lg"
                    >
                      <ExtIcon size={13} />
                      {t(frame.toast.text, frame.toast.vars)}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {frame.menu || frame.sub ? <ChromeMenu key={`menu-${sceneIndex}-${frame.badge ?? 0}`} frame={frame} /> : null}
              </AnimatePresence>
              <AnimatePresence>
                {frame.popup ? <ImagesPopup key="popup" state={frame.popup} hover={frame.hoverButton} /> : null}
              </AnimatePresence>
              <Cursor x={frame.cursor[0]} y={frame.cursor[1]} pressed={frame.pressed} />
            </div>
          </Stage>
        </div>
        <SceneTabs label={t("Pick a demo")} scenes={SCENES.map((s) => t(s.tab))} current={sceneIndex} onPick={setScene} />
      </div>
    </MotionConfig>
  );
}
