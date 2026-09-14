"""Tests for pdf.protect."""
import pytest

from ops._common import OpError, noop_progress
from ops.pdf_protect import run


def test_protect_then_unlock_round_trips_content(make_pdf, out_dir):
    import pikepdf

    src = make_pdf("a", pages=3)
    protected = out_dir / "protected.pdf"
    run(
        {"input": str(src), "output": str(protected), "mode": "protect", "password": "secret1"},
        noop_progress,
    )

    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(str(protected))

    unlocked = out_dir / "unlocked.pdf"
    result = run(
        {"input": str(protected), "output": str(unlocked), "mode": "unlock", "password": "secret1"},
        noop_progress,
    )
    assert result["output"] == str(unlocked)
    assert result["bytes"] > 0
    with pikepdf.open(str(unlocked)) as pdf:
        assert len(pdf.pages) == 3


def test_protect_rejects_already_encrypted_input(encrypted_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(encrypted_pdf), "output": str(out_dir / "o.pdf"),
             "mode": "protect", "password": "secret1"},
            noop_progress,
        )
    assert exc.value.code == "ENCRYPTED_PDF"


def test_unlock_rejects_wrong_password(make_pdf, out_dir):
    src = make_pdf("a", pages=1)
    protected = out_dir / "protected.pdf"
    run(
        {"input": str(src), "output": str(protected), "mode": "protect", "password": "correct-pw"},
        noop_progress,
    )

    with pytest.raises(OpError) as exc:
        run(
            {"input": str(protected), "output": str(out_dir / "o.pdf"),
             "mode": "unlock", "password": "wrong-pw"},
            noop_progress,
        )
    assert exc.value.code == "WRONG_PASSWORD"


def test_unlock_on_non_encrypted_input_is_a_harmless_no_op(make_pdf, out_dir):
    # pikepdf.open(path, password=...) on an unencrypted file just opens it
    # and ignores the password (verified against pikepdf 10.12.0), so unlock
    # on a plain PDF succeeds rather than erroring.
    src = make_pdf("a", pages=1)
    result = run(
        {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "unlock", "password": "whatever"},
        noop_progress,
    )
    assert result["bytes"] > 0


@pytest.mark.parametrize("password", ["", "abc", None])
def test_rejects_short_or_missing_password(make_pdf, out_dir, password):
    src = make_pdf("a", pages=1)
    params = {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "protect"}
    if password is not None:
        params["password"] = password
    with pytest.raises(OpError) as exc:
        run(params, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


@pytest.mark.parametrize("mode", ["lock", "", None])
def test_rejects_bad_mode(make_pdf, out_dir, mode):
    src = make_pdf("a", pages=1)
    params = {"input": str(src), "output": str(out_dir / "o.pdf"), "password": "secret1"}
    if mode is not None:
        params["mode"] = mode
    with pytest.raises(OpError) as exc:
        run(params, noop_progress)
    assert exc.value.code == "BAD_PARAMS"


def test_missing_input_file(out_dir, tmp_path):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(tmp_path / "ghost.pdf"), "output": str(out_dir / "o.pdf"),
             "mode": "protect", "password": "secret1"},
            noop_progress,
        )
    assert exc.value.code == "FILE_NOT_FOUND"


def test_corrupt_input(corrupt_pdf, out_dir):
    with pytest.raises(OpError) as exc:
        run(
            {"input": str(corrupt_pdf), "output": str(out_dir / "o.pdf"),
             "mode": "protect", "password": "secret1"},
            noop_progress,
        )
    assert exc.value.code == "CORRUPT_PDF"


def test_progress_is_reported(make_pdf, out_dir):
    calls = []
    src = make_pdf("a", pages=1)
    run(
        {"input": str(src), "output": str(out_dir / "o.pdf"), "mode": "protect", "password": "secret1"},
        lambda pct, note="": calls.append((pct, note)),
    )
    assert calls
    assert calls[-1][0] == 100
