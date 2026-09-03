"""iLoathePDF document engine.

A long-lived process speaking newline-delimited JSON on stdin/stdout.
Protocol: sidecar/PROTOCOL.md (frozen contract).

stdout is protocol-only. Everything human-readable goes to stderr.
Nothing here imports a networking library, by design.
"""
from __future__ import annotations

import json
import platform
import sys
import threading
import traceback
from importlib import import_module

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))

from ops._common import Cancelled, OpError  # noqa: E402

VERSION = "0.1.0"

# op name -> "module:function". Modules are imported on first use so that a
# half-finished op can never stop the sidecar from starting.
DISPATCH: dict[str, str] = {
    "pdf.info": "ops.pdf_info:run",
    "pdf.merge": "ops.pdf_merge:run",
    "pdf.split": "ops.pdf_split:run",
    "pdf.organize": "ops.pdf_organize:run",
    "pdf.compress": "ops.pdf_compress:run",
    "img.convert": "ops.img_convert:run",
    "img.to_pdf": "ops.img_to_pdf:run",
    "pdf.to_img": "ops.pdf_to_img:run",
}

_stdout_lock = threading.Lock()
_cancels: dict[str, threading.Event] = {}
_cancels_lock = threading.Lock()


def emit(message: dict) -> None:
    line = json.dumps(message, ensure_ascii=False)
    with _stdout_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def log(*parts) -> None:
    print(*parts, file=sys.stderr, flush=True)


def make_progress(job_id: str, cancel: threading.Event):
    """Build the progress callback for one job.

    Ops that shell out poll `progress()` several times a second purely to
    observe cancellation, so identical consecutive updates are dropped here
    rather than flooding the protocol channel.
    """
    last: list = [None]

    def progress(pct: int, note: str = "") -> None:
        if cancel.is_set():
            raise Cancelled()
        current = (max(0, min(100, int(pct))), note)
        if current == last[0]:
            return
        last[0] = current
        emit({"id": job_id, "type": "progress", "pct": current[0], "note": current[1]})

    return progress


def resolve(op: str):
    target = DISPATCH.get(op)
    if target is None:
        raise OpError("BAD_PARAMS", f"Unknown operation '{op}'")
    module_name, func_name = target.split(":")
    try:
        module = import_module(module_name)
    except ImportError as exc:
        raise OpError("INTERNAL", f"Operation '{op}' is not implemented yet ({exc})") from exc
    return getattr(module, func_name)


def run_job(job_id: str, op: str, params: dict) -> None:
    cancel = threading.Event()
    with _cancels_lock:
        _cancels[job_id] = cancel
    try:
        func = resolve(op)
        data = func(params, make_progress(job_id, cancel))
        emit({"id": job_id, "type": "result", "data": data})
    except OpError as exc:
        emit({"id": job_id, "type": "error", "code": exc.code, "message": exc.message})
    except Exception as exc:  # noqa: BLE001 - last resort envelope
        emit({
            "id": job_id,
            "type": "error",
            "code": "INTERNAL",
            "message": f"{type(exc).__name__}: {exc}",
            "detail": traceback.format_exc(),
        })
    finally:
        with _cancels_lock:
            _cancels.pop(job_id, None)


def handle_sys(job_id: str, op: str, params: dict) -> bool:
    """Handle the inline sys.* ops. Returns True if it consumed the request."""
    if op == "sys.ping":
        emit({"id": job_id, "type": "result", "data": {
            "pong": True, "version": VERSION, "python": platform.python_version(),
        }})
        return True
    if op == "sys.cancel":
        target = params.get("target")
        with _cancels_lock:
            event = _cancels.get(target)
        if event is not None:
            event.set()
        emit({"id": job_id, "type": "result", "data": {"cancelled": event is not None}})
        return True
    return False


def main() -> int:
    log(f"iloathepdf sidecar {VERSION} on python {platform.python_version()} ready")
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            request = json.loads(raw)
            job_id = str(request["id"])
            op = str(request["op"])
            params = request.get("params") or {}
        except (ValueError, KeyError, TypeError) as exc:
            emit({"id": "?", "type": "error", "code": "BAD_PARAMS",
                  "message": f"Malformed request: {exc}"})
            continue

        if handle_sys(job_id, op, params):
            continue

        threading.Thread(target=run_job, args=(job_id, op, params), daemon=True).start()

    log("stdin closed, exiting")
    return 0


if __name__ == "__main__":
    sys.exit(main())
