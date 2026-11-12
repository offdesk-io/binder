"""Reading Bench's board. Binder only ever GETs `todo.md` and never writes it.

The board's format lives in Bench's core/todo.js and core/todo.py, so this
module loads todo.py from a Bench checkout (BINDER_BENCH_CORE) rather than
keeping a third copy. A task links to an organisation with `[lead:: <slug>]`.
"""

import hashlib
import importlib.util
import os
import re
import sys
import urllib.error
import urllib.request
from types import ModuleType
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from .repo.orgs import slugify

TIMEOUT_S = 10
# A tag Bench does not know is kept in `extra` as written: `[lead:: x]` or `` `lead:x` ``, any case.
_LEAD_FIELD_RE = re.compile(r"^\[lead::\s*([^\]]*)\]$", re.I)
_LEAD_CODE_RE = re.compile(r"^`lead:([^`]*)`$", re.I)
_TODO_CACHE: Dict[str, ModuleType] = {}


class BenchError(Exception):
    """Bench could not be read. The message is shown in the Work section."""


def load_todo(core_dir: str) -> ModuleType:
    """Bench's core/todo.py, loaded by path. Cached by the resolved path, so two checkouts never share one."""
    path = os.path.realpath(os.path.join(core_dir, "todo.py"))
    cached = _TODO_CACHE.get(path)
    if cached is not None:
        return cached
    name = "bench_core_todo_" + hashlib.sha1(path.encode("utf-8")).hexdigest()[:12]
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise BenchError("No todo.py in %s" % core_dir)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(name, None)  # a failed load must not leave a half-made module behind
        raise
    _TODO_CACHE[path] = module
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


def _build_opener() -> urllib.request.OpenerDirector:
    # No proxy either: a proxy from the environment would see the token in clear.
    return urllib.request.build_opener(_NoRedirect, urllib.request.ProxyHandler({}))


_OPENER = _build_opener()


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
                if served is None:
                    raise BenchError("Bench did not say which board it served.")
                if served != self.board:
                    raise BenchError("Bench served the %s board, not %s." % (served, self.board))
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise BenchError("Bench answered %d." % e.code)
        except (urllib.error.URLError, OSError) as e:
            raise BenchError("Could not reach Bench: %s" % getattr(e, "reason", e))


def lead_of(task: Any) -> str:
    """The task's lead slug: its `lead` field once Bench knows the tag, until then the `[lead:: x]` or
    `` `lead:x` `` kept in `extra`. The value is slugified the way organisations are, or "" when blank."""
    value = getattr(task, "lead", "") or ""
    if not value.strip():
        for raw in getattr(task, "extra", []) or []:
            text = raw.strip()
            m = _LEAD_FIELD_RE.match(text) or _LEAD_CODE_RE.match(text)
            if m:
                value = m.group(1)
                break
    return slugify(value.strip()) if value.strip() else ""


def task_key(task: Any) -> str:
    """Bench's taskKey: the stable id, then the slug, then the title."""
    return task.stable_id or task.slug or task.title


def task_url(base_url: str, board: str, key: str) -> str:
    """Bench's link to a task, with the key encoded as its encodeTaskKey does."""
    return "%s/#!board=%s!task=%s" % (base_url.rstrip("/"), board, quote(key, safe="-_.~*'()"))


def _date(todo: ModuleType, value: str) -> Optional[str]:
    """The value as YYYY-MM-DD when it is a real date, else None."""
    d = todo.parse_date(value or "")
    return d.isoformat() if d else None


def _cancelled(task: Any) -> bool:
    """A ticked task that was cancelled or archived: Bench's counts_as_finished says it is not finished."""
    return bool(task.done and (task.cancelled or task.archived))


def _finished_on(todo: ModuleType, task: Any) -> Optional[str]:
    """The day a task was finished, or None when it was not finished work (Bench's counts_as_finished)."""
    if _cancelled(task) or not todo.counts_as_finished(task):
        return None
    return _date(todo, task.done_on)


def _day(todo: ModuleType, task: Any, finished_on: Optional[str]) -> Optional[str]:
    """The day the cache shows: the finish day, or for a cancelled task the day it was decided against."""
    if _cancelled(task):
        return _date(todo, task.cancelled) or _date(todo, task.archived) or _date(todo, task.done_on)
    return finished_on


def _state(task: Any, finished: bool) -> str:
    if _cancelled(task):
        return "Cancelled"
    return "Done" if finished else task.column  # an unticked task in the Done column is just open


def linked_tasks(todo: ModuleType, text: str) -> List[Dict[str, Any]]:
    """Every top-level task with a lead tag, in board order. `done` is true only for finished work;
    a cancelled task has `cancelled` set and `done` false."""
    out = []
    for t in todo.parse_doc(text):
        slug = lead_of(t)
        if not slug:
            continue
        finished_on = _finished_on(todo, t)
        finished = finished_on is not None
        out.append({"slug": slug, "task_key": task_key(t), "title": t.title, "bucket": t.bucket,
                    "state": _state(t, finished), "done": finished, "cancelled": _cancelled(t),
                    "done_on": _day(todo, t, finished_on), "due": _date(todo, t.due),
                    "assignee": t.to or None})
    return out


def bucket_tasks(todo: ModuleType, text: str, bucket: str) -> List[Dict[str, Any]]:
    """Every top-level task in one bucket, with its notes and sub-steps, for the import. `done` is the tick."""
    out = []
    for t in todo.parse_doc(text):
        if t.bucket != bucket:
            continue
        notes, steps = todo.split_body(t)
        finished = _finished_on(todo, t) is not None
        out.append({"task_key": task_key(t), "title": t.title, "state": _state(t, finished), "done": bool(t.done),
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
