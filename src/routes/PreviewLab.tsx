/**
 * Dev-only harness. Mounts PageThumbnailGrid, JobProgress and ResultCard
 * against real (generated) PDFs and the browser mock in `@/lib/jobs`, so the
 * preview + feedback layer can be eyeballed without the Tauri shell.
 *
 * NOT registered in the router — App.tsx belongs to another agent.
 * Register as: <Route path="/lab" element={<PreviewLab />} />
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Play, Sun } from "lucide-react";
import {
  PageThumbnailGrid,
  type PdfPageItem,
  type ThumbnailRenderer,
} from "@/components/PageThumbnailGrid";
import { JobProgress, type JobPhase } from "@/components/JobProgress";
import { ErrorCard, ResultCard } from "@/components/ResultCard";
import { PdfPreviewDocument, isCancellation } from "@/lib/pdfPreview";
import { JobError, runJob, type ErrorCode, type Progress } from "@/lib/jobs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Sample data: a real, valid PDF built in memory (no fixtures on disk)
// ---------------------------------------------------------------------------

function makeSamplePdf(pageCount: number, title: string, hue: number): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3 + pageCount * 2;

  for (let i = 0; i < pageCount; i++) pageIds.push(3 + i * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] >>`;

  const rgb = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))).toFixed(3);
    };
    return `${f(0)} ${f(8)} ${f(4)}`;
  };

  for (let i = 0; i < pageCount; i++) {
    const pid = pageIds[i];
    const cid = pid + 1;
    const band = rgb((hue + i * 24) % 360, 0.55, 0.62);
    const stream = [
      `1 1 1 rg 0 0 595 842 re f`,
      `${band} rg 0 700 595 142 re f`,
      `1 1 1 rg BT /F1 34 Tf 48 748 Td (${escapePdf(title)}) Tj ET`,
      `0.15 0.17 0.22 rg BT /F1 96 Tf 48 520 Td (${i + 1}) Tj ET`,
      `0.45 0.47 0.52 rg BT /F1 18 Tf 48 470 Td (page ${i + 1} of ${pageCount}) Tj ET`,
      `0.88 0.89 0.92 rg 48 120 499 8 re f 48 160 460 8 re f 48 200 499 8 re f 48 240 380 8 re f`,
    ].join("\n");
    objects[pid] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${cid} 0 R >>`;
    objects[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id <= fontId; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = body.length;
  body += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id++) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}

const escapePdf = (s: string) => s.replace(/([\\()])/g, "\\$1");

const SAMPLE_DOCS = [
  { id: "report", label: "report.pdf", pages: 9, hue: 258 },
  { id: "invoice", label: "invoice.pdf", pages: 5, hue: 150 },
];

// ---------------------------------------------------------------------------

export default function PreviewLab() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-theme") === "dark",
  );

  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    if (dark) el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
    return () => {
      if (prev) el.setAttribute("data-theme", prev);
      else el.removeAttribute("data-theme");
    };
  }, [dark]);

  return (
    <div className="h-full overflow-y-auto bg-bg text-text">
      <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        <header className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">Preview Lab</h1>
            <p className="text-sm text-muted">
              Thumbnails, progress and results — rendered against real PDFs and the job mock.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDark((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? "Light" : "Dark"}
          </button>
        </header>

        <Section
          title="PageThumbnailGrid"
          note="Drag to reorder. Click / shift-click / ctrl-click to select. R rotates, Delete removes. Tab to a tile then Space + arrows for keyboard reordering."
        >
          <GridDemo />
        </Section>

        <Section title="JobProgress" note="Determinate, indeterminate, cancelling.">
          <div className="space-y-3">
            <JobProgress
              title="Compressing report.pdf"
              progress={{ id: "d1", pct: 64, note: "page 12 of 19" }}
              startedAt={Date.now() - 7000}
              onCancel={() => undefined}
            />
            <JobProgress
              title="Merging 4 documents"
              progress={null}
              startedAt={Date.now() - 2000}
              onCancel={() => undefined}
            />
            <JobProgress
              title="Converting 120 images"
              phase="cancelling"
              progress={{ id: "d3", pct: 41, note: "image 49 of 120" }}
              startedAt={Date.now() - 63000}
              onCancel={() => undefined}
            />
          </div>
        </Section>

        <Section title="Live job (mock sidecar)" note="Runs runJob() end to end, cancel included.">
          <LiveJobDemo />
        </Section>

        <Section title="ResultCard" note="Success, multi-file, and the compression payoff.">
          <div className="space-y-4">
            <ResultCard
              files={[
                { path: "C:\\Users\\me\\Documents\\report-compressed.pdf", bytes: 61234, pages: 19 },
              ]}
              compression={{ originalBytes: 234567, bytes: 61234, engine: "ghostscript" }}
              onAgain={() => undefined}
            />
            <ResultCard
              files={[
                { path: "C:\\out\\invoice-1.pdf", bytes: 40900, pages: 3 },
                { path: "C:\\out\\invoice-2.pdf", bytes: 41800, pages: 3 },
                { path: "C:\\out\\invoice-3.pdf", bytes: 42700, pages: 2 },
              ]}
              onAgain={() => undefined}
            />
          </div>
        </Section>

        <Section title="Failure states" note="One tuned message per protocol error code.">
          <ErrorDemo />
        </Section>

        <p className="pb-6 text-xs text-muted">
          This route is not registered. Add it in App.tsx to reach it at /lab.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-muted/80">{note}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

function GridDemo() {
  const docsRef = useRef<Record<string, PdfPreviewDocument>>({});
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState<PdfPageItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loaded: PdfPreviewDocument[] = [];

    (async () => {
      const items: PdfPageItem[] = [];
      for (const spec of SAMPLE_DOCS) {
        const doc = await PdfPreviewDocument.load(
          makeSamplePdf(spec.pages, spec.label, spec.hue),
        );
        if (cancelled) {
          doc.destroy();
          return;
        }
        loaded.push(doc);
        docsRef.current[spec.id] = doc;
        for (let n = 1; n <= doc.pageCount; n++) {
          items.push({
            id: `${spec.id}:${n}`,
            docId: spec.id,
            pageNumber: n,
            rotation: 0,
            docLabel: spec.label,
          });
        }
      }
      if (cancelled) return;
      setPages(items);
      setReady(true);
    })().catch((e) => console.error("sample load failed", e));

    return () => {
      cancelled = true;
      for (const d of loaded) d.destroy();
      docsRef.current = {};
    };
  }, []);

  const renderThumbnail = useMemo<ThumbnailRenderer>(
    () => async (page, width, signal) => {
      const doc = docsRef.current[page.docId];
      if (!doc || doc.destroyed) return null;
      try {
        return await doc.renderPage(page.pageNumber, {
          width,
          rotation: page.rotation,
          signal,
        });
      } catch (err) {
        if (isCancellation(err)) return null;
        throw err;
      }
    },
    // renderer identity must change once the docs exist so tiles retry
    [ready],
  );

  return (
    <PageThumbnailGrid
      pages={pages}
      onChange={setPages}
      renderThumbnail={ready ? renderThumbnail : undefined}
      thumbnailWidth={220}
    />
  );
}

// ---------------------------------------------------------------------------

function LiveJobDemo() {
  const [phase, setPhase] = useState<"idle" | JobPhase>("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<{ bytes: number; original: number; path: string } | null>(
    null,
  );
  const [error, setError] = useState<JobError | null>(null);
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abort.current = new AbortController();
    setPhase("running");
    setProgress(null);
    setResult(null);
    setError(null);
    setStartedAt(Date.now());
    try {
      const r = await runJob(
        "pdf.compress",
        { input: "C:\\in\\report.pdf", output: "C:\\out\\report-small.pdf", level: "balanced" },
        { onProgress: setProgress, signal: abort.current.signal },
      );
      setResult({ bytes: r.bytes, original: r.original_bytes, path: r.output });
      setPhase("done");
    } catch (e) {
      setError(e instanceof JobError ? e : new JobError("INTERNAL", String(e)));
      setPhase("error");
    }
  }, []);

  if (phase === "running" || phase === "cancelling") {
    return (
      <JobProgress
        title="Compressing report.pdf"
        progress={progress}
        phase={phase}
        startedAt={startedAt}
        onCancel={() => {
          setPhase("cancelling");
          abort.current?.abort();
        }}
      />
    );
  }

  if (phase === "done" && result) {
    return (
      <ResultCard
        files={[{ path: result.path, bytes: result.bytes, pages: 6 }]}
        compression={{ originalBytes: result.original, bytes: result.bytes, engine: "ghostscript" }}
        onAgain={() => setPhase("idle")}
      />
    );
  }

  if (phase === "error" && error) {
    return <ErrorCard error={error} onRetry={start} onAgain={() => setPhase("idle")} />;
  }

  return (
    <button
      type="button"
      onClick={start}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Play className="h-4 w-4" />
      Run a mock compress job
    </button>
  );
}

// ---------------------------------------------------------------------------

const CODES: ErrorCode[] = [
  "ENCRYPTED_PDF",
  "CORRUPT_PDF",
  "GHOSTSCRIPT_MISSING",
  "OUTPUT_WRITE_FAILED",
  "FILE_NOT_FOUND",
  "UNSUPPORTED_FORMAT",
  "BAD_PARAMS",
  "CANCELLED",
  "INTERNAL",
];

function ErrorDemo() {
  const [code, setCode] = useState<ErrorCode>("ENCRYPTED_PDF");
  const error = useMemo(
    () =>
      new JobError(
        code,
        "raw sidecar message",
        code === "INTERNAL"
          ? 'Traceback (most recent call last):\n  File "ops/compress.py", line 41\n    raise RuntimeError("boom")'
          : undefined,
      ),
    [code],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {CODES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCode(c)}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[12px] transition-colors",
              c === code
                ? "border-accent bg-accent-soft text-text"
                : "border-border bg-surface text-muted hover:bg-surface-2",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <ErrorCard error={error} onRetry={() => undefined} onAgain={() => undefined} />
    </div>
  );
}
