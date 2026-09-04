"""Tests for the shared helpers every op depends on."""
import pytest

from ops._common import (
    OpError,
    atomic_output,
    parse_pages,
    parse_range_groups,
    unique_path,
)


def test_parse_pages_selects_and_preserves_order():
    assert parse_pages("1-3,5", 10) == [0, 1, 2, 4]
    assert parse_pages("5,1", 10) == [4, 0]


def test_parse_pages_defaults_to_all():
    assert parse_pages(None, 3) == [0, 1, 2]
    assert parse_pages("  ", 3) == [0, 1, 2]


@pytest.mark.parametrize("spec", ["0", "3-1", "abc", "1-99", "-4"])
def test_parse_pages_rejects_bad_specs(spec):
    with pytest.raises(OpError) as exc:
        parse_pages(spec, 10)
    assert exc.value.code == "BAD_PARAMS"


def test_parse_range_groups_keeps_groups_separate():
    assert parse_range_groups("1-3,4-6", 10) == [[0, 1, 2], [3, 4, 5]]


def test_unique_path_never_overwrites(tmp_path):
    p = tmp_path / "out.pdf"
    assert unique_path(p) == p
    p.write_bytes(b"x")
    assert unique_path(p).name == "out (2).pdf"


def test_atomic_output_leaves_nothing_behind_on_failure(tmp_path):
    dest = tmp_path / "out.pdf"
    with pytest.raises(RuntimeError):
        with atomic_output(dest) as tmp:
            tmp.write_bytes(b"partial")
            raise RuntimeError("boom")
    assert not dest.exists()
    assert list(tmp_path.iterdir()) == []


def test_atomic_output_publishes_on_success(tmp_path):
    dest = tmp_path / "out.pdf"
    with atomic_output(dest) as tmp:
        tmp.write_bytes(b"done")
    assert dest.read_bytes() == b"done"


def test_relative_paths_are_refused(tmp_path):
    """Outputs must never be resolved against the engine's working directory."""
    from ops._common import ensure_dir, existing_file

    with pytest.raises(OpError) as exc:
        ensure_dir("out")
    assert exc.value.code == "BAD_PARAMS"

    with pytest.raises(OpError) as exc:
        existing_file("sample.pdf")
    assert exc.value.code == "BAD_PARAMS"

    # Absolute paths still work.
    assert ensure_dir(str(tmp_path / "made")).is_dir()
