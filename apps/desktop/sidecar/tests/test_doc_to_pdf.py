"""Tests for txt.to_pdf, csv.to_pdf, html.to_pdf and zip.to_pdf."""
from __future__ import annotations

import zipfile

import pdfplumber
import pikepdf
import pytest

from ops import doc_to_pdf, zip_to_pdf
from ops._common import OpError, noop_progress


def text_of(path) -> str:
    with pdfplumber.open(str(path)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def page_count(path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def convert(fn, tmp_path, name: str, content: str | bytes, **extra):
    src = tmp_path / name
    src.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
    out = tmp_path / "out"
    result = fn({"inputs": [str(src)], "output_dir": str(out), **extra}, noop_progress)
    return result, result["outputs"][0]


# -- txt --------------------------------------------------------------------

def test_txt_keeps_text_and_names_the_pdf_after_the_input(tmp_path):
    result, out = convert(doc_to_pdf.run_txt, tmp_path, "notes.txt", "Hello world\n\nSecond paragraph")
    assert result["count"] == 1
    assert out["path"].endswith("notes.pdf")
    text = text_of(out["path"])
    assert "Hello world" in text and "Second paragraph" in text


def test_txt_long_input_runs_onto_more_pages(tmp_path):
    body = "\n".join(f"line {n}" for n in range(300))
    _, out = convert(doc_to_pdf.run_txt, tmp_path, "long.txt", body)
    assert out["pages"] > 1
    assert "line 299" in text_of(out["path"])


def test_txt_wraps_a_very_long_word_instead_of_overflowing(tmp_path):
    _, out = convert(doc_to_pdf.run_txt, tmp_path, "wide.txt", "x" * 400)
    with pdfplumber.open(out["path"]) as pdf:
        page = pdf.pages[0]
        assert max(c["x1"] for c in page.chars) <= page.width


def test_txt_accepts_a_windows_1252_file_and_non_ascii(tmp_path):
    _, out = convert(doc_to_pdf.run_txt, tmp_path, "cafe.txt", "caf\xe9 — na\xefve".encode("cp1252"))
    assert "caf" in text_of(out["path"])


def test_txt_empty_file_still_makes_a_valid_pdf(tmp_path):
    _, out = convert(doc_to_pdf.run_txt, tmp_path, "empty.txt", "")
    assert page_count(out["path"]) == 1


def test_txt_never_overwrites_an_existing_output(tmp_path):
    convert(doc_to_pdf.run_txt, tmp_path, "a.txt", "one")
    result, _ = convert(doc_to_pdf.run_txt, tmp_path, "a.txt", "two")
    assert result["outputs"][0]["path"].endswith("a (2).pdf")


def test_txt_rejects_bad_options(tmp_path):
    src = tmp_path / "a.txt"
    src.write_text("x")
    base = {"inputs": [str(src)], "output_dir": str(tmp_path / "o")}
    for bad in ({"font_size": 2}, {"page_size": "a0"}, {"margin_mm": 500}, {"font": "comic"}):
        with pytest.raises(OpError) as exc:
            doc_to_pdf.run_txt({**base, **bad}, noop_progress)
        assert exc.value.code == "BAD_PARAMS"


def test_txt_batch_makes_one_pdf_per_input(tmp_path):
    a, b = tmp_path / "a.txt", tmp_path / "b.txt"
    a.write_text("alpha")
    b.write_text("beta")
    result = doc_to_pdf.run_txt({"inputs": [str(a), str(b)], "output_dir": str(tmp_path / "o")}, noop_progress)
    assert result["count"] == 2
    assert "alpha" in text_of(result["outputs"][0]["path"])
    assert "beta" in text_of(result["outputs"][1]["path"])


def test_missing_input_is_reported(tmp_path):
    with pytest.raises(OpError) as exc:
        doc_to_pdf.run_txt({"inputs": [str(tmp_path / "nope.txt")], "output_dir": str(tmp_path)}, noop_progress)
    assert exc.value.code == "FILE_NOT_FOUND"


# -- csv --------------------------------------------------------------------

def test_csv_becomes_a_table_with_every_cell(tmp_path):
    _, out = convert(doc_to_pdf.run_csv, tmp_path, "t.csv", "name,qty\napple,3\npear,10\n")
    text = text_of(out["path"])
    for word in ("name", "qty", "apple", "pear", "10"):
        assert word in text


def test_csv_detects_semicolons_and_tabs(tmp_path):
    _, out = convert(doc_to_pdf.run_csv, tmp_path, "s.csv", "a;b\n1;2\n")
    assert "a" in text_of(out["path"])
    _, out = convert(doc_to_pdf.run_csv, tmp_path, "t.csv", "a\tb\n1\t2\n")
    assert "b" in text_of(out["path"])


def test_csv_wide_table_goes_landscape_on_auto(tmp_path):
    header = ",".join(f"c{n}" for n in range(10))
    _, out = convert(doc_to_pdf.run_csv, tmp_path, "w.csv", header + "\n" + ",".join("v" * 3 for _ in range(10)))
    with pikepdf.open(out["path"]) as pdf:
        w, h = (float(v) for v in pdf.pages[0].MediaBox[2:])
    assert w > h


def test_csv_header_repeats_on_every_page(tmp_path):
    rows = "\n".join(f"row{n},x" for n in range(200))
    _, out = convert(doc_to_pdf.run_csv, tmp_path, "r.csv", "HEADCOL,other\n" + rows)
    assert out["pages"] > 1
    with pdfplumber.open(out["path"]) as pdf:
        assert "HEADCOL" in pdf.pages[1].extract_text()


def test_csv_ragged_rows_and_quoted_commas(tmp_path):
    _, out = convert(doc_to_pdf.run_csv, tmp_path, "q.csv", 'a,b,c\n"x, y",2\n1\n')
    assert "x, y" in text_of(out["path"])


def test_csv_empty_is_rejected(tmp_path):
    src = tmp_path / "e.csv"
    src.write_text("  \n")
    with pytest.raises(OpError) as exc:
        doc_to_pdf.run_csv({"inputs": [str(src)], "output_dir": str(tmp_path / "o")}, noop_progress)
    assert exc.value.code == "UNSUPPORTED_FORMAT"


# -- html -------------------------------------------------------------------

HTML = """<html><head><title>ignore me</title><style>p{color:red}</style><script>alert('no')</script></head>
<body><h1>Main Title</h1><p>Some <b>bold</b> and <i>italic</i> text.</p>
<ul><li>first item</li><li>second item</li></ul><ol><li>one</li><li>two</li></ol>
<pre>  indented
code</pre><blockquote>quoted words</blockquote><hr>
<table><tr><th>Name</th><th>Score</th></tr><tr><td>Ann</td><td>9</td></tr></table></body></html>"""


def test_html_renders_content_and_skips_scripts_and_styles(tmp_path):
    _, out = convert(doc_to_pdf.run_html, tmp_path, "p.html", HTML)
    text = text_of(out["path"])
    for expected in ("Main Title", "bold", "italic", "first item", "second item", "indented", "quoted words", "Name", "Ann"):
        assert expected in text, expected
    assert "alert" not in text and "ignore me" not in text and "color:red" not in text


def test_html_lists_get_bullets_and_numbers(tmp_path):
    _, out = convert(doc_to_pdf.run_html, tmp_path, "p.html", HTML)
    text = text_of(out["path"])
    assert "• first item" in text
    assert "1. one" in text and "2. two" in text


def test_html_survives_broken_markup(tmp_path):
    _, out = convert(doc_to_pdf.run_html, tmp_path, "b.html", "<p>Unclosed <b>bold <i>both</p></i> &amp; entities &lt;ok&gt;<table><tr><td>cell")
    text = text_of(out["path"])
    assert "Unclosed" in text and "&" in text and "<ok>" in text and "cell" in text


def test_html_plain_text_with_no_tags_still_converts(tmp_path):
    _, out = convert(doc_to_pdf.run_html, tmp_path, "t.html", "just words")
    assert "just words" in text_of(out["path"])


# -- zip --------------------------------------------------------------------

def make_zip(tmp_path, entries: dict[str, bytes], name="in.zip"):
    path = tmp_path / name
    with zipfile.ZipFile(path, "w") as z:
        for entry, data in entries.items():
            z.writestr(entry, data)
    return path


def test_zip_joins_images_pdfs_and_text_in_natural_order(tmp_path, make_image, make_pdf):
    img = make_image("a", "png").read_bytes()
    pdf = make_pdf("p", pages=2).read_bytes()
    src = make_zip(tmp_path, {
        "10-text.txt": b"tenth entry",
        "2-photo.png": img,
        "1-doc.pdf": pdf,
        "notes/readme.md": b"skipped",
        "__MACOSX/._junk.png": b"x",
        ".hidden.png": img,
    })
    dest = tmp_path / "o" / "out.pdf"
    r = zip_to_pdf.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert r["files"] == 3 and r["skipped"] == 3  # md, __MACOSX and hidden files
    assert r["pages"] == 4  # 2 pdf pages + 1 image + 1 text page
    assert page_count(dest) == 4
    assert "tenth entry" in text_of(dest)
    with pdfplumber.open(str(dest)) as pdf:
        assert "PAGE 1" not in (pdf.pages[3].extract_text() or "")  # text page is last (10 after 2)


def test_zip_ignores_archive_paths_so_slip_names_are_harmless(tmp_path, make_image):
    img = make_image("a", "png").read_bytes()
    src = make_zip(tmp_path, {"../../evil.png": img, "ok.png": img})
    dest = tmp_path / "o" / "out.pdf"
    r = zip_to_pdf.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert r["pages"] == 2
    assert not (tmp_path.parent / "evil.png").exists()


def test_zip_with_nothing_usable_is_rejected(tmp_path):
    src = make_zip(tmp_path, {"a.docx": b"x", "b.exe": b"y"})
    with pytest.raises(OpError) as exc:
        zip_to_pdf.run({"input": str(src), "output": str(tmp_path / "o.pdf")}, noop_progress)
    assert exc.value.code == "UNSUPPORTED_FORMAT"


def test_not_a_zip_is_rejected(tmp_path):
    src = tmp_path / "fake.zip"
    src.write_bytes(b"this is not a zip")
    with pytest.raises(OpError) as exc:
        zip_to_pdf.run({"input": str(src), "output": str(tmp_path / "o.pdf")}, noop_progress)
    assert exc.value.code == "UNSUPPORTED_FORMAT"


def test_zip_with_a_corrupt_image_is_reported(tmp_path):
    src = make_zip(tmp_path, {"a.png": b"definitely not a png"})
    with pytest.raises(OpError) as exc:
        zip_to_pdf.run({"input": str(src), "output": str(tmp_path / "o.pdf")}, noop_progress)
    assert exc.value.code == "UNSUPPORTED_FORMAT"
