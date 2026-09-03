"""End-to-end tests that drive main.py as a real subprocess over stdio.

The unit tests call each op directly; these prove the thing Rust actually
talks to. In particular they guard the rule that breaks everything silently:
stdout must carry protocol JSON and nothing else.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SIDECAR = Path(__file__).resolve().parents[1] / "main.py"


class Engine:
    """A live sidecar process. Writes requests, reads until each job ends."""

    def __init__(self, proc: subprocess.Popen):
        self.proc = proc

    def send(self, job_id: str, op: str, params: dict) -> None:
        line = json.dumps({"id": job_id, "op": op, "params": params}) + "\n"
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

    def collect(self, job_id: str, timeout_lines: int = 5000):
        """Read until the terminal message for job_id. Returns (terminal, progress[])."""
        progress = []
        for _ in range(timeout_lines):
            raw = self.proc.stdout.readline()
            if not raw:
                raise AssertionError("engine closed stdout before finishing the job")
            message = json.loads(raw)  # a non-JSON line here is the bug we are hunting
            if message["id"] != job_id:
                continue
            if message["type"] == "progress":
                progress.append(message)
            else:
                return message, progress
        raise AssertionError("too many lines without a terminal message")

    def run(self, job_id: str, op: str, params: dict):
        self.send(job_id, op, params)
        return self.collect(job_id)


@pytest.fixture
def engine():
    proc = subprocess.Popen(
        [sys.executable, str(SIDECAR)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,  # logs; not part of the contract
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    try:
        yield Engine(proc)
    finally:
        try:
            proc.stdin.close()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


def test_ping_round_trip(engine):
    terminal, _ = engine.run("j1", "sys.ping", {})
    assert terminal["type"] == "result"
    assert terminal["data"]["pong"] is True


def test_unknown_op_is_a_protocol_error_not_a_crash(engine):
    terminal, _ = engine.run("j1", "does.not.exist", {})
    assert terminal["type"] == "error"
    assert terminal["code"] == "BAD_PARAMS"


def test_malformed_line_does_not_kill_the_engine(engine):
    engine.proc.stdin.write("this is not json\n")
    engine.proc.stdin.flush()
    engine.proc.stdout.readline()  # the error envelope for the bad line
    terminal, _ = engine.run("after", "sys.ping", {})
    assert terminal["type"] == "result"


def test_merge_over_the_wire_emits_progress_and_a_result(engine, make_pdf, tmp_path):
    a, b = make_pdf("a", pages=2), make_pdf("b", pages=3)
    out = tmp_path / "merged.pdf"

    terminal, progress = engine.run("m1", "pdf.merge", {
        "inputs": [{"path": str(a)}, {"path": str(b)}],
        "output": str(out),
    })

    assert terminal["type"] == "result", terminal
    assert terminal["data"]["pages"] == 5
    assert Path(terminal["data"]["output"]).exists()
    assert progress, "the UI has nothing to show without progress events"
    assert all(0 <= p["pct"] <= 100 for p in progress)


def test_image_convert_over_the_wire(engine, make_image, out_dir):
    src = make_image("photo", "png", size=(120, 90))
    terminal, _ = engine.run("i1", "img.convert", {
        "inputs": [str(src)],
        "output_dir": str(out_dir),
        "format": "jpg",
        "quality": 80,
    })
    assert terminal["type"] == "result", terminal
    assert terminal["data"]["count"] == 1
    assert Path(terminal["data"]["outputs"][0]["path"]).exists()


def test_errors_carry_a_usable_code(engine, encrypted_pdf, tmp_path):
    terminal, _ = engine.run("e1", "pdf.merge", {
        "inputs": [{"path": str(encrypted_pdf)}],
        "output": str(tmp_path / "out.pdf"),
    })
    assert terminal["type"] == "error"
    assert terminal["code"] == "ENCRYPTED_PDF"
    assert terminal["message"], "the UI shows this string to the user"


def test_jobs_are_concurrent_and_replies_are_correlated(engine, make_pdf, tmp_path):
    """Two jobs in flight at once must not cross their replies."""
    a = make_pdf("a", pages=2)
    engine.send("first", "pdf.info", {"input": str(a)})
    engine.send("second", "sys.ping", {})

    second, _ = engine.collect("second")
    first, _ = engine.collect("first")

    assert second["data"]["pong"] is True
    assert first["data"]["pages"] == 2


def test_missing_file_is_reported_not_raised(engine, tmp_path):
    terminal, _ = engine.run("nf", "pdf.info", {"input": str(tmp_path / "nope.pdf")})
    assert terminal["type"] == "error"
    assert terminal["code"] == "FILE_NOT_FOUND"
