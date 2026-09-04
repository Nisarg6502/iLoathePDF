"""Tests for pdf.compress.

The Ghostscript-backed levels are skipped when no binary is present; the
GHOSTSCRIPT_MISSING behaviour is asserted the other way round, by forcing the
lookup to fail, so both halves are covered on any machine.
"""
import pytest

from ops._common import Cancelled, OpError, has_ghostscript, noop_progress
from ops.pdf_compress import run

needs_gs = pytest.mark.skipif(not has_ghostscript(), reason="ghostscript not installed")


def _no_ghostscript(monkeypatch):
    """Simulate a machine without Ghostscript, whatever this one has, so the
    'must not silently fall back' rule is tested both with and without it."""

    def _raise() -> str:
        raise OpError("GHOSTSCRIPT_MISSING", "Ghostscript was not found.")

    monkeypatch.setattr("ops.pdf_compress.find_ghostscript", _raise)


def test_lossless_produces_a_readable_pdf(make_pdf, out_dir):
    import pikepdf

    src = make_pdf("a", pages=3)
    dest = out_dir / "small.pdf"
    result = run({"input": str(src), "output": str(dest), "level": "lossless"}, noop_progress)

    assert result["engine"] == "pikepdf"
    assert result["output"] == str(dest)
    assert result["bytes"] <= result["original_bytes"]
    assert result["ratio"] == pytest.approx(1 - result["bytes"] / result["original_bytes"])
    with pikepdf.open(str(dest)) as pdf:
        assert len(pdf.pages) == 3


def test_lossless_never_grows_the_file(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    dest = out_dir / "small.pdf"
    result = run({"input": str(src), "output": str(dest), "level": "lossless"}, noop_progress)
    assert dest.stat().st_size <= src.stat().st_size
    assert result["ratio"] >= 0


def test_progress_is_reported(make_pdf, out_dir):
    calls = []
    src = make_pdf("a", pages=2)
    run(
        {"input": str(src), "output": str(out_dir / "o.pdf"), "level": "lossless"},
        lambda pct, note="": calls.append((pct, note)),
    )
    assert calls
    assert calls[-1][0] == 100
    assert all(0 <= pct <= 100 for pct, _ in calls)


def test_cancel_propagates(make_pdf, out_dir):
    src = make_pdf("a", pages=2)

    def cancelling(pct, note=""):
        raise Cancelled()

    with pytest.raises(OpError) as exc:
        run({"input": str(src), "output": str(out_dir / "o.pdf"), "level": "lossless"}, cancelling)
    assert exc.value.code == "CANCELLED"
    assert not (out_dir / "o.pdf").exists()


def test_encrypted_input(encrypted_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(encrypted_pdf), "output": str(out_dir / "o.pdf"), "level": "lossless"},
            noop_progress,
        )
    assert exc.value.code == "ENCRYPTED_PDF"


def test_corrupt_input(corrupt_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(corrupt_pdf), "output": str(out_dir / "o.pdf"), "level": "lossless"},
            noop_progress,
        )
    assert exc.value.code == "CORRUPT_PDF"


def test_missing_input_file(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(tmp_path / "ghost.pdf"), "output": str(out_dir / "o.pdf"),
             "level": "lossless"},
            noop_progress,
        )
    assert exc.value.code == "FILE_NOT_FOUND"


@pytest.mark.parametrize("level", ["turbo", "", None])
def test_bad_level(make_pdf, out_dir, level):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        run({"input": str(src), "output": str(out_dir / "o.pdf"), "level": level}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


def test_missing_output_param(make_pdf):
    src = make_pdf("a", pages=1)
    with pytest.raises(OpError) as exc:
        run({"input": str(src), "level": "lossless"}, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


@pytest.mark.parametrize("level", ["balanced", "strong"])
def test_lossy_levels_need_ghostscript(make_pdf, out_dir, monkeypatch, level):
    src = make_pdf("a", pages=1)
    dest = out_dir / "o.pdf"
    _no_ghostscript(monkeypatch)
    with pytest.raises(OpError) as exc:
        run({"input": str(src), "output": str(dest), "level": level}, noop_progress)
    assert exc.value.code == "GHOSTSCRIPT_MISSING"
    assert not dest.exists()


@needs_gs
@pytest.mark.parametrize("level", ["balanced", "strong"])
def test_ghostscript_levels_round_trip(make_pdf, out_dir, level):
    import pikepdf

    src = make_pdf("a", pages=3)
    dest = out_dir / f"{level}.pdf"
    result = run({"input": str(src), "output": str(dest), "level": level}, noop_progress)

    assert result["engine"] == "ghostscript"
    assert result["bytes"] == dest.stat().st_size
    assert result["original_bytes"] == src.stat().st_size
    # The safety net guarantees we never publish something bigger than we got.
    assert result["bytes"] <= result["original_bytes"]
    assert result["ratio"] >= 0
    with pikepdf.open(str(dest)) as pdf:
        assert len(pdf.pages) == 3


def test_encrypted_is_rejected_before_spawning_ghostscript(encrypted_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(encrypted_pdf), "output": str(out_dir / "o.pdf"), "level": "strong"},
            noop_progress,
        )
    assert exc.value.code == "ENCRYPTED_PDF"


@needs_gs
def test_ghostscript_failure_surfaces_as_internal(make_pdf, out_dir, monkeypatch):
    # Point the runner at Ghostscript with a bogus device so it exits non-zero:
    # proves a failed child becomes INTERNAL with its stderr attached, and that
    # atomic_output leaves no half-written file behind.
    monkeypatch.setattr("ops.pdf_compress._PDFSETTINGS", {"strong": "/notARealPreset"})
    src = make_pdf("a", pages=1)
    dest = out_dir / "o.pdf"
    with pytest.raises(OpError) as exc:
        run({"input": str(src), "output": str(dest), "level": "strong"}, noop_progress)
    assert exc.value.code == "INTERNAL"
    assert "Ghostscript" in exc.value.message
    assert not dest.exists()
