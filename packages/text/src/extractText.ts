import { unzipSync } from "fflate";
import { tr } from "@iloathepdf/i18n";

/**
 * Reads the text out of a file the user picked or dropped, entirely in this
 * tab: nothing is uploaded. Plain text, Markdown and CSV are decoded as text;
 * PDFs go through the app's own pdf.js (see OpenPdf); Word files are unzipped
 * and their body XML read.
 */

/** One line-ish run of text on a PDF page, as pdf.js reports it. */
export interface PdfTextItem {
  str: string;
  hasEOL: boolean;
}

/** An opened PDF, reduced to what text extraction needs. */
export interface PdfTextSource {
  numPages: number;
  pageText(pageNumber: number): Promise<PdfTextItem[]>;
  close(): Promise<void>;
}

/**
 * Opens PDF bytes with the app's own pdf.js. Each app provides one: the web
 * app and the desktop app ship their own pdf.js copy and start its worker
 * differently, and both only load pdf.js when a PDF is actually opened.
 * Rejects with an error named "PasswordException" for a locked PDF, as pdf.js
 * itself does.
 */
export type OpenPdf = (bytes: Uint8Array) => Promise<PdfTextSource>;

export interface ExtractTextOptions {
  openPdf: OpenPdf;
}

/** For an <input type="file"> accept attribute. */
export const TEXT_FILE_ACCEPT =
  ".txt,.md,.markdown,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ExtractTextErrorCode = "unsupported" | "password" | "unreadable";

/** Thrown by extractText; `message` is already translated for display. */
export class ExtractTextError extends Error {
  readonly code: ExtractTextErrorCode;
  constructor(code: ExtractTextErrorCode, message: string) {
    super(message);
    this.name = "ExtractTextError";
    this.code = code;
  }
}

type Kind = "text" | "pdf" | "docx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function kindOf(file: File): Kind | null {
  const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "csv") return "text";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext) return null;
  // No extension: fall back to the browser's guess at the type.
  if (file.type === "application/pdf") return "pdf";
  if (file.type === DOCX_MIME) return "docx";
  if (file.type.startsWith("text/")) return "text";
  return null;
}

/**
 * Returns the file's text. A PDF with no text layer (a scan) returns "".
 * Throws ExtractTextError for unsupported types, locked PDFs and files that
 * can't be read.
 */
export async function extractText(file: File, { openPdf }: ExtractTextOptions): Promise<string> {
  const kind = kindOf(file);
  if (!kind) {
    throw new ExtractTextError("unsupported", tr("That file type isn't supported. Open a .txt, .md, .csv, .pdf or .docx file."));
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw unreadable();
  }
  if (kind === "text") return decodeText(bytes);
  if (kind === "docx") return docxText(bytes);
  return pdfText(bytes, openPdf);
}

function unreadable() {
  return new ExtractTextError("unreadable", tr("Couldn't read this file."));
}

/** UTF-8 by default; a byte-order mark is dropped, and a UTF-16 one honoured. */
export function decodeText(bytes: Uint8Array): string {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  // TextDecoder strips a matching BOM by default.
  return new TextDecoder(encoding).decode(bytes);
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

/**
 * Body text of a Word document: each paragraph is a line. Headers, footers,
 * footnotes and comments live in other parts of the zip and are left out on
 * purpose, so the count matches the document body.
 */
function docxText(bytes: Uint8Array): string {
  let xml: Uint8Array | undefined;
  try {
    xml = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" })["word/document.xml"];
  } catch {
    throw unreadable();
  }
  if (!xml) throw unreadable();
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw unreadable();
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) return "";

  const lines: string[] = [];
  const walk = (node: Element, buf: string[]) => {
    for (const child of Array.from(node.children)) {
      const ns = child.namespaceURI;
      const name = child.localName;
      if (ns === MC && name === "Fallback") continue; // duplicate of mc:Choice
      if (ns !== W) {
        walk(child, buf);
        continue;
      }
      if (name === "p") {
        const line: string[] = [];
        walk(child, line);
        lines.push(line.join(""));
      } else if (name === "t") buf.push(child.textContent ?? "");
      else if (name === "tab") buf.push("\t");
      else if (name === "br" || name === "cr") buf.push("\n");
      else if (name === "noBreakHyphen") buf.push("-");
      // Paragraph and run properties hold tab-stop definitions, not text;
      // deleted tracked changes (w:del) are not part of the document.
      else if (name !== "pPr" && name !== "rPr" && name !== "del") walk(child, buf);
    }
  };
  walk(body, lines);
  return lines.join("\n");
}

async function pdfText(bytes: Uint8Array, openPdf: OpenPdf): Promise<string> {
  let doc: PdfTextSource;
  try {
    doc = await openPdf(bytes);
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") {
      throw new ExtractTextError(
        "password",
        tr("This PDF is password protected. Remove the password with Protect & Unlock first, then open it here."),
      );
    }
    throw unreadable();
  }
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      let page = "";
      for (const item of await doc.pageText(n)) {
        page += item.str;
        if (item.hasEOL) page += "\n";
      }
      const tidy = page
        .split("\n")
        .map((l) => l.replace(/\s+$/, ""))
        .join("\n")
        .trim();
      if (tidy) pages.push(tidy);
    }
    return pages.join("\n\n");
  } catch {
    throw unreadable();
  } finally {
    await doc.close();
  }
}
