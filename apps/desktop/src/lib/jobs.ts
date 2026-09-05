/**
 * The only place the UI talks to the Rust core. FROZEN CONTRACT --
 * mirrors sidecar/PROTOCOL.md. Do not edit without updating that file.
 *
 * When running under `vite dev` in a plain browser (no Tauri), this module
 * falls back to a mock so UI work can proceed without the desktop shell.
 */

export type OpName =
  | "sys.ping"
  | "pdf.info"
  | "pdf.merge"
  | "pdf.split"
  | "pdf.organize"
  | "pdf.compress"
  | "pdf.sign"
  | "img.convert"
  | "img.to_pdf"
  | "pdf.to_img";

export type ErrorCode =
  | "BAD_PARAMS"
  | "FILE_NOT_FOUND"
  | "ENCRYPTED_PDF"
  | "CORRUPT_PDF"
  | "UNSUPPORTED_FORMAT"
  | "GHOSTSCRIPT_MISSING"
  | "OUTPUT_WRITE_FAILED"
  | "CANCELLED"
  | "INTERNAL";

export class JobError extends Error {
  readonly code: ErrorCode;
  readonly detail?: string;

  constructor(code: ErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "JobError";
    this.code = code;
    this.detail = detail;
  }
}

/** Progress event forwarded from the sidecar. */
export interface Progress {
  id: string;
  pct: number;
  note: string;
}

// ---------------------------------------------------------------------------
// Params / results, one pair per operation
// ---------------------------------------------------------------------------

export interface OutputFile {
  path: string;
  bytes: number;
  width?: number;
  height?: number;
  pages?: number;
}

export interface PdfInfoParams { input: string }
export interface PdfInfoResult {
  pages: number;
  encrypted: boolean;
  bytes: number;
  page_sizes: [number, number][];
}

export interface MergeInput { path: string; pages?: string | null }
export interface PdfMergeParams { inputs: MergeInput[]; output: string }
export interface PdfMergeResult { output: string; bytes: number; pages: number }

export type SplitMode = "ranges" | "every" | "extract" | "delete";
export interface PdfSplitParams {
  input: string;
  mode: SplitMode;
  ranges?: string;
  every?: number;
  pages?: string;
  output_dir: string;
  base_name: string;
}
export interface PdfSplitResult { outputs: OutputFile[]; count: number }

export interface PdfOrganizeParams {
  input: string;
  output: string;
  order: number[];
  rotations?: Record<string, number>;
}
export interface PdfOrganizeResult { output: string; bytes: number; pages: number }

export type SignElementKind = "signature" | "initials" | "text" | "date";
export interface SignElementParams {
  page: number;
  kind: SignElementKind;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  /** base64 PNG, no "data:" prefix -- required for signature/initials. */
  image_b64?: string;
  /** required for text/date. */
  text?: string;
  font_size?: number;
  color?: string;
}
export interface PdfSignParams {
  input: string;
  output: string;
  elements: SignElementParams[];
}
export interface PdfSignResult { output: string; bytes: number; pages: number; elements: number }

export type CompressLevel = "lossless" | "balanced" | "strong";
export interface PdfCompressParams { input: string; output: string; level: CompressLevel }
export interface PdfCompressResult {
  output: string;
  bytes: number;
  original_bytes: number;
  ratio: number;
  engine: "pikepdf" | "ghostscript";
}

export type ImageFormat = "jpg" | "png" | "webp";
export interface ResizeSpec { mode: "none" | "max" | "percent"; max_px?: number; percent?: number }
export interface ImgConvertParams {
  inputs: string[];
  output_dir: string;
  format: ImageFormat;
  quality?: number;
  resize?: ResizeSpec;
  strip_metadata?: boolean;
  background?: string;
}
export interface ImgConvertResult { outputs: OutputFile[]; count: number }

export interface ImgToPdfParams {
  inputs: string[];
  output: string;
  page_size: "fit" | "a4" | "letter";
  orientation: "auto" | "portrait" | "landscape";
  margin_mm?: number;
}
export interface ImgToPdfResult { output: string; bytes: number; pages: number }

export interface PdfToImgParams {
  input: string;
  output_dir: string;
  format: "png" | "jpg";
  dpi?: number;
  pages?: string;
  base_name: string;
}
export interface PdfToImgResult { outputs: OutputFile[]; count: number }

export interface PingResult { pong: boolean; version: string; python: string }

/** Maps each op to its params and result types, so runJob() is fully typed. */
export interface OpMap {
  "sys.ping": [Record<string, never>, PingResult];
  "pdf.info": [PdfInfoParams, PdfInfoResult];
  "pdf.merge": [PdfMergeParams, PdfMergeResult];
  "pdf.split": [PdfSplitParams, PdfSplitResult];
  "pdf.organize": [PdfOrganizeParams, PdfOrganizeResult];
  "pdf.compress": [PdfCompressParams, PdfCompressResult];
  "pdf.sign": [PdfSignParams, PdfSignResult];
  "img.convert": [ImgConvertParams, ImgConvertResult];
  "img.to_pdf": [ImgToPdfParams, ImgToPdfResult];
  "pdf.to_img": [PdfToImgParams, PdfToImgResult];
}

export type ParamsOf<K extends keyof OpMap> = OpMap[K][0];
export type ResultOf<K extends keyof OpMap> = OpMap[K][1];

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let jobCounter = 0;
export const nextJobId = (): string => `j${++jobCounter}-${Date.now().toString(36)}`;

export interface RunOptions {
  onProgress?: (p: Progress) => void;
  /** Supply to make the job cancellable; call signal.abort() to cancel. */
  signal?: AbortSignal;
}

/**
 * Run one sidecar operation. Rejects with a JobError carrying a protocol code.
 */
export async function runJob<K extends keyof OpMap>(
  op: K,
  params: ParamsOf<K>,
  options: RunOptions = {},
): Promise<ResultOf<K>> {
  const id = nextJobId();

  if (!isTauri()) {
    return mockJob(op, params, id, options) as Promise<ResultOf<K>>;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const unlisten = await listen<Progress>("job://progress", (event) => {
    if (event.payload.id === id) options.onProgress?.(event.payload);
  });

  const onAbort = () => void invoke("cancel_job", { id });
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    return (await invoke("run_job", { id, op, params })) as ResultOf<K>;
  } catch (raw) {
    throw toJobError(raw);
  } finally {
    unlisten();
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Read a picked file's bytes into the webview, for pdf.js thumbnails.
 * In the browser the drop zone already handed us a File; under Tauri we only
 * have a path, so the Rust side reads it.
 */
export async function readFileBytes(file: { path: string; blob?: Blob }): Promise<ArrayBuffer> {
  if (file.blob) return file.blob.arrayBuffer();
  if (!isTauri()) {
    throw new JobError("FILE_NOT_FOUND", "That file's contents are not available in the browser.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return (await invoke("read_file_bytes", { path: file.path })) as ArrayBuffer;
}

export async function ping(): Promise<PingResult> {
  return runJob("sys.ping", {} as Record<string, never>);
}

function toJobError(raw: unknown): JobError {
  if (raw && typeof raw === "object" && "code" in raw) {
    const e = raw as { code: ErrorCode; message?: string; detail?: string };
    return new JobError(e.code, e.message ?? "Operation failed", e.detail);
  }
  return new JobError("INTERNAL", String(raw));
}

// ---------------------------------------------------------------------------
// Browser mock (vite dev without Tauri). Never reached in the packaged app.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mockJob(
  op: keyof OpMap,
  params: unknown,
  id: string,
  options: RunOptions,
): Promise<unknown> {
  for (const pct of [10, 35, 60, 85, 100]) {
    await sleep(180);
    if (options.signal?.aborted) throw new JobError("CANCELLED", "Cancelled");
    options.onProgress?.({ id, pct, note: `mock step ${pct}%` });
  }
  const p = params as Record<string, unknown>;
  const out = (p.output as string) ?? `${(p.output_dir as string) ?? "C:\mock"}\output`;
  switch (op) {
    case "sys.ping":
      return { pong: true, version: "0.1.0-mock", python: "mock" };
    case "pdf.info":
      return { pages: 6, encrypted: false, bytes: 234567, page_sizes: Array(6).fill([595, 842]) };
    case "pdf.compress":
      return { output: out, bytes: 61234, original_bytes: 234567, ratio: 0.739, engine: "ghostscript" };
    case "pdf.sign": {
      const elements = (p.elements as unknown[] | undefined)?.length ?? 0;
      return { output: out, bytes: 128432, pages: 6, elements };
    }
    case "pdf.split":
    case "img.convert":
    case "pdf.to_img": {
      const outputs = [1, 2, 3].map((n) => ({ path: `${out} ${n}`, bytes: 40000 + n * 900 }));
      return { outputs, count: outputs.length };
    }
    default:
      return { output: out, bytes: 128432, pages: 6 };
  }
}
