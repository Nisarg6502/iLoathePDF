/**
 * The quick-action window: a small card in the corner of the screen that runs
 * right-click actions in place (src/lib/quickActions.ts) and shows how they
 * went. The Rust side (src-tauri/src/quick.rs) creates it hidden; this page
 * reports its height, which positions and shows it.
 *
 * Requests run one at a time, oldest first. One that arrives while another
 * runs waits in the list; one for the same action that arrives before its
 * twin has started joins it (a slow Explorer process from the same
 * selection). When everything has finished without a problem the window
 * closes itself after a few seconds (not while the pointer is over it);
 * a failure stays until it is dismissed.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, FolderOpen, Loader2, Lock, X } from "lucide-react";
import { useTranslation } from "@iloathepdf/i18n";

import { describeJobError } from "@/components/ResultCard";
import { isTauri, JobError } from "@/lib/jobs";
import {
  planQuick,
  runQuick,
  type QuickPlan,
  type QuickRequest,
  type QuickRunOutcome,
} from "@/lib/quickActions";
import { baseName, cn, formatBytes } from "@/lib/utils";

type Status = "waiting" | "running" | "finished";

interface Row {
  key: number;
  request: QuickRequest;
  plan: QuickPlan;
  status: Status;
  pct: number;
  outcomes: QuickRunOutcome[];
  controller?: AbortController;
}

/** Seconds a successful run stays on screen before the window closes. */
const LINGER_MS = 6000;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

function failed(row: Row): QuickRunOutcome[] {
  return row.outcomes.filter((o) => o.error && o.error.code !== "CANCELLED");
}

function rowNeedsAttention(row: Row): boolean {
  if (!row.plan.ok) return true;
  return row.status === "finished" && failed(row).length > 0;
}

export default function QuickApp() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [hovered, setHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  /** Rows already started, so a re-render can never start one twice. */
  const launched = useRef(new Set<number>());

  // --- take requests from Rust ------------------------------------------------
  const addRequests = useCallback((requests: QuickRequest[]) => {
    if (requests.length === 0) return;
    setRows((current) => {
      const next = [...current];
      for (const request of requests) {
        const twin = next.find((r) => r.status === "waiting" && r.request.run === request.run);
        if (twin) {
          const files = [...twin.request.files];
          const seen = new Set(files.map((f) => f.toLowerCase()));
          for (const f of request.files) if (!seen.has(f.toLowerCase())) files.push(f);
          files.sort((a, b) => baseName(a).localeCompare(baseName(b), undefined, { numeric: true, sensitivity: "base" }));
          const merged = { ...twin.request, files, skipped: twin.request.skipped + request.skipped };
          next[next.indexOf(twin)] = { ...twin, request: merged, plan: planQuick(merged) };
        } else {
          const plan = planQuick(request);
          next.push({ key: request.id, request, plan, status: plan.ok ? "waiting" : "finished", pct: 0, outcomes: [] });
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!isTauri()) return;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const take = () =>
        invoke<QuickRequest[]>("take_quick_requests")
          .then((r) => addRequests(r ?? []))
          .catch(() => {
            /* nothing waiting */
          });
      await listen("quick://request", () => void take());
      await take();
    })();
  }, [addRequests]);

  // --- run them one at a time ---------------------------------------------------
  const running = rows.some((r) => r.status === "running");
  useEffect(() => {
    if (running) return;
    const next = rows.find((r) => r.status === "waiting");
    if (!next || !next.plan.ok || launched.current.has(next.key)) return;
    launched.current.add(next.key);
    const plan = next.plan;
    const controller = new AbortController();
    const update = (patch: Partial<Row>) =>
      setRows((current) => current.map((r) => (r.key === next.key ? { ...r, ...patch } : r)));
    update({ status: "running", controller, pct: 0 });
    void runQuick(plan, (pct) => update({ pct }), controller.signal).then((outcomes) =>
      update({ status: "finished", outcomes, pct: 100, controller: undefined }),
    );
  }, [rows, running]);

  // --- size the window to its content -------------------------------------------
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const report = () => void invoke("quick_window_fit", { height: Math.ceil(el.getBoundingClientRect().height) });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- close when everything went well --------------------------------------------
  const allFinished = rows.length > 0 && rows.every((r) => r.status === "finished");
  const attention = rows.some(rowNeedsAttention);
  useEffect(() => {
    if (!allFinished || attention || hovered) return;
    const timer = window.setTimeout(() => void closeWindow(), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [allFinished, attention, hovered]);

  const dismiss = (row: Row) => {
    row.controller?.abort();
    setRows((current) => {
      const next = current.filter((r) => r.key !== row.key);
      if (next.length === 0) void closeWindow();
      return next;
    });
  };

  const closeAll = () => {
    for (const row of rows) row.controller?.abort();
    void closeWindow();
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex max-h-[520px] flex-col overflow-hidden border border-border bg-surface text-text"
    >
      <header data-tauri-drag-region className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <img src="/favicon.svg" alt="" className="pointer-events-none h-3.5 w-3.5" />
        <span data-tauri-drag-region className="flex-1 text-[12px] font-medium text-muted">
          iLoathePDF
        </span>
        <button
          type="button"
          onClick={closeAll}
          aria-label={running ? t("Cancel and close") : t("Close")}
          title={running ? t("Cancel and close") : t("Close")}
          className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {rows.length === 0 ? (
          <li className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Getting ready…")}
          </li>
        ) : (
          rows.map((row) => <QuickRow key={row.key} row={row} onDismiss={() => dismiss(row)} />)
        )}
      </ul>
    </div>
  );
}

function QuickRow({ row, onDismiss }: { row: Row; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { plan } = row;

  if (!plan.ok) {
    const message =
      plan.reason === "unknown"
        ? t("There is no quick action called “{{id}}”. Update iLoathePDF, or use the app instead.", { id: plan.run })
        : t("{{tool}} takes {{files}}. Pick another tool for these files.", {
            tool: t(plan.tool.title),
            files: t(plan.tool.acceptsLabel),
          });
    return (
      <RowShell icon={<AlertTriangle className="h-4 w-4 text-danger" />} title={message} onDismiss={onDismiss} dismissLabel={t("Dismiss")} />
    );
  }

  const { action, tool, files } = plan;
  const vars = { name: baseName(files[0]), count: files.length };
  const notices: string[] = [];
  if (plan.leftOut > 0) {
    notices.push(t("{{count}} files were left out: {{tool}} takes {{files}}.", { count: plan.leftOut, tool: t(tool.title), files: t(tool.acceptsLabel) }));
  }
  if (plan.skipped > 0) {
    notices.push(t("{{count}} items were left out because they are folders or no longer exist.", { count: plan.skipped }));
  }

  if (row.status === "waiting") {
    return (
      <RowShell
        icon={<Clock className="h-4 w-4 text-muted" />}
        title={t(action.running, vars)}
        detail={t("Waiting for the one before it to finish.")}
        onDismiss={onDismiss}
        dismissLabel={t("Remove from the queue")}
        muted
      />
    );
  }

  if (row.status === "running") {
    return (
      <RowShell
        icon={<Loader2 className="h-4 w-4 animate-spin text-accent" />}
        title={t(action.running, vars)}
        onDismiss={onDismiss}
        dismissLabel={t("Cancel")}
      >
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(row.pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(3, row.pct)}%` }} />
        </div>
      </RowShell>
    );
  }

  // Finished.
  const ok = row.outcomes.filter((o) => o.result);
  const bad = failed(row);
  const cancelled = row.outcomes.some((o) => o.error?.code === "CANCELLED");
  const outputs = ok.flatMap((o) => o.result!.outputs);

  if (ok.length === 0 && bad.length === 0 && cancelled) {
    return (
      <RowShell
        icon={<X className="h-4 w-4 text-muted" />}
        title={t("Cancelled")}
        detail={t("Nothing was written. Your original files are untouched.")}
        onDismiss={onDismiss}
        dismissLabel={t("Dismiss")}
        muted
      />
    );
  }

  if (ok.length === 0) {
    const error = bad[0]?.error ?? new JobError("INTERNAL", "");
    const copy = describeJobError(error);
    const Icon = error.code === "ENCRYPTED_PDF" || error.code === "ENCRYPTED_ARCHIVE" ? Lock : AlertTriangle;
    return (
      <RowShell
        icon={<Icon className="h-4 w-4 text-danger" />}
        title={copy.title}
        detail={bad.length > 1 ? `${t("{{count}} files failed.", { count: bad.length })} ${copy.body}` : `${baseName(bad[0]?.files[0] ?? "")}: ${copy.body}`}
        onDismiss={onDismiss}
        dismissLabel={t("Dismiss")}
      >
        <Actions>
          <ActionButton
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label={t("Open in iLoathePDF")}
            onClick={() => void invoke("quick_open_in_app", { action: tool.id, files })}
          />
        </Actions>
      </RowShell>
    );
  }

  const compression = ok.length === 1 ? ok[0].result!.compression : undefined;
  const sizes = compression
    ? `${formatBytes(compression.originalBytes)} → ${formatBytes(compression.bytes)}`
    : "";
  const headline =
    outputs.length === 1
      ? baseName(outputs[0].path)
      : t("{{count}} files saved next to the originals.", { count: outputs.length });
  const summary = ok.length === 1 ? ok[0].result!.summary : undefined;
  const lines = [sizes, summary, ...notices].filter(Boolean) as string[];
  if (bad.length > 0) {
    const copy = describeJobError(bad[0].error!);
    lines.unshift(
      t("{{count}} files failed.", { count: bad.length }) + ` ${baseName(bad[0].files[0])}: ${copy.title}`,
    );
  }
  const first = outputs[0]?.path;

  return (
    <RowShell
      icon={bad.length ? <AlertTriangle className="h-4 w-4 text-warn" /> : <CheckCircle2 className="h-4 w-4 text-ok" />}
      title={`${t(action.done)}: ${headline}`}
      detail={lines.join(" ")}
      onDismiss={onDismiss}
      dismissLabel={t("Dismiss")}
    >
      {first ? (
        <Actions>
          <ActionButton
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            label={t("Show in folder")}
            primary
            onClick={() => void reveal(first)}
          />
          {outputs.length === 1 ? (
            <ActionButton icon={<ExternalLink className="h-3.5 w-3.5" />} label={t("Open")} onClick={() => void openPath(first)} />
          ) : null}
        </Actions>
      ) : null}
    </RowShell>
  );
}

async function reveal(path: string) {
  if (!isTauri()) return;
  const opener = await import("@tauri-apps/plugin-opener");
  await opener.revealItemInDir(path).catch(() => undefined);
}

async function openPath(path: string) {
  if (!isTauri()) return;
  const opener = await import("@tauri-apps/plugin-opener");
  await opener.openPath(path).catch(() => undefined);
}

function RowShell({
  icon,
  title,
  detail,
  onDismiss,
  dismissLabel,
  muted,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  onDismiss: () => void;
  dismissLabel: string;
  muted?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px] font-medium", muted ? "text-muted" : "text-text")} title={title}>
          {title}
        </p>
        {detail ? <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-muted">{detail}</p> : null}
        {children}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-2">{children}</div>;
}

function ActionButton({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        primary
          ? "border-transparent bg-accent text-on-accent hover:opacity-90"
          : "border-border bg-surface text-text hover:bg-surface-2",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
