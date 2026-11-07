export interface EngineInput {
  files: File[];
  options: Record<string, unknown>;
  onProgress?: (fraction: number) => void;
}

export interface EngineOutputFile {
  name: string;
  blob: Blob;
  /** Optional one-line note shown under the name, e.g. "3.1 MB → 1.2 MB · 62% smaller". */
  detail?: string;
}

export interface EngineResult {
  files: EngineOutputFile[];
  summary: string; // e.g. "−75% smaller", "14 pages → 3 files"
  isPreview: boolean;
}

export type Engine = (input: EngineInput) => Promise<EngineResult>;
