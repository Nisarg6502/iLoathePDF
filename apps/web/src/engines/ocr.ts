import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Engine } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function pageHasText(page: pdfjsLib.PDFPageProxy): Promise<boolean> {
  const content = await page.getTextContent();
  return content.items.some((item) => "str" in item && item.str.trim().length > 0);
}

export const ocrEngine: Engine = async ({ files }) => {
  const file = files[0];
  if (!file) throw new Error("Add a scanned PDF to OCR.");

  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      if (await pageHasText(page)) {
        throw new Error("This PDF already has selectable text — OCR is for scanned/image-only PDFs.");
      }
    }

    throw new Error("not yet implemented past the text guard");
  } finally {
    await loadingTask.destroy();
  }
};
