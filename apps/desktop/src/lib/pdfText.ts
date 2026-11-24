/**
 * Reads a PDF's text for the text tools (word counter), using the same
 * bundled, offline pdf.js as the page previews. Loaded on demand: most people
 * paste text instead.
 */
import type { OpenPdf } from "@iloathepdf/text";

export const openPdfText: OpenPdf = async (bytes) => {
  const [{ PDFWorker, getDocument }, { default: PdfJsWorker }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?worker"),
  ]);

  // One worker per document, for the reason given in pdfPreview.ts: a shared
  // worker dies with the first document closed.
  const worker = new PDFWorker({ port: new PdfJsWorker() } as unknown as ConstructorParameters<typeof PDFWorker>[0]);
  const task = getDocument({
    data: bytes,
    worker,
    // Keeps pdf.js entirely offline.
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy();
    worker.destroy();
    throw err;
  }

  return {
    numPages: doc.numPages,
    async pageText(n) {
      const content = await (await doc.getPage(n)).getTextContent();
      return content.items.flatMap((item) => ("str" in item ? [{ str: item.str, hasEOL: item.hasEOL }] : []));
    },
    async close() {
      await task.destroy();
      worker.destroy();
    },
  };
};
