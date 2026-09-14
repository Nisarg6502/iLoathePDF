"""pdf.protect -- add or remove a password on a PDF. See PROTOCOL.md.

protect: open_pdf() already rejects an already-encrypted input with
ENCRYPTED_PDF, so re-protecting a protected file is refused rather than
silently juggling two passwords -- unlock first, then protect again.

unlock: opens with the supplied password (WRONG_PASSWORD if it matches
neither the user nor owner password) and re-saves with no encryption.
"""
from __future__ import annotations

from pathlib import Path

from ._common import (
    OpError,
    ProgressFn,
    atomic_output,
    existing_file,
    one_of,
    open_pdf,
    open_pdf_with_password,
    require,
    size_of,
)

MODES = ("protect", "unlock")
MIN_PASSWORD_LENGTH = 4


def run(params: dict, progress: ProgressFn) -> dict:
    src = existing_file(require(params, "input"))
    dest = Path(require(params, "output"))
    mode = one_of(params, "mode", MODES)
    password = require(params, "password")
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        raise OpError("BAD_PARAMS", f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    progress(5, f"Reading {src.name}")

    if mode == "protect":
        import pikepdf

        with open_pdf(src) as pdf:
            progress(40, "Encrypting")
            with atomic_output(dest) as tmp:
                pdf.save(
                    str(tmp),
                    encryption=pikepdf.Encryption(owner=password, user=password, R=6),
                )
    else:
        with open_pdf_with_password(src, password) as pdf:
            progress(40, "Removing password")
            with atomic_output(dest) as tmp:
                pdf.save(str(tmp))

    progress(100, "Done")
    return {"output": str(dest), "bytes": size_of(dest)}
