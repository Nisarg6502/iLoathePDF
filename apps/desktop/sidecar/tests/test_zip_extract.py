"""zip.extract: in-place unpacking, and every way an archive can be hostile."""
from __future__ import annotations

import os
import struct
import zipfile
from pathlib import Path

import pytest

from ops import zip_extract
from ops._common import Cancelled, OpError, noop_progress


def make_zip(path: Path, entries: dict[str, bytes], **kwargs) -> Path:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, **kwargs) as z:
        for name, data in entries.items():
            if name.endswith("/"):
                z.writestr(zipfile.ZipInfo(name), b"")
            else:
                z.writestr(name, data)
    return path


def extract(src: Path, mode: str = "folder", **extra) -> dict:
    return zip_extract.run({"input": str(src), "mode": mode, **extra}, noop_progress)


def tree(root: Path) -> dict[str, bytes]:
    return {
        p.relative_to(root).as_posix(): p.read_bytes()
        for p in sorted(root.rglob("*"))
        if p.is_file()
    }


def no_staging_left(folder: Path) -> bool:
    return not any(p.name.startswith(".iloathepdf-extract-") for p in folder.iterdir())


# ---------------------------------------------------------------------------
# the two modes
# ---------------------------------------------------------------------------


def test_extract_to_a_folder_named_after_the_zip(tmp_path: Path):
    src = make_zip(tmp_path / "photos.zip", {"a.txt": b"A", "sub/b.txt": b"B", "empty/": b""})
    result = extract(src, "folder")
    folder = tmp_path / "photos"
    assert result["output"] == str(folder)
    assert result["outputs"] == [{"path": str(folder), "bytes": 2}]
    assert tree(folder) == {"a.txt": b"A", "sub/b.txt": b"B"}
    assert (folder / "empty").is_dir()
    assert result["files"] == 2
    assert result["folders"] == 2
    assert result["renamed"] == 0
    assert no_staging_left(tmp_path)


def test_a_single_top_folder_with_the_zips_name_is_not_doubled(tmp_path: Path):
    src = make_zip(tmp_path / "report.zip", {"report/a.txt": b"A", "report/b/c.txt": b"C"})
    extract(src, "folder")
    assert tree(tmp_path / "report") == {"a.txt": b"A", "b/c.txt": b"C"}


def test_extract_here_puts_the_top_level_items_beside_the_zip(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"one.txt": b"1", "docs/two.txt": b"2"})
    result = extract(src, "here")
    assert (tmp_path / "one.txt").read_bytes() == b"1"
    assert (tmp_path / "docs" / "two.txt").read_bytes() == b"2"
    assert result["output"] == str(tmp_path)
    assert sorted(Path(o["path"]).name for o in result["outputs"]) == ["docs", "one.txt"]


def test_an_output_dir_can_be_given(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"a.txt": b"A"})
    out = tmp_path / "elsewhere"
    extract(src, "here", output_dir=str(out))
    assert (out / "a.txt").read_bytes() == b"A"


# ---------------------------------------------------------------------------
# never overwrite
# ---------------------------------------------------------------------------


def test_existing_folder_is_never_overwritten(tmp_path: Path):
    src = make_zip(tmp_path / "photos.zip", {"a.txt": b"new"})
    (tmp_path / "photos").mkdir()
    (tmp_path / "photos" / "a.txt").write_bytes(b"old")
    result = extract(src, "folder")
    assert (tmp_path / "photos" / "a.txt").read_bytes() == b"old"
    assert (tmp_path / "photos (2)" / "a.txt").read_bytes() == b"new"
    assert result["renamed"] == 1
    # And again: (3), not a merge into (2).
    extract(src, "folder")
    assert (tmp_path / "photos (3)" / "a.txt").read_bytes() == b"new"


def test_extract_here_renames_what_is_taken_and_keeps_the_rest(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"a.txt": b"new", "b.txt": b"B", "docs/c.txt": b"C"})
    (tmp_path / "A.TXT").write_bytes(b"old")  # Windows names ignore case
    (tmp_path / "docs").mkdir()
    result = extract(src, "here")
    assert (tmp_path / "A.TXT").read_bytes() == b"old"
    assert (tmp_path / "a (2).txt").read_bytes() == b"new"
    assert (tmp_path / "b.txt").read_bytes() == b"B"
    assert (tmp_path / "docs (2)" / "c.txt").read_bytes() == b"C"
    assert not any((tmp_path / "docs").iterdir()), "an existing folder is not merged into"
    assert result["renamed"] == 2


def test_names_that_collide_inside_the_archive_both_survive(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"Read.txt": b"1", "read.txt": b"2", "a?b.txt": b"3", "a_b.txt": b"4"})
    extract(src, "folder")
    got = tree(tmp_path / "x")
    assert sorted(got.values()) == [b"1", b"2", b"3", b"4"]
    assert len(got) == 4


def test_a_file_and_a_folder_of_the_same_name(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"thing": b"file", "thing/inner.txt": b"in"})
    extract(src, "folder")
    got = tree(tmp_path / "x")
    assert got["thing"] == b"file"
    assert b"in" in got.values()


# ---------------------------------------------------------------------------
# hostile names
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    ["../evil.txt", "a/../../evil.txt", "/abs/evil.txt", "\\abs\\evil.txt", "C:/evil.txt", "c:evil.txt", "..\\evil.txt", "\\\\server\\share\\evil.txt"],
)
def test_zip_slip_refuses_the_whole_archive(tmp_path: Path, name: str):
    work = tmp_path / "work"
    work.mkdir()
    src = make_zip(work / "x.zip", {"fine.txt": b"ok", name: b"evil"})
    with pytest.raises(OpError) as err:
        extract(src, "here")
    assert err.value.code == "UNSAFE_ARCHIVE"
    # Nothing at all was written, not even the harmless entry.
    assert sorted(p.name for p in work.iterdir()) == ["x.zip"]
    assert not (tmp_path / "evil.txt").exists()


def test_windows_unfriendly_names_are_made_safe(tmp_path: Path):
    src = make_zip(
        tmp_path / "x.zip",
        {"what?.txt": b"1", "CON.txt": b"2", "trailing. ": b"3", "ads.txt:stream": b"4", "./dot/./x.txt": b"5"},
    )
    extract(src, "folder")
    got = tree(tmp_path / "x")
    assert got == {
        "what_.txt": b"1",
        "_CON.txt": b"2",
        "trailing": b"3",
        "ads.txt_stream": b"4",
        "dot/x.txt": b"5",
    }


def test_non_ascii_names_with_and_without_the_utf8_flag(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"Résumé.txt": b"1", "दस्तावेज़/फ़ाइल.txt": b"2"})
    extract(src, "folder")
    assert tree(tmp_path / "x") == {"Résumé.txt": b"1", "दस्तावेज़/फ़ाइल.txt": b"2"}

    # macOS and many tools write UTF-8 names without setting the flag:
    # zipfile then reads the bytes as CP437, and they must be read again.
    raw = tmp_path / "noflag.zip"
    with zipfile.ZipFile(raw, "w") as z:
        z.writestr("placeholder.txt", b"3")
    data = raw.read_bytes()
    utf8 = "Résumé-12.txt".encode("utf-8")
    assert len(utf8) == len(b"placeholder.txt")
    raw.write_bytes(data.replace(b"placeholder.txt", utf8))
    with zipfile.ZipFile(raw) as z:
        assert not z.infolist()[0].flag_bits & 0x800
    extract(raw, "folder")
    assert (tmp_path / "noflag" / "Résumé-12.txt").read_bytes() == b"3"


def test_symlinks_are_skipped_and_counted(tmp_path: Path):
    src = tmp_path / "x.zip"
    with zipfile.ZipFile(src, "w") as z:
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (0o120777 << 16)
        z.writestr(link, "/etc/passwd")
        z.writestr("real.txt", b"R")
    result = extract(src, "folder")
    assert tree(tmp_path / "x") == {"real.txt": b"R"}
    assert result["skipped"] == 1


# ---------------------------------------------------------------------------
# archives that can't be extracted
# ---------------------------------------------------------------------------


def test_not_a_zip_is_corrupt(tmp_path: Path):
    src = tmp_path / "x.zip"
    src.write_bytes(b"this is not a zip file at all")
    with pytest.raises(OpError) as err:
        extract(src)
    assert err.value.code == "CORRUPT_ARCHIVE"


def test_crc_damage_is_corrupt_and_leaves_nothing_behind(tmp_path: Path):
    src = tmp_path / "x.zip"
    with zipfile.ZipFile(src, "w", compression=zipfile.ZIP_STORED) as z:
        z.writestr("good.txt", b"G" * 100)
        z.writestr("bad.txt", b"hello world, this will be damaged")
    data = bytearray(src.read_bytes())
    i = data.index(b"hello world")
    data[i] = ord("J")
    src.write_bytes(bytes(data))
    with pytest.raises(OpError) as err:
        extract(src, "here")
    assert err.value.code == "CORRUPT_ARCHIVE"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["x.zip"]


def test_password_protected_is_reported(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"secret.txt": b"S"})
    # Set the "encrypted" bit in both headers, as a ZipCrypto archive has.
    data = bytearray(src.read_bytes())
    local = data.index(b"PK\x03\x04")
    central = data.index(b"PK\x01\x02")
    for offset in (local + 6, central + 8):
        (flags,) = struct.unpack_from("<H", data, offset)
        struct.pack_into("<H", data, offset, flags | 0x1)
    src.write_bytes(bytes(data))
    with pytest.raises(OpError) as err:
        extract(src)
    assert err.value.code == "ENCRYPTED_ARCHIVE"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["x.zip"]


def test_unsupported_compression_is_named(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {"a.txt": b"A"})
    data = bytearray(src.read_bytes())
    for sig, off in ((b"PK\x03\x04", 8), (b"PK\x01\x02", 10)):
        struct.pack_into("<H", data, data.index(sig) + off, 9)  # Deflate64
    src.write_bytes(bytes(data))
    with pytest.raises(OpError) as err:
        extract(src)
    assert err.value.code == "UNSUPPORTED_FORMAT"
    assert "Deflate64" in err.value.message


def test_empty_archive(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {})
    with pytest.raises(OpError) as err:
        extract(src)
    assert err.value.code == "EMPTY_ARCHIVE"


def test_not_enough_space_is_refused_up_front(tmp_path: Path, monkeypatch):
    src = make_zip(tmp_path / "x.zip", {"a.txt": b"A" * 1000})
    monkeypatch.setattr(zip_extract.shutil, "disk_usage", lambda _p: type("U", (), {"free": 10})())
    with pytest.raises(OpError) as err:
        extract(src)
    assert err.value.code == "OUTPUT_WRITE_FAILED"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["x.zip"]


def test_cancel_midway_leaves_nothing_behind(tmp_path: Path):
    src = make_zip(tmp_path / "x.zip", {f"f{i}.bin": os.urandom(2000) for i in range(20)})
    calls = {"n": 0}

    def progress(pct: int, note: str = "") -> None:
        calls["n"] += 1
        if calls["n"] > 5:
            raise Cancelled()

    with pytest.raises(Cancelled):
        zip_extract.run({"input": str(src), "mode": "here"}, progress)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["x.zip"]


def test_a_large_archive_streams_and_reports_progress(tmp_path: Path):
    big = os.urandom(3 * 1024 * 1024)  # incompressible, several chunks
    src = make_zip(tmp_path / "big.zip", {"big.bin": big, "small.txt": b"s"})
    seen: list[int] = []
    result = zip_extract.run({"input": str(src), "mode": "folder"}, lambda pct, note="": seen.append(pct))
    assert (tmp_path / "big" / "big.bin").read_bytes() == big
    assert result["bytes"] == len(big) + 1
    assert seen == sorted(seen) and seen[-1] == 100
    assert len(set(seen)) > 3


def test_timestamps_come_from_the_archive(tmp_path: Path):
    src = tmp_path / "x.zip"
    with zipfile.ZipFile(src, "w") as z:
        z.writestr(zipfile.ZipInfo("old.txt", date_time=(2001, 2, 3, 4, 5, 6)), b"o")
    extract(src, "folder")
    stamp = (tmp_path / "x" / "old.txt").stat().st_mtime
    import time

    assert time.localtime(stamp)[:6] == (2001, 2, 3, 4, 5, 6)


def test_deep_paths_past_260_characters(tmp_path: Path):
    deep = "/".join(["a-fairly-long-folder-name-" + str(i) for i in range(12)]) + "/leaf.txt"
    assert len(str(tmp_path)) + len(deep) > 260
    src = make_zip(tmp_path / "x.zip", {deep: b"L"})
    result = extract(src, "folder")
    assert result["files"] == 1
    leaf = zip_extract._long(tmp_path / "x" / Path(deep))
    assert leaf.read_bytes() == b"L"
