/**
 * A small document layout engine on top of pdf-lib, used by the TXT, CSV and
 * HTML to PDF tools. It mirrors what sidecar/ops/doc_to_pdf.py does on the
 * desktop: flow blocks of text and tables onto A4 or Letter pages.
 *
 * pdf-lib's built-in fonts only encode WinAnsi (Latin-1 plus typographic
 * punctuation). Characters outside that set cannot be drawn, so they are
 * replaced with "?" and counted, so the tool can tell the person instead of
 * silently losing text.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type TextBlock = {
  type: "text";
  runs: Run[];
  /** Multiple of the document font size (headings). */
  scale?: number;
  bold?: boolean;
  indent?: number;
  gapBefore?: number;
  gapAfter?: number;
  gray?: boolean;
  /** Keep runs of spaces as typed (plain-text files) instead of collapsing them. */
  preserveSpaces?: boolean;
};
export type Block =
  | TextBlock
  | { type: "pre"; lines: string[] }
  | { type: "table"; rows: Run[][][]; header?: boolean }
  | { type: "rule" }
  | { type: "gap"; height: number };

export interface LayoutOptions {
  pageSize: "a4" | "letter";
  landscape: boolean;
  marginPt: number;
  fontSize: number;
  mono?: boolean;
  title?: string;
}

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const GRAY = rgb(0.3, 0.3, 0.3);
const GRID = rgb(0.7, 0.7, 0.7);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  supported: Set<number>;
}

interface Word {
  text: string;
  font: PDFFont;
  width: number;
  space: boolean;
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

async function loadFonts(doc: PDFDocument, mono: boolean): Promise<Fonts> {
  const [regular, bold, italic, boldItalic] = mono
    ? await Promise.all([
        doc.embedFont(StandardFonts.Courier),
        doc.embedFont(StandardFonts.CourierBold),
        doc.embedFont(StandardFonts.CourierOblique),
        doc.embedFont(StandardFonts.CourierBoldOblique),
      ])
    : await Promise.all([
        doc.embedFont(StandardFonts.Helvetica),
        doc.embedFont(StandardFonts.HelveticaBold),
        doc.embedFont(StandardFonts.HelveticaOblique),
        doc.embedFont(StandardFonts.HelveticaBoldOblique),
      ]);
  const monoFont = mono ? regular : await doc.embedFont(StandardFonts.Courier);
  return { regular, bold, italic, boldItalic, mono: monoFont, supported: new Set(regular.getCharacterSet()) };
}

class Writer {
  readonly doc: PDFDocument;
  readonly fonts: Fonts;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  page: PDFPage | null = null;
  y = 0;
  replaced = 0;

  constructor(doc: PDFDocument, fonts: Fonts, width: number, height: number, margin: number) {
    this.doc = doc;
    this.fonts = fonts;
    this.width = width;
    this.height = height;
    this.margin = margin;
  }

  get contentWidth(): number {
    return this.width - 2 * this.margin;
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([this.width, this.height]);
    this.y = this.height - this.margin;
    return this.page;
  }

  /** Room for `needed` points below the cursor, starting a new page if not. */
  ensure(needed: number): PDFPage {
    if (!this.page) return this.newPage();
    // Something taller than a page still has to start somewhere: only break
    // when the current page already holds content.
    const atTop = this.y >= this.height - this.margin - 0.5;
    if (this.y - needed < this.margin && !atTop) return this.newPage();
    return this.page;
  }

  clean(text: string): string {
    let out = "";
    for (const ch of text.replace(/\t/g, "    ")) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp < 32 || cp === 127) continue;
      if (this.supported(cp)) out += ch;
      else if (cp === 0xa0 || (cp >= 0x2000 && cp <= 0x200a)) out += " ";
      else if (cp === 0x200b || cp === 0xfeff) continue;
      else {
        out += "?";
        this.replaced += 1;
      }
    }
    return out;
  }

  private supported(cp: number): boolean {
    return this.fonts.supported.has(cp);
  }

  fontFor(run: { bold?: boolean; italic?: boolean }): PDFFont {
    if (run.bold && run.italic) return this.fonts.boldItalic;
    if (run.bold) return this.fonts.bold;
    if (run.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  /** Break runs into wrapped lines of words no wider than `maxWidth`. */
  wrap(runs: Run[], maxWidth: number, size: number, baseBold: boolean, preserveSpaces: boolean): Word[][] {
    const lines: Word[][] = [];
    let line: Word[] = [];
    let lineWidth = 0;

    const endLine = () => {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push(line);
      line = [];
      lineWidth = 0;
    };

    for (const run of runs) {
      const font = this.fontFor({ bold: baseBold || run.bold, italic: run.italic });
      const pieces = this.clean(run.text.replace(/\r/g, "").replace(/\t/g, "    ")).split(/(\n)/);
      for (const piece of pieces) {
        if (piece === "\n") {
          endLine();
          continue;
        }
        const tokens = preserveSpaces ? piece.split(/( )/) : piece.split(/( +)/);
        for (const token of tokens) {
          if (token === "") continue;
          const isSpace = token.trim() === "";
          const text = isSpace && !preserveSpaces ? " " : token;
          if (isSpace && line.length === 0 && !preserveSpaces) continue;
          const width = font.widthOfTextAtSize(text, size);
          if (!isSpace && width > maxWidth) {
            // A single word wider than the line: break it by character.
            let chunk = "";
            for (const ch of text) {
              if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth - lineWidth && chunk) {
                line.push({ text: chunk, font, width: font.widthOfTextAtSize(chunk, size), space: false });
                endLine();
                chunk = "";
              }
              chunk += ch;
            }
            if (chunk) {
              line.push({ text: chunk, font, width: font.widthOfTextAtSize(chunk, size), space: false });
              lineWidth += font.widthOfTextAtSize(chunk, size);
            }
            continue;
          }
          if (lineWidth + width > maxWidth && line.length > 0 && !isSpace) {
            endLine();
          } else if (lineWidth + width > maxWidth && isSpace) {
            // A space that would overflow ends the line instead of starting the next.
            endLine();
            continue;
          }
          line.push({ text, font, width, space: isSpace });
          lineWidth += width;
        }
      }
    }
    if (line.length || lines.length === 0) endLine();
    return lines;
  }

  drawLine(words: Word[], x: number, baseline: number, size: number, gray: boolean): void {
    const page = this.page!;
    // Draw runs of same-font tokens (spaces included) as one string, so extracted
    // text keeps its spaces instead of coming out as separate words.
    let cursor = x;
    let segment = "";
    let segmentFont: PDFFont | null = null;
    let segmentX = x;
    const flush = () => {
      if (segment.trim() && segmentFont) {
        page.drawText(segment, { x: segmentX, y: baseline, size, font: segmentFont, color: gray ? GRAY : rgb(0, 0, 0) });
      }
      segment = "";
    };
    for (const word of words) {
      if (segmentFont !== word.font) {
        flush();
        segmentFont = word.font;
        segmentX = cursor;
      }
      segment += word.text;
      cursor += word.width;
    }
    flush();
  }

  text(block: TextBlock, defaultSize: number): void {
    const size = defaultSize * (block.scale ?? 1);
    const leading = size * 1.35;
    const indent = block.indent ?? 0;
    const lines = this.wrap(block.runs, this.contentWidth - indent, size, !!block.bold, !!block.preserveSpaces);
    if (block.gapBefore && this.page && this.y < this.height - this.margin - 0.5) this.y -= block.gapBefore;
    // Keep at least the first two lines of a block together, so a heading never ends a page alone.
    this.ensure(leading * Math.min(2, lines.length));
    for (const line of lines) {
      this.ensure(leading);
      this.y -= leading;
      this.drawLine(line, this.margin + indent, this.y + leading * 0.25, size, !!block.gray);
    }
    this.y -= block.gapAfter ?? size * 0.6;
  }

  pre(lines: string[], size: number): void {
    const monoSize = size * 0.85;
    const leading = monoSize * 1.2;
    const charWidth = this.fonts.mono.widthOfTextAtSize("M", monoSize);
    const perLine = Math.max(1, Math.floor(this.contentWidth / charWidth));
    for (const raw of lines) {
      const cleaned = this.clean(raw);
      const chunks: string[] = [];
      for (let i = 0; i < Math.max(cleaned.length, 1); i += perLine) chunks.push(cleaned.slice(i, i + perLine));
      for (const chunk of chunks) {
        this.ensure(leading);
        this.y -= leading;
        if (chunk.trim()) this.page!.drawText(chunk, { x: this.margin, y: this.y + leading * 0.25, size: monoSize, font: this.fonts.mono });
      }
    }
    this.y -= size * 0.6;
  }

  rule(): void {
    this.ensure(12);
    this.y -= 6;
    this.page!.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.6, color: GRID });
    this.y -= 6;
  }

  table(rows: Run[][][], header: boolean, defaultSize: number, cellSize?: number): void {
    const columns = Math.max(...rows.map((r) => r.length), 1);
    const size = cellSize ?? defaultSize * 0.9;
    const leading = size * 1.25;
    const pad = 3;

    const plain = (cell: Run[]) => cell.map((r) => r.text).join("").length;
    const weights = Array.from({ length: columns }, (_, c) =>
      Math.min(40, Math.max(4, ...rows.slice(0, 200).map((r) => (r[c] ? plain(r[c]) : 0)))),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (this.contentWidth * w) / total);

    const drawRow = (row: Run[][], isHeader: boolean) => {
      const wrapped = Array.from({ length: columns }, (_, c) =>
        this.wrap(row[c] ?? [], widths[c] - 2 * pad, size, isHeader, false),
      );
      const height = Math.max(...wrapped.map((l) => l.length)) * leading + 2 * pad;
      return { wrapped, height };
    };

    const paint = (isHeader: boolean, wrapped: Word[][][], height: number) => {
      const page = this.ensure(height);
      let x = this.margin;
      const top = this.y;
      for (let c = 0; c < columns; c++) {
        page.drawRectangle({
          x, y: top - height, width: widths[c], height,
          borderColor: GRID, borderWidth: 0.4,
          ...(isHeader ? { color: rgb(0.92, 0.92, 0.92) } : {}),
        });
        wrapped[c].forEach((line, i) => {
          this.drawLine(line, x + pad, top - pad - (i + 1) * leading + leading * 0.25, size, false);
        });
        x += widths[c];
      }
      this.y -= height;
    };

    rows.forEach((row, index) => {
      const isHeader = header && index === 0;
      const { wrapped, height } = drawRow(row, isHeader);
      const atTop = !this.page || this.y >= this.height - this.margin - 0.5;
      if (this.page && !atTop && this.y - height < this.margin) {
        this.newPage();
        if (header && !isHeader) {
          // Repeat the header row on the new page; its characters were already counted once.
          const counted = this.replaced;
          const again = drawRow(rows[0], true);
          this.replaced = counted;
          paint(true, again.wrapped, again.height);
        }
      }
      paint(isHeader, wrapped, height);
    });
    this.y -= defaultSize * 0.8;
  }
}

export interface LayoutResult {
  bytes: Uint8Array;
  pages: number;
  /** Characters the PDF fonts cannot draw, replaced with "?". */
  replaced: number;
}

export async function layoutDocument(blocks: Block[], opts: LayoutOptions): Promise<LayoutResult> {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(opts.title);
  const [w, h] = PAGE_SIZES[opts.pageSize];
  const [width, height] = opts.landscape ? [h, w] : [w, h];
  const writer = new Writer(doc, await loadFonts(doc, !!opts.mono), width, height, opts.marginPt);

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        writer.text(block, opts.fontSize);
        break;
      case "pre":
        writer.pre(block.lines, opts.fontSize);
        break;
      case "table":
        writer.table(block.rows, !!block.header, opts.fontSize);
        break;
      case "rule":
        writer.rule();
        break;
      case "gap":
        if (writer.page) writer.y -= block.height;
        break;
    }
  }
  if (doc.getPageCount() === 0) doc.addPage([width, height]);
  return { bytes: await doc.save(), pages: doc.getPageCount(), replaced: writer.replaced };
}
