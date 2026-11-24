import type { OpenPdf } from "@iloathepdf/text";

/**
 * The web app's pdf.js, for reading a PDF's text in the text tools. Loaded on
 * demand: pdf.js is large and most people paste text instead.
 */
export const openPdfText: OpenPdf = async (bytes) => {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: bytes });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    throw e;
  }
  return {
    numPages: doc.numPages,
    async pageText(n) {
      const content = await (await doc.getPage(n)).getTextContent();
      return content.items.flatMap((item) => ("str" in item ? [{ str: item.str, hasEOL: item.hasEOL }] : []));
    },
    close: () => task.destroy(),
  };
};
