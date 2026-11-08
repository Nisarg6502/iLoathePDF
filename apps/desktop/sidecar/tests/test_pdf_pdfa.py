"""Tests for pdf.pdfa (Ghostscript PDF/A-2b conversion)."""
from __future__ import annotations

import pikepdf
import pytest

from ops import pdf_pdfa
from ops._common import OpError, has_ghostscript, noop_progress

needs_gs = pytest.mark.skipif(
    not (has_ghostscript() and pdf_pdfa.has_pdfa_resources()),
    reason="ghostscript with its PDF/A resources not installed",
)


@needs_gs
def test_pdfa_marks_the_output_as_pdfa_2b(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    dest = out_dir / "a-pdfa.pdf"
    r = pdf_pdfa.run({"input": str(src), "output": str(dest)}, noop_progress)
    assert r["pages"] == 2 and r["part"] == 2 and r["conformance"] == "B"
    assert dest.stat().st_size > 0
    with pikepdf.open(str(dest)) as pdf:
        assert len(pdf.pages) == 2
        meta = pdf.open_metadata()
        assert meta["pdfaid:part"] == "2"
        assert meta["pdfaid:conformance"] == "B"
        assert "/OutputIntents" in pdf.Root


@needs_gs
def test_pdfa_keeps_a_title_with_parentheses_in_the_name(make_pdf, out_dir, tmp_path):
    src = tmp_path / "report (final) v2.pdf"
    src.write_bytes(make_pdf("a", pages=1).read_bytes())
    dest = out_dir / "o.pdf"
    pdf_pdfa.run({"input": str(src), "output": str(dest)}, noop_progress)
    with pikepdf.open(str(dest)) as pdf:
        assert pdf.open_metadata()["pdfaid:part"] == "2"


def test_pdfa_rejects_missing_and_encrypted_input(make_pdf, out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        pdf_pdfa.run({"input": str(tmp_path / "nope.pdf"), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "FILE_NOT_FOUND"

    locked = tmp_path / "locked.pdf"
    with pikepdf.open(str(make_pdf("a", pages=1))) as pdf:
        pdf.save(str(locked), encryption=pikepdf.Encryption(user="pw", owner="pw"))
    with pytest.raises(OpError) as exc:
        pdf_pdfa.run({"input": str(locked), "output": str(out_dir / "o.pdf")}, noop_progress)
    assert exc.value.code == "ENCRYPTED_PDF"
