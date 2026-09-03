"""Tests for the structural PDF ops: info, merge, split and organize."""
from __future__ import annotations

from pathlib import Path

import pikepdf
import pytest

from ops import pdf_info, pdf_merge, pdf_organize, pdf_split
from ops._common import OpError


class Recorder:
    """A progress sink that remembers everything it was told."""

    def __init__(self) -> None:
        self.calls: list[tuple[int, str]] = []

    def __call__(self, pct: int, note: str = "") -> None:
        self.calls.append((int(pct), note))

    @property
    def pcts(self) -> list[int]:
        return [pct for pct, _ in self.calls]


def page_count(path) -> int:
    with pikepdf.open(str(path)) as pdf:
        return len(pdf.pages)


def rotation_of(path, index: int) -> int:
    with pikepdf.open(str(path)) as pdf:
        return int(pdf.pages[index].rotation) % 360


# ---------------------------------------------------------------- pdf.info


def test_info_reports_pages_bytes_and_sizes(make_pdf):
    src = make_pdf("a", pages=3)
    progress = Recorder()

    result = pdf_info.run({"input": str(src)}, progress)

    assert set(result) == {"pages", "encrypted", "bytes", "page_sizes"}
    assert result["pages"] == 3
    assert result["encrypted"] is False
    assert result["bytes"] == src.stat().st_size
    assert len(result["page_sizes"]) == 3
    assert result["page_sizes"][0] == pytest.approx([595.0, 842.0], abs=1.0)
    assert progress.calls and progress.pcts[-1] == 100


def test_info_swaps_size_for_rotated_pages(make_pdf, tmp_path):
    src = make_pdf("rot", pages=1)
    rotated = tmp_path / "rotated.pdf"
    with pikepdf.open(str(src)) as pdf:
        pdf.pages[0].rotate(90, relative=False)
        pdf.save(str(rotated))

    sizes = pdf_info.run({"input": str(rotated)}, Recorder())["page_sizes"]
    assert sizes[0] == pytest.approx([842.0, 595.0], abs=1.0)


def test_info_rejects_missing_input():
    with pytest.raises(OpError) as exc:
        pdf_info.run({}, Recorder())
    assert exc.value.code == "BAD_PARAMS"


def test_info_reports_missing_file(tmp_path):
    with pytest.raises(OpError) as exc:
        pdf_info.run({"input": str(tmp_path / "nope.pdf")}, Recorder())
    assert exc.value.code == "FILE_NOT_FOUND"


def test_info_on_encrypted_pdf(encrypted_pdf):
    with pytest.raises(OpError) as exc:
        pdf_info.run({"input": str(encrypted_pdf)}, Recorder())
    assert exc.value.code == "ENCRYPTED_PDF"


def test_info_on_corrupt_pdf(corrupt_pdf):
    with pytest.raises(OpError) as exc:
        pdf_info.run({"input": str(corrupt_pdf)}, Recorder())
    assert exc.value.code == "CORRUPT_PDF"


# --------------------------------------------------------------- pdf.merge


def test_merge_concatenates_all_pages(make_pdf, out_dir):
    a, b = make_pdf("a", pages=3), make_pdf("b", pages=2)
    dest = out_dir / "merged.pdf"
    progress = Recorder()

    result = pdf_merge.run(
        {"inputs": [{"path": str(a)}, {"path": str(b)}], "output": str(dest)}, progress
    )

    assert set(result) == {"output", "bytes", "pages"}
    assert result["pages"] == 5
    assert page_count(dest) == 5
    assert result["bytes"] == dest.stat().st_size
    assert progress.pcts[-1] == 100


def test_merge_honours_per_input_page_ranges(make_pdf, out_dir):
    a, b = make_pdf("a", pages=5), make_pdf("b", pages=4)
    dest = out_dir / "merged.pdf"

    result = pdf_merge.run(
        {
            "inputs": [{"path": str(a), "pages": "1-2,5"}, {"path": str(b), "pages": "3"}],
            "output": str(dest),
        },
        Recorder(),
    )

    assert result["pages"] == 4
    assert page_count(dest) == 4


def test_merge_accepts_the_same_file_twice(make_pdf, out_dir):
    a = make_pdf("a", pages=2)
    dest = out_dir / "merged.pdf"

    result = pdf_merge.run(
        {"inputs": [{"path": str(a)}, {"path": str(a), "pages": "1"}], "output": str(dest)},
        Recorder(),
    )

    assert result["pages"] == 3
    assert page_count(dest) == 3


def test_merge_accepts_bare_string_inputs(make_pdf, out_dir):
    a = make_pdf("a", pages=2)
    dest = out_dir / "merged.pdf"
    assert pdf_merge.run({"inputs": [str(a)], "output": str(dest)}, Recorder())["pages"] == 2


@pytest.mark.parametrize("inputs", [[], "a.pdf", [{"pages": "1"}], [42]])
def test_merge_rejects_bad_inputs(inputs, out_dir):
    with pytest.raises(OpError) as exc:
        pdf_merge.run({"inputs": inputs, "output": str(out_dir / "m.pdf")}, Recorder())
    assert exc.value.code == "BAD_PARAMS"


def test_merge_rejects_out_of_range_pages(make_pdf, out_dir):
    a = make_pdf("a", pages=2)
    with pytest.raises(OpError) as exc:
        pdf_merge.run(
            {"inputs": [{"path": str(a), "pages": "1-9"}], "output": str(out_dir / "m.pdf")},
            Recorder(),
        )
    assert exc.value.code == "BAD_PARAMS"


def test_merge_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_merge.run(
                {"inputs": [{"path": str(src)}], "output": str(out_dir / "m.pdf")}, Recorder()
            )
        assert exc.value.code == code
    # a failed merge must not leave a half-written output behind
    assert not (out_dir / "m.pdf").exists()


# --------------------------------------------------------------- pdf.split


def base_params(src: Path, out_dir: Path, **extra) -> dict:
    return {"input": str(src), "output_dir": str(out_dir), "base_name": "doc", **extra}


def test_split_ranges_writes_one_file_per_range(make_pdf, out_dir):
    src = make_pdf("a", pages=6)
    progress = Recorder()

    result = pdf_split.run(
        base_params(src, out_dir, mode="ranges", ranges="1-3,5"), progress
    )

    assert result["count"] == 2
    names = [Path(o["path"]).name for o in result["outputs"]]
    assert names == ["doc pages 1-3.pdf", "doc page 5.pdf"]
    assert [o["pages"] for o in result["outputs"]] == [3, 1]
    assert [page_count(o["path"]) for o in result["outputs"]] == [3, 1]
    assert progress.pcts[-1] == 100


def test_split_every_chunks_including_the_short_tail(make_pdf, out_dir):
    src = make_pdf("a", pages=5)

    result = pdf_split.run(base_params(src, out_dir, mode="every", every=2), Recorder())

    assert result["count"] == 3
    assert [o["pages"] for o in result["outputs"]] == [2, 2, 1]
    assert [page_count(o["path"]) for o in result["outputs"]] == [2, 2, 1]
    assert Path(result["outputs"][-1]["path"]).name == "doc page 5.pdf"


def test_split_extract_keeps_only_selected_pages(make_pdf, out_dir):
    src = make_pdf("a", pages=8)

    result = pdf_split.run(base_params(src, out_dir, mode="extract", pages="2,5-7"), Recorder())

    assert result["count"] == 1
    only = result["outputs"][0]
    assert only["pages"] == 4
    assert page_count(only["path"]) == 4
    assert Path(only["path"]).name == "doc extracted.pdf"


def test_split_delete_removes_selected_pages(make_pdf, out_dir):
    src = make_pdf("a", pages=5)

    result = pdf_split.run(base_params(src, out_dir, mode="delete", pages="2,4"), Recorder())

    only = result["outputs"][0]
    assert only["pages"] == 3
    assert page_count(only["path"]) == 3
    assert Path(only["path"]).name == "doc trimmed.pdf"


def test_split_defaults_base_name_to_input_stem(make_pdf, out_dir):
    src = make_pdf("report", pages=2)
    result = pdf_split.run(
        {"input": str(src), "output_dir": str(out_dir), "mode": "every", "every": 2}, Recorder()
    )
    assert Path(result["outputs"][0]["path"]).name == "report pages 1-2.pdf"


def test_split_never_overwrites_existing_output(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    params = base_params(src, out_dir, mode="extract", pages="1")

    first = pdf_split.run(params, Recorder())["outputs"][0]["path"]
    second = pdf_split.run(params, Recorder())["outputs"][0]["path"]

    assert Path(first).name == "doc extracted.pdf"
    assert Path(second).name == "doc extracted (2).pdf"
    assert Path(first).exists() and Path(second).exists()


@pytest.mark.parametrize(
    "extra",
    [
        {"mode": "sideways"},
        {"mode": "ranges"},                 # no 'ranges'
        {"mode": "ranges", "ranges": "9-12"},  # out of bounds
        {"mode": "every"},                  # no 'every'
        {"mode": "every", "every": 0},
        {"mode": "every", "every": "two"},
        {"mode": "extract"},                # no 'pages'
        {"mode": "extract", "pages": "abc"},
        {"mode": "delete", "pages": "1-4"},  # would delete everything
    ],
)
def test_split_rejects_bad_params(make_pdf, out_dir, extra):
    src = make_pdf("a", pages=4)
    with pytest.raises(OpError) as exc:
        pdf_split.run(base_params(src, out_dir, **extra), Recorder())
    assert exc.value.code == "BAD_PARAMS"


def test_split_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_split.run(base_params(src, out_dir, mode="every", every=1), Recorder())
        assert exc.value.code == code


# ------------------------------------------------------------ pdf.organize


def test_organize_reorders_and_rotates(make_pdf, out_dir):
    src = make_pdf("a", pages=3)
    dest = out_dir / "organized.pdf"
    progress = Recorder()

    result = pdf_organize.run(
        {
            "input": str(src),
            "output": str(dest),
            "order": [2, 0, 1],
            "rotations": {"2": 90, "1": 180},
        },
        progress,
    )

    assert set(result) == {"output", "bytes", "pages"}
    assert result["pages"] == 3
    assert page_count(dest) == 3
    assert rotation_of(dest, 0) == 90    # source page 2
    assert rotation_of(dest, 1) == 0     # source page 0, untouched
    assert rotation_of(dest, 2) == 180   # source page 1
    assert progress.pcts[-1] == 100


def test_organize_drops_pages_missing_from_order(make_pdf, out_dir):
    src = make_pdf("a", pages=4)
    dest = out_dir / "organized.pdf"

    result = pdf_organize.run({"input": str(src), "output": str(dest), "order": [0, 3]}, Recorder())

    assert result["pages"] == 2
    assert page_count(dest) == 2


def test_organize_rotation_is_absolute_not_relative(make_pdf, out_dir, tmp_path):
    src = make_pdf("a", pages=1)
    pre = tmp_path / "pre.pdf"
    with pikepdf.open(str(src)) as pdf:
        pdf.pages[0].rotate(180, relative=False)
        pdf.save(str(pre))
    dest = out_dir / "organized.pdf"

    pdf_organize.run(
        {"input": str(pre), "output": str(dest), "order": [0], "rotations": {"0": 90}}, Recorder()
    )

    assert rotation_of(dest, 0) == 90


@pytest.mark.parametrize(
    "params",
    [
        {"order": []},
        {"order": "0,1"},
        {"order": [0, 9]},
        {"order": ["0"]},
        {"order": [0], "rotations": {"0": 45}},
        {"order": [0], "rotations": {"0": "90"}},
        {"order": [0], "rotations": {"nine": 90}},
        {"order": [0], "rotations": {"7": 90}},
        {"order": [0], "rotations": [90]},
    ],
)
def test_organize_rejects_bad_params(make_pdf, out_dir, params):
    src = make_pdf("a", pages=3)
    dest = out_dir / "organized.pdf"
    with pytest.raises(OpError) as exc:
        pdf_organize.run({"input": str(src), "output": str(dest), **params}, Recorder())
    assert exc.value.code == "BAD_PARAMS"
    assert not dest.exists()


def test_organize_requires_order(make_pdf, out_dir):
    src = make_pdf("a", pages=2)
    with pytest.raises(OpError) as exc:
        pdf_organize.run({"input": str(src), "output": str(out_dir / "o.pdf")}, Recorder())
    assert exc.value.code == "BAD_PARAMS"


def test_organize_propagates_encrypted_and_corrupt(encrypted_pdf, corrupt_pdf, out_dir):
    for src, code in ((encrypted_pdf, "ENCRYPTED_PDF"), (corrupt_pdf, "CORRUPT_PDF")):
        with pytest.raises(OpError) as exc:
            pdf_organize.run(
                {"input": str(src), "output": str(out_dir / "o.pdf"), "order": [0]}, Recorder()
            )
        assert exc.value.code == code
