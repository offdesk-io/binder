"""Reading Bench's board. Binder only ever GETs `todo.md` and never writes it.

The board's format lives in Bench's core/todo.js and core/todo.py, so this
module loads todo.py from a Bench checkout (BINDER_BENCH_CORE) rather than
keeping a third copy. A task links to an organisation with `[lead:: <slug>]`.
"""

import importlib.util
import re
import sys
import urllib.error
import urllib.request
from types import ModuleType
from typing import Any, Dict, List, Optional
from urllib.parse import quote

TIMEOUT_S = 10
_LEAD_RE = re.compile(r"^\[lead::\s*([^\]]*)\]$")


class BenchError(Exception):
    """Bench could not be read. The message is shown in the Work section."""


def load_todo(core_dir: str) -> ModuleType:
    """Bench's core/todo.py, loaded by path under its own module name."""
    name = "bench_core_todo"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, core_dir.rstrip("/") + "/todo.py")
    if spec is None or spec.loader is None:
        raise BenchError("No todo.py in %s" % core_dir)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FileSource:
    """A todo.md on disk: local development and tests only."""

    def __init__(self, path: str):
        self.path = path

    def fetch(self) -> str:
        try:
            with open(self.path, encoding="utf-8") as f:
                return f.read()
        except OSError as e:
            raise BenchError("Could not read %s: %s" % (self.path, e.strerror))


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect would resend the token to wherever it points, so refuse it."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        raise urllib.error.HTTPError(req.full_url, code, "redirect refused", headers, fp)


_OPENER = urllib.request.build_opener(_NoRedirect)


def _open(req: urllib.request.Request, timeout: float) -> Any:
    return _OPENER.open(req, timeout=timeout)


class HttpSource:
    """The board over HTTP with Binder's token, the way the PA's pa_save reads it."""

    def __init__(self, base_url: str, token: str, board: str):
        self.base_url, self.token, self.board = base_url.rstrip("/"), token, board

    def fetch(self) -> str:
        req = urllib.request.Request(self.base_url + "/data/todo.md", method="GET", headers={
            "Authorization": "Bearer " + self.token, "X-Offdesk-Board": self.board})
        try:
            with _open(req, timeout=TIMEOUT_S) as resp:
                served = resp.headers.get("X-Bench-Board")
                if served != self.board:
                    raise BenchError("Bench served the %s board, not %s." % (served or "wrong", self.board))
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise BenchError("Bench answered %d." % e.code)
        except (urllib.error.URLError, OSError) as e:
            raise BenchError("Could not reach Bench: %s" % getattr(e, "reason", e))


def lead_of(task: Any) -> str:
    """The task's `[lead:: slug]`: a field once Bench knows the tag, until then in `extra`."""
    value = getattr(task, "lead", "") or ""
    if not value:
        for raw in getattr(task, "extra", []) or []:
            m = _LEAD_RE.match(raw.strip())
            if m:
                value = m.group(1)
                break
    return value.strip().lower()


def task_key(task: Any) -> str:
    """Bench's taskKey: the stable id, then the slug, then the title."""
    return task.stable_id or task.slug or task.title


def task_url(base_url: str, board: str, key: str) -> str:
    """Bench's link to a task, with the key encoded as its encodeTaskKey does."""
    return "%s/#!board=%s!task=%s" % (base_url.rstrip("/"), board, quote(key, safe="-_.~*'()"))


def _state(task: Any) -> str:
    return "Done" if task.done else task.column


def linked_tasks(todo: ModuleType, text: str) -> List[Dict[str, Any]]:
    """Every top-level task with a lead tag, open and done, in board order."""
    out = []
    for t in todo.parse_doc(text):
        slug = lead_of(t)
        if not slug:
            continue
        out.append({"slug": slug, "task_key": task_key(t), "title": t.title, "bucket": t.bucket,
                    "state": _state(t), "done": bool(t.done), "done_on": t.done_on or None,
                    "due": t.due or None, "assignee": t.to or None})
    return out


def bucket_tasks(todo: ModuleType, text: str, bucket: str) -> List[Dict[str, Any]]:
    """Every top-level task in one bucket, with its notes and sub-steps, for the import."""
    out = []
    for t in todo.parse_doc(text):
        if t.bucket != bucket:
            continue
        notes, steps = todo.split_body(t)
        out.append({"task_key": task_key(t), "title": t.title, "state": _state(t), "done": bool(t.done),
                    "assignee": t.to or None, "lead": lead_of(t),
                    "notes": [n.strip().lstrip("- ").strip() for n in notes if n.strip()],
                    "steps": [{"title": s["task"].title, "done": bool(s["done"])} for s in steps]})
    return out


def from_settings(settings: Any) -> Optional[Dict[str, Any]]:
    """The board reader for these settings, or None when Bench is off."""
    if settings.bench_file:
        source: Any = FileSource(settings.bench_file)
    elif settings.bench_token:
        source = HttpSource(settings.bench_url, settings.bench_token, settings.bench_board)
    else:
        return None
    return {"source": source, "todo": load_todo(settings.bench_core),
            "board": settings.bench_board, "url": settings.bench_url}
