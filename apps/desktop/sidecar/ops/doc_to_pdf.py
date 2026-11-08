"""txt.to_pdf, csv.to_pdf and html.to_pdf -- turn plain documents into PDFs.
See PROTOCOL.md.

All three lay text out with reportlab's Platypus. Each input becomes its own
PDF, named after the input and written into `output_dir`.

Fonts: reportlab's built-in Helvetica only covers Latin-1, so text is set in a
TrueType family instead -- the first complete one found among the machine's
own fonts (Segoe UI, Arial, DejaVu), else the Bitstream Vera family reportlab
ships. Characters the chosen family lacks are drawn as its missing-glyph box;
scripts that need shaping (Devanagari, Arabic) are not supported.

HTML support is deliberately modest: headings, paragraphs, lists, tables,
preformatted text, quotes, rules, bold and italic. Scripts, styles and images
are ignored -- this is a document converter, not a browser.
"""
from __future__ import annotations

import csv
import html
import io
import re
from html.parser import HTMLParser
from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    ensure_dir,
    existing_file,
    one_of,
    require,
    size_of,
    unique_path,
)

PAGE_SIZES = ("a4", "letter")
ORIENTATIONS = ("portrait", "landscape", "auto")
MAX_INPUT_BYTES = 50 * 1024 * 1024


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------

_FAMILY_CACHE: dict[str, tuple[str, str]] = {}

_SANS_CANDIDATES = (
    # (regular, bold, italic, bold-italic) -- first complete set wins.
    ("segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"),
    ("arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"),
    ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf"),
)
_MONO_CANDIDATES = (
    ("consola.ttf", "consolab.ttf", "consolai.ttf", "consolaz.ttf"),
    ("cour.ttf", "courbd.ttf", "couri.ttf", "courbi.ttf"),
    ("DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf", "DejaVuSansMono-Oblique.ttf", "DejaVuSansMono-BoldOblique.ttf"),
)


def _font_dirs() -> list[Path]:
    import os

    dirs = [
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts",
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/dejavu"),
        Path("/Library/Fonts"),
        Path("/System/Library/Fonts/Supplemental"),
    ]
    return [d for d in dirs if d.is_dir()]


def _find_family(candidates) -> tuple[Path, Path, Path, Path] | None:
    for names in candidates:
        for directory in _font_dirs():
            found = [directory / n for n in names]
            if all(p.is_file() for p in found):
                return tuple(found)  # type: ignore[return-value]
    return None


def font_family(kind: str) -> tuple[str, str]:
    """Register and return (family name, bold name) for 'sans' or 'mono'."""
    if kind in _FAMILY_CACHE:
        return _FAMILY_CACHE[kind]

    import reportlab
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    paths = _find_family(_SANS_CANDIDATES if kind == "sans" else _MONO_CANDIDATES)
    if paths is None:
        vera = Path(reportlab.__file__).parent / "fonts"
        if kind == "sans":
            paths = (vera / "Vera.ttf", vera / "VeraBd.ttf", vera / "VeraIt.ttf", vera / "VeraBI.ttf")
        else:
            paths = (vera / "VeraMono.ttf", vera / "VeraMoBd.ttf", vera / "VeraMoIt.ttf", vera / "VeraMoBI.ttf")
        if not all(p.is_file() for p in paths):
            # No Vera mono in some reportlab builds: fall back to the sans family.
            return font_family("sans") if kind != "sans" else ("Helvetica", "Helvetica-Bold")

    family = f"ihp-{kind}"
    names = [f"{family}-{suffix}" for suffix in ("r", "b", "i", "bi")]
    for name, path in zip(names, paths):
        pdfmetrics.registerFont(TTFont(name, str(path)))
    pdfmetrics.registerFontFamily(family, normal=names[0], bold=names[1], italic=names[2], boldItalic=names[3])
    _FAMILY_CACHE[kind] = (names[0], names[1])
    return _FAMILY_CACHE[kind]


# --------------------------------------------------------------------------
# shared plumbing
# --------------------------------------------------------------------------

def _read_text(path: Path) -> str:
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise OpError("UNSUPPORTED_FORMAT", f"{path.name} is larger than {MAX_INPUT_BYTES // (1024 * 1024)} MB")
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def _page_size(name: str, landscape: bool):
    from reportlab.lib.pagesizes import A4, LETTER, landscape as to_landscape

    size = A4 if name == "a4" else LETTER
    return to_landscape(size) if landscape else size


def _margin(params: dict) -> float:
    from reportlab.lib.units import mm

    try:
        value = float(params.get("margin_mm", 20))
    except (TypeError, ValueError):
        raise OpError("BAD_PARAMS", "'margin_mm' must be a number") from None
    if not 0 <= value <= 60:
        raise OpError("BAD_PARAMS", "'margin_mm' must be between 0 and 60")
    return value * mm


def _inputs(params: dict) -> list[Path]:
    raw = require(params, "inputs")
    if not isinstance(raw, list) or not raw:
        raise OpError("BAD_PARAMS", "'inputs' must be a non-empty list of paths")
    return [existing_file(item) for item in raw]


def _build(path: Path, flowables, pagesize, margin: float) -> None:
    from reportlab.platypus import SimpleDocTemplate

    doc = SimpleDocTemplate(
        str(path), pagesize=pagesize,
        leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin,
        title=path.stem,
    )
    doc.build(flowables or [_blank_paragraph()])


def _blank_paragraph():
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph

    return Paragraph("&nbsp;", ParagraphStyle("blank", fontSize=10))


def _count_pages(path: Path) -> int:
    import pikepdf

    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def _run_each(params: dict, progress: ProgressFn, render) -> dict:
    sources = _inputs(params)
    out_dir = ensure_dir(str(require(params, "output_dir")))
    outputs = []
    for index, src in enumerate(sources):
        progress(int(90 * index / len(sources)), f"{src.name} ({index + 1} of {len(sources)})")
        dest = unique_path(out_dir / f"{src.stem}.pdf")
        with atomic_output(dest) as tmp:
            render(src, tmp)
        outputs.append({"path": str(dest), "bytes": size_of(dest), "pages": _count_pages(dest)})
    progress(100, "Done")
    return {"outputs": outputs, "count": len(outputs)}


def _escape(text: str) -> str:
    """Escape for reportlab Paragraph markup; keeps runs of spaces."""
    out = html.escape(text, quote=False)
    return re.sub(r" {2,}", lambda m: "&nbsp;" * len(m.group()), out)


# --------------------------------------------------------------------------
# txt
# --------------------------------------------------------------------------

def run_txt(params: dict, progress: ProgressFn) -> dict:
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, Spacer

    page_size = one_of(params, "page_size", PAGE_SIZES, "a4")
    orientation = one_of(params, "orientation", ORIENTATIONS, "portrait")
    kind = one_of(params, "font", ("sans", "mono"), "sans")
    try:
        font_size = float(params.get("font_size", 11))
    except (TypeError, ValueError):
        raise OpError("BAD_PARAMS", "'font_size' must be a number") from None
    if not 6 <= font_size <= 36:
        raise OpError("BAD_PARAMS", "'font_size' must be between 6 and 36")
    margin = _margin(params)
    pagesize = _page_size(page_size, orientation == "landscape")

    def render(src: Path, dest: Path) -> None:
        name, _bold = font_family(kind)
        style = ParagraphStyle("txt", fontName=name, fontSize=font_size, leading=font_size * 1.35, splitLongWords=1)
        text = _read_text(src).replace("\r\n", "\n").replace("\r", "\n").replace("\t", "    ")
        flowables = []
        for line in text.split("\n"):
            flowables.append(Paragraph(_escape(line), style) if line.strip() else Spacer(1, font_size * 1.35))
        _build(dest, flowables, pagesize, margin)

    return _run_each(params, progress, render)


# --------------------------------------------------------------------------
# csv
# --------------------------------------------------------------------------

def _sniff(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def run_csv(params: dict, progress: ProgressFn) -> dict:
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, Table, TableStyle

    page_size = one_of(params, "page_size", PAGE_SIZES, "a4")
    orientation = one_of(params, "orientation", ORIENTATIONS, "auto")
    margin = _margin(params)

    def render(src: Path, dest: Path) -> None:
        text = _read_text(src)
        if not text.strip():
            raise OpError("UNSUPPORTED_FORMAT", f"{src.name} is empty")
        delimiter = _sniff(text[:4096])
        csv.field_size_limit(10 * 1024 * 1024)
        rows = [r for r in csv.reader(io.StringIO(text, newline=""), delimiter=delimiter) if any(c.strip() for c in r)]
        columns = max(len(r) for r in rows)
        rows = [r + [""] * (columns - len(r)) for r in rows]

        landscape = orientation == "landscape" or (orientation == "auto" and columns > 6)
        pagesize = _page_size(page_size, landscape)
        available = pagesize[0] - 2 * margin
        font_size = 9 if columns <= 6 else 8 if columns <= 12 else 6.5
        name, bold = font_family("sans")
        cell = ParagraphStyle("cell", fontName=name, fontSize=font_size, leading=font_size * 1.25, splitLongWords=1)
        head = ParagraphStyle("head", parent=cell, fontName=bold)

        weights = [min(40, max(4, max(len(r[c]) for r in rows[:200]))) for c in range(columns)]
        widths = [available * w / sum(weights) for w in weights]
        data = [
            [Paragraph(_escape(value), head if r == 0 else cell) for value in row]
            for r, row in enumerate(rows)
        ]
        table = Table(data, colWidths=widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.Color(0.7, 0.7, 0.7)),
            ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.92, 0.92, 0.92)),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        _build(dest, [table], pagesize, margin)

    return _run_each(params, progress, render)


# --------------------------------------------------------------------------
# html
# --------------------------------------------------------------------------

_SKIP = {"script", "style", "head", "title", "noscript", "template", "svg"}
_HEADINGS = {"h1": 2.0, "h2": 1.6, "h3": 1.3, "h4": 1.15, "h5": 1.05, "h6": 1.0}
_BLOCKS = {"p", "div", "section", "article", "header", "footer", "main", "nav", "aside", "figure", "figcaption", "dd", "dt", "dl"}


class _Collector(HTMLParser):
    """Collects HTML into simple blocks of Paragraph markup.

    Blocks are tuples: ("para", markup, kind, level) where kind is heading,
    para, quote or item; ("pre", text); ("rule",); ("table", rows).
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[tuple] = []
        self._buf: list[str] = []
        self._open = {"b": 0, "i": 0}
        self._skip = 0
        self._pre = False
        self._pre_text: list[str] = []
        self._lists: list[list] = []  # [ordered, counter]
        self._heading: str | None = None
        self._quote = 0
        self._table = 0
        self._rows: list[list[str]] = []
        self._cells: list[str] = []
        self._in_cell = False

    # -- inline buffer ---------------------------------------------------
    def _flush(self, kind: str = "para", level: str | None = None, prefix: str = "") -> None:
        markup = "".join(self._buf).strip()
        closers = "".join(f"</{t}>" for t, n in self._open.items() if n > 0)
        # Re-open anything still open so formatting carries on after the break.
        openers = "".join(f"<{t}>" for t, n in self._open.items() if n > 0)
        self._buf = [openers] if openers else []
        if re.sub(r"<[^>]+>", "", markup).strip():
            self.blocks.append(("para", prefix + markup + closers, kind, level, len(self._lists), self._quote))

    # -- parser callbacks -----------------------------------------------
    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in _SKIP:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == "table":
            self._flush()
            self._table += 1
            if self._table == 1:
                self._rows = []
            return
        if self._table:
            if self._table == 1 and tag == "tr":
                self._cells = []
            elif self._table == 1 and tag in ("td", "th"):
                self._in_cell = True
                self._buf = ["<b>"] if tag == "th" else []
            elif tag == "br":
                self._buf.append("<br/>")
            elif tag in ("b", "strong", "i", "em"):
                self._inline(tag, True)
            return
        if tag in _HEADINGS:
            self._flush()
            self._heading = tag
        elif tag in _BLOCKS:
            self._flush()
        elif tag == "br":
            self._buf.append("<br/>")
        elif tag in ("ul", "ol"):
            self._flush()
            self._lists.append([tag == "ol", 0])
        elif tag == "li":
            self._flush()
            if self._lists:
                self._lists[-1][1] += 1
        elif tag == "pre":
            self._flush()
            self._pre = True
            self._pre_text = []
        elif tag == "blockquote":
            self._flush()
            self._quote += 1
        elif tag == "hr":
            self._flush()
            self.blocks.append(("rule",))
        elif tag in ("b", "strong", "i", "em"):
            self._inline(tag, True)

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag == "table" and self._table:
            self._table -= 1
            if self._table == 0:
                if self._rows:
                    self.blocks.append(("table", self._rows))
            return
        if self._table:
            if self._table == 1 and tag in ("td", "th") and self._in_cell:
                self._cells.append(self._take_cell())
            elif self._table == 1 and tag == "tr":
                if self._in_cell:
                    self._cells.append(self._take_cell())
                if self._cells:
                    self._rows.append(self._cells)
                self._cells = []
            elif tag in ("b", "strong", "i", "em"):
                self._inline(tag, False)
            return
        if tag in _HEADINGS:
            self._flush("heading", tag)
            self._heading = None
        elif tag in _BLOCKS:
            self._flush()
        elif tag in ("ul", "ol"):
            self._flush()
            if self._lists:
                self._lists.pop()
        elif tag == "li":
            ordered, counter = self._lists[-1] if self._lists else (False, 0)
            self._flush("item", prefix=f"{counter}. " if ordered else "\u2022 ")
        elif tag == "pre":
            self.blocks.append(("pre", "".join(self._pre_text)))
            self._pre = False
        elif tag == "blockquote":
            self._flush()
            self._quote = max(0, self._quote - 1)
        elif tag in ("b", "strong", "i", "em"):
            self._inline(tag, False)

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._pre:
            self._pre_text.append(data)
            return
        text = re.sub(r"\s+", " ", data)
        if not text.strip() and not self._buf:
            return
        self._buf.append(html.escape(text, quote=False))

    # -- helpers ---------------------------------------------------------
    def _inline(self, tag: str, opening: bool) -> None:
        key = "b" if tag in ("b", "strong") else "i"
        if opening:
            self._open[key] += 1
            self._buf.append(f"<{key}>")
        elif self._open[key] > 0:
            self._open[key] -= 1
            self._buf.append(f"</{key}>")

    def _take_cell(self) -> str:
        markup = "".join(self._buf).strip()
        self._in_cell = False
        self._buf = []
        # Close any inline tag the cell left open.
        return markup + ("</b>" if markup.count("<b>") > markup.count("</b>") else "")

    def finish(self) -> list[tuple]:
        self._flush()
        return self.blocks


def _html_flowables(source: str, font_size: float, width: float):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import HRFlowable, Paragraph, Preformatted, Spacer, Table, TableStyle

    name, bold = font_family("sans")
    mono, _ = font_family("mono")
    body = ParagraphStyle("body", fontName=name, fontSize=font_size, leading=font_size * 1.4, spaceAfter=font_size * 0.6)
    cell = ParagraphStyle("cell", parent=body, fontSize=font_size * 0.9, leading=font_size * 1.2, spaceAfter=0)

    collector = _Collector()
    collector.feed(source)
    collector.close()
    flowables = []
    for block in collector.finish():
        kind = block[0]
        if kind == "para":
            _, markup, style_kind, level, depth, quote = block
            if style_kind == "heading":
                scale = _HEADINGS[level]
                style = ParagraphStyle(
                    f"h-{level}", parent=body, fontName=bold, fontSize=font_size * scale,
                    leading=font_size * scale * 1.25, spaceBefore=font_size * 0.6, spaceAfter=font_size * 0.5,
                    keepWithNext=1,
                )
            else:
                indent = (max(depth, 1) * 14 if style_kind == "item" else 0) + quote * 18
                style = ParagraphStyle(
                    f"p-{style_kind}-{indent}", parent=body, leftIndent=indent, spaceAfter=body.spaceAfter / (2 if style_kind == "item" else 1),
                )
                if quote:
                    style.textColor = colors.Color(0.3, 0.3, 0.3)
            try:
                flowables.append(Paragraph(markup, style))
            except Exception:  # noqa: BLE001 - malformed inline markup: keep the text, drop the tags
                plain = html.escape(re.sub(r"<[^>]+>", "", html.unescape(markup)), quote=False)
                flowables.append(Paragraph(plain, style))
        elif kind == "pre":
            text = block[1].strip("\n").replace("\t", "    ")
            if text:
                style = ParagraphStyle("pre", fontName=mono, fontSize=font_size * 0.85, leading=font_size * 1.15, splitLongWords=1)
                for line in text.split("\n"):
                    # Preformatted never wraps; a Paragraph with kept spaces does.
                    flowables.append(Paragraph(_escape(line) or "&nbsp;", style))
                flowables.append(Spacer(1, font_size * 0.6))
        elif kind == "rule":
            flowables.append(HRFlowable(width="100%", thickness=0.6, color=colors.Color(0.6, 0.6, 0.6), spaceBefore=6, spaceAfter=6))
        elif kind == "table":
            rows = block[1]
            columns = max(len(r) for r in rows)
            rows = [r + [""] * (columns - len(r)) for r in rows]
            plain_len = [[len(re.sub(r"<[^>]+>", "", c)) for c in r] for r in rows]
            weights = [min(40, max(4, max(row[c] for row in plain_len))) for c in range(columns)]
            widths = [width * w / sum(weights) for w in weights]
            data = []
            for row in rows:
                cells = []
                for markup in row:
                    try:
                        cells.append(Paragraph(markup or "&nbsp;", cell))
                    except Exception:  # noqa: BLE001
                        cells.append(Paragraph(html.escape(re.sub(r"<[^>]+>", "", markup), quote=False) or "&nbsp;", cell))
                data.append(cells)
            table = Table(data, colWidths=widths, repeatRows=1)
            table.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, colors.Color(0.7, 0.7, 0.7)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]))
            flowables.append(table)
            flowables.append(Spacer(1, font_size * 0.8))
    return flowables


def run_html(params: dict, progress: ProgressFn) -> dict:
    page_size = one_of(params, "page_size", PAGE_SIZES, "a4")
    orientation = one_of(params, "orientation", ORIENTATIONS, "portrait")
    try:
        font_size = float(params.get("font_size", 11))
    except (TypeError, ValueError):
        raise OpError("BAD_PARAMS", "'font_size' must be a number") from None
    if not 6 <= font_size <= 36:
        raise OpError("BAD_PARAMS", "'font_size' must be between 6 and 36")
    margin = _margin(params)
    pagesize = _page_size(page_size, orientation == "landscape")

    def render(src: Path, dest: Path) -> None:
        flowables = _html_flowables(_read_text(src), font_size, pagesize[0] - 2 * margin)
        _build(dest, flowables, pagesize, margin)

    return _run_each(params, progress, render)
