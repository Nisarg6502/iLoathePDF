export interface EngineInput {
  files: File[];
  options: Record<string, unknown>;
  onProgress?: (fraction: number) => void;
}

export interface EngineOutputFile {
  name: string;
  blob: Blob;
}

export interface EngineResult {
  files: EngineOutputFile[];
  summary: string; // e.g. "−75% smaller", "14 pages → 3 files"
  isPreview: boolean;
}

export type Engine = (input: EngineInput) => Promise<EngineResult>;
