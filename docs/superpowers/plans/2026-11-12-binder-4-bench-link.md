# Binder 4: Bench link and import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link Bench tasks to Binder organisations with `[lead:: <slug>]`, show each organisation's Bench work in Binder, and import the `work` board's **Leads** bucket into Binder once.

**Architecture:** Binder reads the `work` board server to server over HTTP with its own sign-in token, the same way the PA does (`Authorization: Bearer`, `X-Offdesk-Board: work`, `GET /data/todo.md`). It parses the markdown with Bench's own `core/todo.py`, loaded by path from a Bench checkout, and caches each linked task in a `bench_links` table. A background thread refreshes the cache every 10 minutes, and opening an organisation refreshes it when it is more than a minute old. The organisation page gains a Work section, and finished tasks join its timeline. `scripts/import_from_bench.py` turns the Leads bucket into organisations through a plan file the owner edits, and writes `import-links.json` for the PA to tag the tasks. Binder never writes `todo.md`. On the Bench side, a separate branch and PR in the Bench repo add the `[lead::]` tag, a card chip that opens Binder, and a Lead field in the drawer.

**Tech Stack:** Binder as before (Python 3.9, FastAPI, SQLite, React, TypeScript, Tenon). HTTP with `urllib.request` from the standard library, so no new dependency. Bench: `core/todo.js` and `core/todo.py`, its fixtures and parity tests, and its board JS and React in `kanban/`.

**Branches:** Binder `feature/bench-link`, from `main`, merged through a PR. Bench `feature/lead-tag`, from Bench's `main`, **opened as a PR for the owner to review and never merged by the implementer**.

---

## Decisions taken for this plan

- **The board** is `work` and the bucket is `Leads` (the owner confirmed both). `BINDER_BENCH_BOARD` defaults to `work`.
- **Reading Bench** goes over HTTP with a token, as the PA does, because the owner chose it. `BINDER_BENCH_TOKEN` holds the token, and Binder sends it to `BINDER_BENCH_URL` (default `https://bench.offdesk.io`) with `X-Offdesk-Board: work`. Binder checks that the answer's `X-Bench-Board` header names the same board. A pinned token can read only `GET /data/todo.md` (and `/whoami`), so Binder has no task creation dates. Plan 5 issues the token and adds Binder's identity to the `work` board's `access.json` on the server.
- **Parsing** uses Bench's `core/todo.py`, loaded by path from `BINDER_BENCH_CORE` (the `core` folder of a Bench checkout), so the format still lives in Bench's two files only. A task links to an organisation through its `lead` field. Until the Bench PR is merged, `todo.py` keeps an unknown `[lead:: x]` in `task.extra`, so Binder reads both forms.
- **A task's key** is Bench's `taskKey`: the stable id (`` `id:ab12cd` ``), then the slug, then the title. Its link is `https://bench.offdesk.io/#!board=work!task=<key>`, with the key encoded the way Bench's `encodeTaskKey` does (`encodeURIComponent`, then `!` as `%21`).
- **Local development and tests** can read a file instead: with `BINDER_BENCH_FILE` set, Binder reads that `todo.md` from disk and needs no token. Header mode refuses `BINDER_BENCH_FILE`, so the server always reads Bench over HTTP.
- **Bench is off** when neither a token nor a file is set. `GET /api/meta` then says `bench: false` and the page hides the Work section. Setting a token or a file without `BINDER_BENCH_CORE` refuses to start.
- **The cache** is `bench_links` (`org_id`, `board`, `task_key`, `title`, `state`, `done`, `done_on`, `due`, `assignee`, `fetched_at`), replaced in full on each refresh in one `BEGIN IMMEDIATE`. `bench_sync` has one row per board with `fetched_at` and the last error. A slug that matches no organisation is skipped and counted in the log. A failed refresh keeps the old cache and records the error, which the Work section shows.
- **Refreshing.** One daemon thread refreshes every 10 minutes. `GET /api/orgs/{id}/work` returns the cache at once and, when `fetched_at` is more than 60 seconds old, starts one refresh in the background (never two at a time). The page reloads the Work section once, a few seconds later.
- **The timeline** gains finished Bench tasks (kind `bench`, `at` = the done date at midnight UTC). Open tasks show only in the Work section.
- **The import** has two steps. `plan` writes `import-plan.csv`, one row per Leads task (task key, title, proposed name, slug, status, owner, note), and prints the table. The owner edits the CSV: giving two rows the same slug merges them into one organisation, and clearing a slug skips that task. `apply import-plan.csv --by <email>` creates the organisations, adds one `note` interaction per task with its notes and sub-steps, and writes `import-links.json` (`{"board": "work", "links": {task_key: slug}}`). A slug that already exists in Binder gets the notes but is not created again, so a second `apply` adds nothing twice (each note says which task it came from, and it is skipped when one already exists). The interaction's date is the import time, since a pinned read has no creation dates. The status guess from the column: Backlog and To do → `lead`, Doing → `in_conversation`, Reviewing → `proposal_sent`, a ticked task → `parked`. The owner corrects these in the CSV. The owner comes from `[to::]` when it is an email.
- **Tagging the tasks** is the PA's job, from `import-links.json`, through `pa_save`. Binder never writes `todo.md`. The README tells the owner what to ask the PA, and no change to the PA skill is needed.
- **The Bench PR** adds the `[lead:: <slug>]` tag to `core/todo.js` and `core/todo.py` (fixtures and parity tests), a neutral pill chip on the card that opens `https://binder.offdesk.io/o/<slug>`, and a plain "Lead" text field in the drawer. The search picker waits for plan 5, when the sign-in cookie's scope and nginx are checked on the server. Bench's CONVENTIONS.md allows a new tag only when a view needs it: the card chip is that view.

## File map

Binder backend:
- Modify `binder/config.py`: `bench_url`, `bench_token`, `bench_board`, `bench_core`, `bench_file`.
- Create `binder/bench.py`: loading `todo.py`, `HttpSource`, `FileSource`, `BenchError`, `lead_of`, `task_key`, `task_url`, `linked_tasks`, `bucket_tasks`, `from_settings`.
- Create `binder/migrations/005_bench_links.sql`.
- Create `binder/repo/bench_links.py`: `replace`, `record_error`, `sync_state`, `list_for_org`.
- Modify `binder/jobs.py` (`refresh_bench`, `Refresher`), `binder/app.py`, `binder/api/misc.py` (`bench` in meta), `binder/api/orgs.py` (`GET /api/orgs/{id}/work`), `binder/repo/timeline.py`.
- Create `scripts/import_from_bench.py`.
- Tests: `tests/bench_todo.md` (fixture), `tests/conftest.py`, `tests/test_config.py`, `tests/test_bench.py`, `tests/test_bench_links.py`, `tests/test_work.py`, `tests/test_import.py`, `tests/test_shapes.py`.

Binder frontend:
- Modify `web/src/api/types.ts`, `web/src/api/endpoints.ts`, `web/src/pages/OrgPage.tsx`, `web/src/pages/org/TimelineSection.tsx`, `web/src/test/render.tsx` (`bench` in the test session), `web/src/test/fixtures.ts`.
- Create `web/src/pages/org/WorkSection.tsx` and its test.

Docs: `README.md`, `CLAUDE.md`.

Bench (its own repo and branch): `core/todo.js`, `core/todo.py`, `core/fixtures/generate-parse.mjs`, `core/fixtures/parse.json`, `core/test_todo.py`, `kanban/js/09-columns.js`, `kanban/ui/TaskCard.tsx`, `kanban/js/19-drawer.js`, `kanban/ui/DrawerPanel.tsx`, `kanban/js/23-conflict-modal.js`, `kanban/test_board.mjs`, plus Bench's docs where it lists tags.

## Rules that apply to every task

- Python is 3.9: `Optional`/`List`/`Dict`, never `X | Y`.
- **Binder never writes Bench's `todo.md`, and never sends to Bench anything but a GET.** Tests never reach the network: they use `FileSource` or a stub.
- Tests that need Bench's parser load it from `BINDER_TEST_BENCH_CORE`, or else from `../bench/core` beside the Binder checkout, and are skipped with a clear reason when neither exists.
- Run `.venv/bin/pytest -q` and, from `web/`, `npm run check && npm test` before every commit. All must pass.
- Commit messages are plain, with no attribution lines and no mention of AI tools.
- Tests use `@example.com` addresses and made-up companies. **Never open, quote or copy anything from Bench's `data/` folder**: the fixture board is written from scratch.
- Bench work follows Bench's own `CLAUDE.md` and `CONVENTIONS.md`, happens only on Bench's `feature/lead-tag` branch, and ends with a PR. The implementer never merges it, never pushes to Bench's `main`, and never runs anything against Bench's live server on port 8765.
- The test counts are what the plan's own tests add. Report the real numbers.

---
### Task 1: The Bench settings

**Files:**
- Modify: `binder/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_config.py`:

```python
def test_bench_is_off_by_default():
    s = load_settings({})
    assert (s.bench_token, s.bench_file, s.bench_core) == ("", "", "")
    assert s.bench_board == "work"
    assert s.bench_url == "https://bench.offdesk.io"


def test_bench_token_needs_the_bench_core(tmp_path):
    with pytest.raises(ConfigError, match="BINDER_BENCH_CORE"):
        load_settings({"BINDER_BENCH_TOKEN": "t0ken"})


def test_bench_core_must_hold_todo_py(tmp_path):
    with pytest.raises(ConfigError, match="todo.py"):
        load_settings({"BINDER_BENCH_TOKEN": "t0ken", "BINDER_BENCH_CORE": str(tmp_path)})


def test_bench_over_http(tmp_path):
    (tmp_path / "todo.py").write_text("")
    s = load_settings({"BINDER_BENCH_TOKEN": "t0ken", "BINDER_BENCH_CORE": str(tmp_path),
                       "BINDER_BENCH_BOARD": "other", "BINDER_BENCH_URL": "https://bench.example.com/"})
    assert (s.bench_token, s.bench_board, s.bench_url) == ("t0ken", "other", "https://bench.example.com")
    assert "t0ken" not in repr(s)  # the token never reaches a log line


def test_bench_url_must_be_https_unless_loopback(tmp_path):
    (tmp_path / "todo.py").write_text("")
    base = {"BINDER_BENCH_TOKEN": "t", "BINDER_BENCH_CORE": str(tmp_path)}
    with pytest.raises(ConfigError, match="https"):
        load_settings(dict(base, BINDER_BENCH_URL="http://bench.example.com"))
    assert load_settings(dict(base, BINDER_BENCH_URL="http://127.0.0.1:8765")).bench_url == "http://127.0.0.1:8765"


def test_bench_file_is_for_local_development_only(tmp_path):
    (tmp_path / "todo.py").write_text("")
    s = load_settings({"BINDER_BENCH_FILE": "board.md", "BINDER_BENCH_CORE": str(tmp_path)})
    assert s.bench_file == "board.md"
    with pytest.raises(ConfigError, match="BINDER_BENCH_FILE"):
        load_settings({"BINDER_AUTH": "header", "BINDER_DB": "/x/b.db", "BINDER_BENCH_FILE": "board.md",
                       "BINDER_BENCH_CORE": str(tmp_path)})
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_config.py -q`
Expected: the six new tests FAIL with `AttributeError: 'Settings' object has no attribute 'bench_token'` (or similar).

- [ ] **Step 3: Implement**

In `binder/config.py`:

1. Change `from dataclasses import dataclass` to `from dataclasses import dataclass, field` (read the import line first and keep whatever else it imports).
2. Add to the module docstring, after the `BINDER_AI` sentence:

```
BINDER_BENCH_TOKEN is Binder's sign-in token for reading the Bench board
named by BINDER_BENCH_BOARD (default work) at BINDER_BENCH_URL (default
https://bench.offdesk.io). BINDER_BENCH_FILE reads a todo.md from disk
instead, for local development and tests only. Either one needs
BINDER_BENCH_CORE, the core folder of a Bench checkout, whose todo.py
parses the board. With neither, Bench is off.
```

3. Add these fields to the end of `Settings`:

```python
    bench_url: str = "https://bench.offdesk.io"
    bench_token: str = field(default="", repr=False)  # a secret: kept out of repr and logs
    bench_board: str = "work"
    bench_core: str = ""  # the core/ folder of a Bench checkout, for todo.py
    bench_file: str = ""  # a todo.md to read instead of Bench, for local development
```

4. In `load_settings`, before the `return`, add:

```python
    bench_token = env.get("BINDER_BENCH_TOKEN", "")
    bench_file = env.get("BINDER_BENCH_FILE", "")
    bench_core = env.get("BINDER_BENCH_CORE", "")
    bench_url = env.get("BINDER_BENCH_URL", "https://bench.offdesk.io").rstrip("/")
    if bench_file and auth == "header":
        raise ConfigError("BINDER_BENCH_FILE is for local development and tests, not the server.")
    if bench_token or bench_file:
        if not bench_core:
            raise ConfigError("Reading Bench needs BINDER_BENCH_CORE, the core folder of a Bench checkout.")
        if not os.path.isfile(os.path.join(bench_core, "todo.py")):
            raise ConfigError("BINDER_BENCH_CORE=%r has no todo.py." % bench_core)
    if bench_token:
        loopback = bench_url.startswith(("http://127.0.0.1", "http://[::1]"))
        if not (bench_url.startswith("https://") or loopback):
            raise ConfigError("BINDER_BENCH_URL must be https (or loopback), so the token is never sent in clear.")
```

and pass `bench_url=bench_url, bench_token=bench_token, bench_board=env.get("BINDER_BENCH_BOARD", "work"), bench_core=bench_core, bench_file=bench_file` to `Settings(...)`.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest -q`
Expected: all pass (177 + 6 = 183 passed, 2 deselected).

- [ ] **Step 5: Commit**

```bash
git add binder/config.py tests/test_config.py
git commit -m "Bench settings: token, board, url, core and a local file"
```

---

### Task 2: Reading the board

**Files:**
- Create: `binder/bench.py`, `tests/bench_todo.md`, `tests/test_bench.py`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Write the fixture board**

Create `tests/bench_todo.md`. It is made up from scratch in Bench's format (buckets are `## N. Name`, columns are `### Heading`, Done first). Never copy from Bench's `data/`.

```markdown
# Work

## 1. Leads

### Done

- [x] **Old lead that went quiet** `done:2026-10-02` `id:aa0001`
  - Spoke once at a fair.

### Doing

- [ ] **Acme Studio follow-up** [to:: ana@example.com] [lead:: acme-studio] `id:aa0002`
  - Wants a quote for the archive tool.
  - [ ] Send the quote [due:: 2026-11-20] `id:aa0003`

### To do

- [ ] **Northwind Trading** [to:: Ben] `id:aa0004`
- [ ] **Acme Studio second site** [lead:: acme-studio] `#acme-site`

## 2. Delivery

### Done

- [x] **Acme Studio kickoff deck** [lead:: acme-studio] `done:2026-11-01` `id:bb0001`

### To do

- [ ] **Unrelated internal task** `id:bb0002`
- [ ] **Ghost lead task** [lead:: no-such-org] `id:bb0003`
```

- [ ] **Step 2: Add the parser fixture to conftest**

Append to `tests/conftest.py`:

```python
import os
import pathlib

FIXTURE_BOARD = pathlib.Path(__file__).parent / "bench_todo.md"


def bench_core_dir() -> str:
    """Bench's core/ folder: BINDER_TEST_BENCH_CORE, else ../bench/core beside this checkout."""
    explicit = os.environ.get("BINDER_TEST_BENCH_CORE")
    if explicit:
        return explicit
    return str(pathlib.Path(__file__).resolve().parents[2] / "bench" / "core")


@pytest.fixture
def bench_core():
    path = bench_core_dir()
    if not os.path.isfile(os.path.join(path, "todo.py")):
        pytest.skip("needs a Bench checkout: set BINDER_TEST_BENCH_CORE to its core/ folder")
    return path
```

(Move the new imports to the top of the file with the others.)

- [ ] **Step 3: Write the failing tests**

Create `tests/test_bench.py`:

```python
import io
import urllib.error

import pytest

from binder import bench
from tests.conftest import FIXTURE_BOARD


def test_task_url_encodes_the_key_like_bench():
    assert bench.task_url("https://bench.offdesk.io", "work", "aa0002") == \
        "https://bench.offdesk.io/#!board=work!task=aa0002"
    assert bench.task_url("https://bench.offdesk.io", "work", "Call Ana! Now") == \
        "https://bench.offdesk.io/#!board=work!task=Call%20Ana%21%20Now"


def test_linked_tasks_finds_every_lead_tag(bench_core):
    todo = bench.load_todo(bench_core)
    links = bench.linked_tasks(todo, FIXTURE_BOARD.read_text())
    by_key = {l["task_key"]: l for l in links}
    assert set(by_key) == {"aa0002", "acme-site", "bb0001", "bb0003"}
    assert by_key["aa0002"] == {
        "slug": "acme-studio", "task_key": "aa0002", "title": "Acme Studio follow-up", "bucket": "Leads",
        "state": "Doing", "done": False, "done_on": None, "due": None, "assignee": "ana@example.com"}
    assert by_key["bb0001"]["done"] is True and by_key["bb0001"]["done_on"] == "2026-11-01"
    assert by_key["bb0001"]["state"] == "Done"
    assert by_key["bb0003"]["slug"] == "no-such-org"


def test_bucket_tasks_lists_the_leads_with_notes_and_steps(bench_core):
    todo = bench.load_todo(bench_core)
    tasks = bench.bucket_tasks(todo, FIXTURE_BOARD.read_text(), "Leads")
    assert [t["task_key"] for t in tasks] == ["aa0001", "aa0002", "aa0004", "acme-site"]
    follow = tasks[1]
    assert follow["notes"] == ["Wants a quote for the archive tool."]
    assert follow["steps"] == [{"title": "Send the quote", "done": False}]
    assert follow["lead"] == "acme-studio"
    assert tasks[0]["done"] is True and tasks[0]["state"] == "Done"


def test_file_source_reads_the_file():
    assert "Leads" in bench.FileSource(str(FIXTURE_BOARD)).fetch()


class _Resp(io.BytesIO):
    def __init__(self, body, board):
        super().__init__(body.encode())
        self.headers = {"X-Bench-Board": board}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_http_source_sends_the_token_and_checks_the_board(monkeypatch):
    seen = {}

    def fake_open(req, timeout):
        seen["url"], seen["headers"], seen["method"] = req.full_url, dict(req.header_items()), req.get_method()
        return _Resp("## 1. Leads\n", "work")

    monkeypatch.setattr(bench.urllib.request, "urlopen", fake_open)
    text = bench.HttpSource("https://bench.example.com", "t0ken", "work").fetch()
    assert text == "## 1. Leads\n"
    assert seen["method"] == "GET"
    assert seen["url"] == "https://bench.example.com/data/todo.md"
    assert seen["headers"]["Authorization"] == "Bearer t0ken"
    assert seen["headers"]["X-offdesk-board"] == "work"


def test_http_source_refuses_another_board(monkeypatch):
    monkeypatch.setattr(bench.urllib.request, "urlopen", lambda req, timeout: _Resp("x", "personal"))
    with pytest.raises(bench.BenchError, match="personal"):
        bench.HttpSource("https://bench.example.com", "t", "work").fetch()


def test_http_errors_become_bench_errors(monkeypatch):
    def boom(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr(bench.urllib.request, "urlopen", boom)
    with pytest.raises(bench.BenchError, match="401"):
        bench.HttpSource("https://bench.example.com", "t", "work").fetch()
```

- [ ] **Step 4: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_bench.py -q`
Expected: FAIL with `ImportError: cannot import name 'bench' from 'binder'`.

- [ ] **Step 5: Implement `binder/bench.py`**

```python
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


class HttpSource:
    """The board over HTTP with Binder's token, the way the PA's pa_save reads it."""

    def __init__(self, base_url: str, token: str, board: str):
        self.base_url, self.token, self.board = base_url.rstrip("/"), token, board

    def fetch(self) -> str:
        req = urllib.request.Request(self.base_url + "/data/todo.md", method="GET", headers={
            "Authorization": "Bearer " + self.token, "X-Offdesk-Board": self.board})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
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
```

Check the details against Bench's real `core/todo.py` before relying on them (read it, do not change it):
- `parse_doc(text)` returns `Task` objects with `.bucket` (no number) and `.column` (the renamed heading, Done when ticked).
- `split_body(task)` returns `(notes, steps)`, where each step is `{"task": Task, "done": bool, "notes": [...]}`. Check what `notes` holds (raw indented lines or stripped text) and adjust the cleaning line so that the test's expected `["Wants a quote for the archive tool."]` comes out.
- Sub-steps are in the parent's body, so `parse_doc` does not list them as top-level tasks. If it does, filter them out by indent and say so.
- If the expected values in the tests disagree with what `todo.py` really returns, fix the code (not the test) unless the test is wrong about Bench; report any test change.

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest -q`
Expected: all pass (183 + 7 = 190 passed, 2 deselected). Run once with `BINDER_TEST_BENCH_CORE=/nowhere .venv/bin/pytest tests/test_bench.py -q` and check that the three parser tests are skipped, not failed.

- [ ] **Step 7: Commit**

```bash
git add binder/bench.py tests/bench_todo.md tests/test_bench.py tests/conftest.py
git commit -m "Read Bench's board with its own parser, over HTTP or from a file"
```

---

### Task 3: The `bench_links` cache

**Files:**
- Create: `binder/migrations/005_bench_links.sql`, `binder/repo/bench_links.py`, `tests/test_bench_links.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_bench_links.py`:

```python
from binder.db import connect, migrate
from binder.repo import bench_links, orgs

LINK = {"slug": "acme-studio", "task_key": "aa0002", "title": "Acme Studio follow-up", "bucket": "Leads",
        "state": "Doing", "done": False, "done_on": None, "due": None, "assignee": "ana@example.com"}


def db(tmp_path):
    conn = connect(str(tmp_path / "t.db"))
    migrate(conn)
    return conn


def test_replace_caches_links_for_known_slugs_only(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    ghost = dict(LINK, slug="no-such-org", task_key="bb0003")
    assert bench_links.replace(conn, "work", [LINK, ghost]) == {"linked": 1, "unknown": 1}
    rows = bench_links.list_for_org(conn, acme["id"])
    assert [(r["task_key"], r["state"], r["done"]) for r in rows] == [("aa0002", "Doing", False)]
    state = bench_links.sync_state(conn, "work")
    assert state["error"] is None and state["fetched_at"]


def test_replace_drops_links_that_are_gone(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    bench_links.replace(conn, "work", [LINK])
    bench_links.replace(conn, "work", [])
    assert bench_links.list_for_org(conn, acme["id"]) == []


def test_an_error_keeps_the_cache(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    bench_links.replace(conn, "work", [LINK])
    before = bench_links.sync_state(conn, "work")["fetched_at"]
    bench_links.record_error(conn, "work", "Bench answered 401.")
    state = bench_links.sync_state(conn, "work")
    assert (state["fetched_at"], state["error"]) == (before, "Bench answered 401.")
    assert len(bench_links.list_for_org(conn, acme["id"])) == 1


def test_open_tasks_come_before_done_ones(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    done = dict(LINK, task_key="bb0001", title="Kickoff deck", state="Done", done=True, done_on="2026-11-01")
    bench_links.replace(conn, "work", [done, LINK])
    assert [r["task_key"] for r in bench_links.list_for_org(conn, acme["id"])] == ["aa0002", "bb0001"]


def test_deleting_the_org_drops_its_links(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    bench_links.replace(conn, "work", [LINK])
    orgs.delete(conn, acme["id"])
    assert conn.execute("SELECT count(*) FROM bench_links").fetchone()[0] == 0


def test_never_synced_has_no_state(tmp_path):
    assert bench_links.sync_state(db(tmp_path), "work") == {"fetched_at": None, "error": None}
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_bench_links.py -q`
Expected: FAIL with `ImportError: cannot import name 'bench_links'`.

- [ ] **Step 3: The migration**

Create `binder/migrations/005_bench_links.sql` (no `BEGIN`/`COMMIT`: the runner wraps it):

```sql
-- A cache of the Bench tasks that carry [lead:: <slug>]. Bench's todo.md is
-- the source of truth; each refresh replaces one board's rows in full.
CREATE TABLE bench_links (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  board TEXT NOT NULL,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_on TEXT,
  due TEXT,
  assignee TEXT,
  fetched_at TEXT NOT NULL,
  UNIQUE (board, task_key)
);
CREATE INDEX bench_links_org ON bench_links(org_id);

-- One row per board: when it was last read, and the last error (null when the last read worked).
CREATE TABLE bench_sync (
  board TEXT PRIMARY KEY,
  fetched_at TEXT,
  error TEXT
);
```

Read `binder/db.py` and an earlier migration first to match how timestamps and foreign keys are written there.

- [ ] **Step 4: The repo**

Create `binder/repo/bench_links.py`:

```python
"""The Bench task cache. A refresh replaces one board's rows in one write."""

import sqlite3
from typing import Any, Dict, List

from ..db import now


def _out(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    d["done"] = bool(d["done"])
    return d


def replace(conn: sqlite3.Connection, board: str, links: List[Dict[str, Any]]) -> Dict[str, int]:
    """Replaces the board's cache with `links`. Slugs that match no organisation are skipped."""
    at = now()
    linked = unknown = 0
    conn.execute("BEGIN IMMEDIATE")
    try:
        slugs = {r["slug"]: r["id"] for r in conn.execute("SELECT id, slug FROM organisations")}
        conn.execute("DELETE FROM bench_links WHERE board = ?", (board,))
        seen = set()
        for l in links:
            org_id = slugs.get(l["slug"])
            if org_id is None:
                unknown += 1
                continue
            if l["task_key"] in seen:  # two tasks with one key: keep the first, as Bench's lookup does
                continue
            seen.add(l["task_key"])
            conn.execute(
                "INSERT INTO bench_links(org_id, board, task_key, title, state, done, done_on, due, assignee, "
                "fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (org_id, board, l["task_key"], l["title"], l["state"], int(l["done"]), l["done_on"], l["due"],
                 l["assignee"], at))
            linked += 1
        conn.execute("INSERT INTO bench_sync(board, fetched_at, error) VALUES (?,?,NULL) "
                     "ON CONFLICT(board) DO UPDATE SET fetched_at = excluded.fetched_at, error = NULL", (board, at))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return {"linked": linked, "unknown": unknown}


def record_error(conn: sqlite3.Connection, board: str, error: str) -> None:
    """Keeps the cache and its fetched_at; only the error changes."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("INSERT INTO bench_sync(board, fetched_at, error) VALUES (?,NULL,?) "
                     "ON CONFLICT(board) DO UPDATE SET error = excluded.error", (board, error))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def sync_state(conn: sqlite3.Connection, board: str) -> Dict[str, Any]:
    r = conn.execute("SELECT fetched_at, error FROM bench_sync WHERE board = ?", (board,)).fetchone()
    return {"fetched_at": r["fetched_at"], "error": r["error"]} if r else {"fetched_at": None, "error": None}


def list_for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    """Open tasks first (in board order), then done ones, newest first."""
    rows = conn.execute(
        "SELECT task_key, board, title, state, done, done_on, due, assignee, fetched_at FROM bench_links "
        "WHERE org_id = ? ORDER BY done, CASE WHEN done THEN done_on END DESC, id", (org_id,))
    return [_out(r) for r in rows]
```

Check: `conn` uses `sqlite3.Row` (see `binder/db.py`), and SQLite here supports `ON CONFLICT ... DO UPDATE` (3.24+; the project runs 3.51).

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest -q`
Expected: all pass (190 + 6 = 196 passed, 2 deselected).

- [ ] **Step 6: Commit**

```bash
git add binder/migrations/005_bench_links.sql binder/repo/bench_links.py tests/test_bench_links.py
git commit -m "Bench task cache: bench_links and bench_sync"
```

---

### Task 4: Refreshing, the Work route and the timeline

**Files:**
- Modify: `binder/jobs.py`, `binder/app.py`, `binder/api/misc.py`, `binder/api/orgs.py`, `binder/repo/timeline.py`, `tests/conftest.py`, `tests/test_shapes.py`
- Create: `tests/test_work.py`

- [ ] **Step 1: Write the failing tests**

In `tests/conftest.py`, give `make_client` a `bench` argument (default `None`) passed to `create_app(..., bench=bench)`, the way `ai` is passed.

Create `tests/test_work.py`:

```python
from binder.bench import BenchError, FileSource, load_todo
from tests.conftest import FIXTURE_BOARD, WRITE, run_now


class Broken:
    def fetch(self):
        raise BenchError("Bench answered 401.")


def reader(bench_core, source=None):
    return {"source": source or FileSource(str(FIXTURE_BOARD)), "todo": load_todo(bench_core),
            "board": "work", "url": "https://bench.example.com"}


def make(make_client, bench, run_job=run_now):
    c = make_client(bench=bench, run_job=run_job)
    c.headers.update(WRITE)
    return c


def test_meta_says_whether_bench_is_on(make_client, bench_core):
    assert make(make_client, None).get("/api/meta").json()["bench"] is False
    assert make(make_client, reader(bench_core)).get("/api/meta").json()["bench"] is True


def test_work_lists_the_linked_tasks_with_links(make_client, bench_core):
    c = make(make_client, reader(bench_core))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    first = c.get("/api/orgs/%d/work" % org["id"]).json()  # the cache is empty, so this starts a refresh
    work = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert work["error"] is None and work["fetched_at"]
    assert [t["task_key"] for t in work["tasks"]] == ["aa0002", "acme-site", "bb0001"]
    assert work["tasks"][0]["url"] == "https://bench.example.com/#!board=work!task=aa0002"
    assert first["tasks"] == [] or first["tasks"] == work["tasks"]


def test_work_shows_the_last_error_and_keeps_the_cache(make_client, bench_core):
    good = reader(bench_core)
    c = make(make_client, good)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    good["source"] = Broken()
    c.app.state.bench_refresher.refresh()  # force a refresh now, as the timer would
    work = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert work["error"] == "Bench answered 401."
    assert len(work["tasks"]) == 3


def test_work_is_404_with_bench_off(make_client):
    c = make(make_client, None)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    r = c.get("/api/orgs/%d/work" % org["id"])
    assert r.status_code == 404


def test_finished_tasks_join_the_timeline(make_client, bench_core):
    c = make(make_client, reader(bench_core))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    items = c.get("/api/orgs/%d/timeline" % org["id"]).json()
    bench = [i for i in items if i["kind"] == "bench"]
    assert [(b["title"], b["at"]) for b in bench] == [("Acme Studio kickoff deck", "2026-11-01T00:00:00.000000+00:00")]
    assert bench[0]["url"].endswith("task=bb0001")


def test_a_fresh_cache_does_not_refresh_again(make_client, bench_core):
    calls = []
    c = make(make_client, reader(bench_core), run_job=lambda job: (calls.append(1), job()))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    c.get("/api/orgs/%d/work" % org["id"])
    assert len(calls) == 1
```

In `tests/test_shapes.py`, the meta shape gains `"bench": False`.

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_work.py tests/test_shapes.py -q`
Expected: FAIL (`create_app() got an unexpected keyword argument 'bench'`).

- [ ] **Step 3: Refreshing in `binder/jobs.py`**

Append:

```python
from . import bench as bench_module
from .repo import bench_links

REFRESH_EVERY_S = 600
STALE_AFTER_S = 60


class Refresher:
    """Refreshes the Bench cache: on a timer, and on demand when it is stale. Never two at once."""

    def __init__(self, db_path: str, reader: Dict[str, Any], run_job: Callable[[Callable[[], None]], None]):
        self.db_path, self.reader, self.run_job = db_path, reader, run_job
        self._lock = threading.Lock()

    def refresh(self) -> None:
        if not self._lock.acquire(blocking=False):
            return  # one is already running
        try:
            conn = connect(self.db_path)
            try:
                try:
                    text = self.reader["source"].fetch()
                    links = bench_module.linked_tasks(self.reader["todo"], text)
                except bench_module.BenchError as e:
                    bench_links.record_error(conn, self.reader["board"], str(e))
                    log.warning("bench refresh failed: %s", e)
                    return
                except Exception:
                    log.exception("bench refresh failed")
                    bench_links.record_error(conn, self.reader["board"], "Could not read the Bench board.")
                    return
                counts = bench_links.replace(conn, self.reader["board"], links)
                log.info("bench refresh: %(linked)d linked, %(unknown)d with an unknown slug", counts)
            finally:
                conn.close()
        finally:
            self._lock.release()

    def refresh_if_stale(self, fetched_at: Optional[str]) -> bool:
        """Starts a refresh in the background when the cache is older than a minute. True if it started one."""
        if fetched_at and _age_s(fetched_at) < STALE_AFTER_S:
            return False
        if self._lock.locked():
            return False
        self.run_job(self.refresh)
        return True

    def start_timer(self) -> None:
        def loop() -> None:
            while True:
                self.refresh()
                time.sleep(REFRESH_EVERY_S)
        threading.Thread(target=loop, name="bench-refresh", daemon=True).start()


def _age_s(iso: str) -> float:
    return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds()
```

Add the imports this needs at the top (`time`, `datetime`/`timezone`, `Dict`, `Optional`), keeping the existing ones. Check that `db.now()` produces an ISO string `datetime.fromisoformat` reads on Python 3.9 (it writes microseconds and `+00:00`).

- [ ] **Step 4: Wire it into `binder/app.py`**

Change the signature to `create_app(settings, ai=_FROM_SETTINGS, run_job=None, bench=_FROM_SETTINGS)` and document `bench` in the docstring next to `ai`. After `app.state.run_job = ...`:

```python
    app.state.bench = bench_module.from_settings(settings) if bench is _FROM_SETTINGS else bench
    app.state.bench_refresher = None
    if app.state.bench is not None:
        app.state.bench_refresher = jobs.Refresher(settings.db_path, app.state.bench, app.state.run_job)
        if bench is _FROM_SETTINGS:  # tests pass a reader and refresh on demand, with no timer
            app.state.bench_refresher.start_timer()
```

(`from . import bench as bench_module`.)

- [ ] **Step 5: `bench` in meta**

In `binder/api/misc.py` `meta()`, add `"bench": request.app.state.bench is not None,`.

- [ ] **Step 6: The Work route**

In `binder/api/orgs.py` add (read the file first to match its imports and the `get_db` pattern):

```python
@router.get("/{org_id}/work")
def work(org_id: int, request: Request, db: sqlite3.Connection = Depends(get_db)):
    reader = request.app.state.bench
    if reader is None:
        raise NotFound("Bench is not connected")
    orgs_repo.get(db, org_id)  # 404 for an unknown organisation
    state = bench_links.sync_state(db, reader["board"])
    request.app.state.bench_refresher.refresh_if_stale(state["fetched_at"])
    state = bench_links.sync_state(db, reader["board"])  # a refresh run in place (tests) shows at once
    tasks = [dict(t, url=bench.task_url(reader["url"], t["board"], t["task_key"]))
             for t in bench_links.list_for_org(db, org_id)]
    return {"tasks": tasks, "fetched_at": state["fetched_at"], "error": state["error"]}
```

Use the module names `orgs.py` already uses for the orgs repo and `NotFound` (from `binder/errors.py`).

- [ ] **Step 7: Finished tasks in the timeline**

In `binder/repo/timeline.py`, change `for_org` to take the reader's link builder, and update the docstring ("Bench tasks that are done join the same list"):

```python
def for_org(conn: sqlite3.Connection, org_id: int,
            task_url: Optional[Callable[[str, str], str]] = None) -> List[Dict[str, Any]]:
    ...existing interactions and status items...
    if task_url is not None:
        for t in bench_links.list_for_org(conn, org_id):
            if t["done"] and t["done_on"]:
                items.append({"kind": "bench", "id": t["task_key"], "title": t["title"],
                              "at": t["done_on"] + "T00:00:00.000000+00:00", "by_email": t["assignee"],
                              "url": task_url(t["board"], t["task_key"])})
    items.sort(key=lambda x: (x["at"], str(x["id"])), reverse=True)
    return items
```

The sort key becomes `str(x["id"])` because a Bench item's id is its task key. Then, in the timeline route (find it in `binder/api/orgs.py`), pass `task_url=(lambda board, key: bench.task_url(reader["url"], board, key)) if reader else None`, with `reader = request.app.state.bench`.

- [ ] **Step 8: Run the tests**

Run: `.venv/bin/pytest -q`
Expected: all pass (196 + 6 = 202 passed, 2 deselected).

- [ ] **Step 9: Commit**

```bash
git add binder tests
git commit -m "Work route, Bench refresh every 10 minutes and finished tasks in the timeline"
```

---
### Task 5: The one-off import

**Files:**
- Create: `scripts/import_from_bench.py`, `tests/test_import.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_import.py`:

```python
import csv
import json

import pytest

from binder.db import connect, migrate
from binder.repo import interactions, orgs
from scripts import import_from_bench as imp
from tests.conftest import FIXTURE_BOARD


def tasks(bench_core):
    from binder.bench import bucket_tasks, load_todo
    return bucket_tasks(load_todo(bench_core), FIXTURE_BOARD.read_text(), "Leads")


def test_plan_proposes_one_org_per_task(bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    by_key = {r["task_key"]: r for r in rows}
    assert by_key["aa0002"] == {"task_key": "aa0002", "title": "Acme Studio follow-up",
                                "name": "Acme Studio follow-up", "slug": "acme-studio", "status": "in_conversation",
                                "owner": "ana@example.com", "note": "Wants a quote for the archive tool.\n- [ ] Send the quote"}
    assert by_key["aa0001"]["status"] == "parked"  # ticked
    assert by_key["aa0004"]["status"] == "lead" and by_key["aa0004"]["owner"] == ""  # [to:: Ben] is not an email
    assert by_key["aa0004"]["slug"] == "northwind-trading"  # no lead tag: slug from the title


def test_plan_file_round_trips(tmp_path, bench_core):
    path = tmp_path / "import-plan.csv"
    imp.write_plan(str(path), imp.plan_rows(tasks(bench_core)))
    assert imp.read_plan(str(path)) == imp.plan_rows(tasks(bench_core))


def apply(tmp_path, rows):
    conn = connect(str(tmp_path / "t.db"))
    migrate(conn)
    links = imp.apply_rows(conn, rows, by="ana@example.com")
    return conn, links


def test_apply_creates_orgs_merges_same_slug_and_skips_blank(tmp_path, bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    for r in rows:
        if r["task_key"] == "acme-site":
            r["slug"] = "acme-studio"  # the owner merges the second Acme task into the first
        if r["task_key"] == "aa0001":
            r["slug"] = ""  # and skips the old one
    conn, links = apply(tmp_path, rows)
    assert links == {"aa0002": "acme-studio", "aa0004": "northwind-trading", "acme-site": "acme-studio"}
    acme = orgs.get_by_slug(conn, "acme-studio")
    assert (acme["name"], acme["status"], acme["owner_email"]) == ("Acme Studio follow-up", "in_conversation",
                                                                  "ana@example.com")
    notes = interactions.list_for_org(conn, acme["id"])
    assert len(notes) == 2 and all(n["type"] == "note" for n in notes)
    assert any("From the Bench task \"Acme Studio follow-up\" (aa0002)" in n["summary"] for n in notes)
    assert orgs.get_by_slug(conn, "northwind-trading")["owner_email"] == "ana@example.com"  # the importer


def test_apply_twice_adds_nothing_twice(tmp_path, bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    conn, _ = apply(tmp_path, rows)
    imp.apply_rows(conn, rows, by="ana@example.com")
    acme = orgs.get_by_slug(conn, "acme-studio")
    assert len(interactions.list_for_org(conn, acme["id"])) == 2
    assert conn.execute("SELECT count(*) FROM organisations").fetchone()[0] == 3


def test_apply_refuses_an_unknown_status(tmp_path, bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    rows[0]["status"] = "maybe"
    with pytest.raises(imp.PlanError, match="maybe"):
        apply(tmp_path, rows)


def test_links_file(tmp_path):
    path = tmp_path / "import-links.json"
    imp.write_links(str(path), "work", {"aa0002": "acme-studio"})
    assert json.loads(path.read_text()) == {"board": "work", "links": {"aa0002": "acme-studio"}}
```

Add an empty `scripts/__init__.py` if `scripts` is not yet a package (check first), so the tests can import it.

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_import.py -q`
Expected: FAIL with `ModuleNotFoundError` for `scripts.import_from_bench`.

- [ ] **Step 3: Implement `scripts/import_from_bench.py`**

```python
"""One-off import of the Bench board's Leads bucket into Binder.

    python -m scripts.import_from_bench plan [--out import-plan.csv]
    python -m scripts.import_from_bench apply import-plan.csv --by you@example.com [--links import-links.json]

`plan` reads the board (BINDER_BENCH_TOKEN or BINDER_BENCH_FILE, with
BINDER_BENCH_CORE) and writes one row per Leads task for you to edit: give two
rows the same slug to merge them, clear a slug to skip a task, and correct the
status, name and owner. `apply` writes into BINDER_DB and creates
import-links.json (task key -> slug). Binder never writes todo.md: ask the PA
to add [lead:: <slug>] to each task in that file, through pa_save.
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
from typing import Any, Dict, List

from binder import bench, statuses
from binder.config import load_settings
from binder.db import connect, migrate
from binder.repo import interactions, orgs

BUCKET = "Leads"
COLUMNS = ["task_key", "title", "name", "slug", "status", "owner", "note"]
STATUS_BY_STATE = {"Backlog": "lead", "To do": "lead", "Doing": "in_conversation", "Reviewing": "proposal_sent"}


class PlanError(Exception):
    pass


def _note(t: Dict[str, Any]) -> str:
    lines = list(t["notes"])
    lines += ["- [%s] %s" % ("x" if s["done"] else " ", s["title"]) for s in t["steps"]]
    return "\n".join(lines)


def plan_rows(tasks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    rows = []
    for t in tasks:
        status = "parked" if t["done"] else STATUS_BY_STATE.get(t["state"], "lead")
        owner = t["assignee"] if t["assignee"] and "@" in t["assignee"] else ""
        rows.append({"task_key": t["task_key"], "title": t["title"], "name": t["title"],
                     "slug": t["lead"] or orgs.slugify(t["title"]), "status": status, "owner": owner,
                     "note": _note(t)})
    return rows


def write_plan(path: str, rows: List[Dict[str, str]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)


def read_plan(path: str) -> List[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: (r.get(k) or "") for k in COLUMNS} for r in csv.DictReader(f)]


def _marker(row: Dict[str, str]) -> str:
    return 'From the Bench task "%s" (%s)' % (row["title"], row["task_key"])


def apply_rows(conn: sqlite3.Connection, rows: List[Dict[str, str]], by: str) -> Dict[str, str]:
    """Creates the organisations and their notes. Returns task key -> slug for the rows applied."""
    for r in rows:
        if r["slug"] and r["status"] not in statuses.LEAD_STATUSES:
            raise PlanError("Row %s: %r is not a lead status (%s)." % (r["task_key"], r["status"],
                                                                     ", ".join(statuses.LEAD_STATUSES)))
    links: Dict[str, str] = {}
    for r in rows:
        slug = orgs.slugify(r["slug"]) if r["slug"] else ""
        if not slug:
            continue
        try:
            org = orgs.get_by_slug(conn, slug)
        except Exception:  # NotFound: the first row with this slug creates it
            org = orgs.create(conn, {"name": r["name"] or r["title"], "slug": slug,
                                     "owner_email": r["owner"] or None}, by)
            if r["status"] != org["status"]:
                org = orgs.update(conn, org["id"], {"status": r["status"], "updated_at": org["updated_at"]}, by)
        marker = _marker(r)
        if not any(marker in i["summary"] for i in interactions.list_for_org(conn, org["id"])):
            body = marker + (":\n\n" + r["note"] if r["note"] else ".")
            interactions.create(conn, org["id"], {"type": "note", "summary": body}, by)
        links[r["task_key"]] = org["slug"]
    return links


def write_links(path: str, board: str, links: Dict[str, str]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"board": board, "links": links}, f, indent=2, sort_keys=True)
        f.write("\n")


def _print_table(rows: List[Dict[str, str]]) -> None:
    for r in rows:
        print("%-10s  %-40s  %-28s  %-16s  %s" % (r["task_key"][:10], r["title"][:40], r["slug"][:28],
                                                   r["status"], r["owner"]))


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("plan")
    pl.add_argument("--out", default="import-plan.csv")
    ap = sub.add_parser("apply")
    ap.add_argument("plan_file")
    ap.add_argument("--by", required=True, help="your email, recorded as the author")
    ap.add_argument("--links", default="import-links.json")
    args = p.parse_args(argv)
    settings = load_settings(os.environ)
    if args.cmd == "plan":
        reader = bench.from_settings(settings)
        if reader is None:
            print("Bench is off: set BINDER_BENCH_TOKEN (or BINDER_BENCH_FILE) and BINDER_BENCH_CORE.")
            return 2
        rows = plan_rows(bench.bucket_tasks(reader["todo"], reader["source"].fetch(), BUCKET))
        write_plan(args.out, rows)
        _print_table(rows)
        print("\n%d tasks. Edit %s, then run: apply %s --by <your email>" % (len(rows), args.out, args.out))
        return 0
    conn = connect(settings.db_path)
    migrate(conn, settings.db_path)
    links = apply_rows(conn, read_plan(args.plan_file), args.by.strip().lower())
    write_links(args.links, settings.bench_board, links)
    print("%d tasks linked to %d organisations. Ask the PA to add [lead:: <slug>] to each task in %s."
          % (len(links), len(set(links.values())), args.links))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

Check these against the real code (read first) and adjust: the name of the not-found exception `orgs.get_by_slug` raises (catch that, not `Exception`); whether `orgs.create` takes `slug` (it does: `requested_slug`) and keeps it as given when free; whether `orgs.update` allows a new organisation to go from `lead` to `parked` or `proposal_sent` directly (`check_transition` in `binder/statuses.py`). If a status cannot be reached in one step, report it rather than walking through the steps.

`import-plan.csv` and `import-links.json` hold real company names once run, so add both to `.gitignore`.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest -q`
Expected: all pass (202 + 6 = 208 passed, 2 deselected).

- [ ] **Step 5: Try the command on the fixture**

```bash
BINDER_BENCH_FILE=tests/bench_todo.md BINDER_BENCH_CORE=../bench/core .venv/bin/python -m scripts.import_from_bench plan --out /tmp/plan.csv
```

Expected: a four-row table and `4 tasks.` Delete `/tmp/plan.csv` afterwards.

- [ ] **Step 6: Commit**

```bash
git add scripts tests/test_import.py .gitignore
git commit -m "One-off import of the Leads bucket, through a plan file"
```

---

### Task 6: The Work section and Bench in the timeline

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/api/endpoints.ts`, `web/src/pages/OrgPage.tsx`, `web/src/pages/org/TimelineSection.tsx`, `web/src/test/render.tsx`, `web/src/test/fixtures.ts`
- Create: `web/src/pages/org/WorkSection.tsx`, `web/src/pages/org/WorkSection.test.tsx`

- [ ] **Step 1: Types and the route**

In `web/src/api/types.ts`:

```ts
export interface BenchTask {
  task_key: string
  board: string
  title: string
  state: string
  done: boolean
  done_on: string | null
  due: string | null
  assignee: string | null
  fetched_at: string
  url: string
}
export interface Work {
  tasks: BenchTask[]
  fetched_at: string | null
  error: string | null
}
export interface TimelineBench { kind: 'bench'; id: string; title: string; at: string; by_email: string | null; url: string }
```

Add `TimelineBench` to the `TimelineItem` union, and `bench: boolean` to `Meta`. In `web/src/api/endpoints.ts` add `work: (orgId: number) => request<Work>('GET', `/api/orgs/${orgId}/work`),`. In `web/src/test/render.tsx` the test session's meta gets `bench: true`, and in `web/src/test/fixtures.ts` add a `benchTask(over)` fixture with the fields above (made-up values, `url: 'https://bench.example.com/#!board=work!task=aa0002'`).

- [ ] **Step 2: Write the failing tests**

Create `web/src/pages/org/WorkSection.test.tsx`, using the same helpers as the other section tests (`renderApp`, `stubFetch`; read `PeopleSection` or `ResearchSection` tests for the pattern):

1. Open tasks are listed before done ones; each title is a link to its `url`, opening in a new tab (`target="_blank"`, `rel="noopener noreferrer"`); an open task shows its state as a Tenon `Tag`, its due date and assignee as faint caption; done tasks sit under a "Done" sub-heading with their done date.
2. With no tasks it says "No Bench tasks are tagged with this organisation yet." and shows the tag to use: `[lead:: <slug>]` in `tenon-code`.
3. With an `error`, it shows a warning `Alert` with the error text and "Showing what was read at <time>" when `fetched_at` is set, and still lists the cached tasks.
4. When the first answer has `fetched_at: null`, it loads again once after `WORK_RELOAD_MS` (a prop, default 4000, so the test passes 10) and shows the second answer.
5. The section does not render at all when `meta.bench` is false (test through `OrgPage` with a session override).

Also add to `TimelineSection`'s tests: a `bench` item renders as "Finished in Bench: <title>" with the title linking to its `url`, and the date.

- [ ] **Step 3: Run them to see them fail**

Run: `cd web && npm test`
Expected: the new tests FAIL (no `WorkSection`).

- [ ] **Step 4: Implement**

`web/src/pages/org/WorkSection.tsx`: a Tenon `Column` with `titleAs="h2"` and `title="Work"`, same as the other sections. Load with `useApi(() => api.work(orgId), [orgId])`. When the first answer has `fetched_at === null`, reload once after `reloadMs` (a refresh was started on the server). Render as in the tests; use `Tag`, `Alert`, `Loading`, `day()` from `lib/format`, the `tn-custom-*` classes already in `styles.css` (`tn-custom-faint`, `tn-custom-entry-meta`, `tn-custom-tight`), and add any new class to `styles.css` as `tn-custom-*` reading only `--tenon-*` tokens. Links use `safeHref`.

In `OrgPage.tsx`, render `<WorkSection orgId={org.id} slug={org.slug} />` in the right-hand column under People, only when `meta.bench`.

In `TimelineSection.tsx`, render a `bench` item like the status line: `Finished in Bench: <a href={safeHref(i.url)} target="_blank" rel="noopener noreferrer">{i.title}</a>` followed by the faint meta with `day(i.at)`. Its React key is `b${i.id}`.

Keep `README.md`'s API section and `types.ts` in step (Task 7 updates the README).

- [ ] **Step 5: Run the checks**

Run: `.venv/bin/pytest -q` and `cd web && npm run check && npm test && npm run e2e`
Expected: all pass. Vitest grows by the new tests. Playwright is unchanged (16 passed, 1 skipped), since the e2e server has Bench off.

- [ ] **Step 6: Commit**

```bash
git add web
git commit -m "Web: Work section and finished Bench tasks in the timeline"
```

---

### Task 7: Docs, review and the Binder PR

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: README**

1. After the AI paragraph, add:

```markdown
Binder reads Bench's `work` board to show each organisation's tasks: those
tagged `[lead:: <slug>]`. On the server it uses its own sign-in token,
`BINDER_BENCH_TOKEN`, against `BINDER_BENCH_URL` (default
`https://bench.offdesk.io`) and `BINDER_BENCH_BOARD` (default `work`), and
parses the board with Bench's `core/todo.py` from `BINDER_BENCH_CORE`. For
local development, `BINDER_BENCH_FILE=tests/bench_todo.md
BINDER_BENCH_CORE=../bench/core` reads a file instead. Without a token or a
file, Bench is off and the Work section is hidden. Binder only ever reads the
board; it never writes `todo.md`.
```

2. In the API section, add the Work record (`BenchTask`'s fields, `Work`'s `tasks`, `fetched_at`, `error`), the route `GET /api/orgs/{id}/work`, the `bench` timeline item, and `bench` in Vocabularies' meta, matching `types.ts` exactly.

3. Add an "Importing the Leads bucket" section with the commands from the script's docstring, the edit rules (same slug merges, blank slug skips), and the last step: "Ask the PA to add `[lead:: <slug>]` to each task listed in `import-links.json`, on the work board." Say that `import-plan.csv` and `import-links.json` hold real names and are git-ignored.

- [ ] **Step 2: CLAUDE.md**

1. Under "Read before changing anything", add `- Plan 4, Bench link and import: \`docs/superpowers/plans/2026-11-12-binder-4-bench-link.md\``.
2. In "Where the work stands", item 4 becomes "Bench link and import: built on `feature/bench-link` (Binder) and `feature/lead-tag` (Bench, PR for the owner's review). Review, then merge." and item 5 is marked **next**.
3. In "Ledger and Bench" (now "Binder and Bench"), add: "Binder reads Bench over HTTP with `BINDER_BENCH_TOKEN`, GET only, and parses with Bench's `core/todo.py` from `BINDER_BENCH_CORE`. Tests use `tests/bench_todo.md`, written from scratch: never copy from Bench's `data/`."

- [ ] **Step 3: The full check**

```bash
.venv/bin/pytest -q
cd web && npm run check && npm test && npm run e2e && cd ..
git status --short
```

Expected: all pass, and `git status` lists only `README.md` and `CLAUDE.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Docs: the Bench link, its settings and the import"
```

- [ ] **Step 5: Review and PR**

Use superpowers:requesting-code-review on the branch against this plan and the spec's "Bench integration" section. Fix what it finds and run Step 3 again. Then open the PR to `main`. The body says what plan 4 builds on the Binder side, that the server needs a Bench token for Binder and Binder's identity in the `work` board's `access.json` (plan 5), and that the Bench half is the separate Bench PR. Add no attribution lines.

---
### Task 8: Bench — the `[lead::]` tag (Bench repo)

Work in `/Users/jerome/Developer/bench`. First read its `CLAUDE.md`, `CONVENTIONS.md`, `core/README.md` and `docs/TESTING.md`, and follow them where they say more than this task does. **Do not open anything under `data/`.**

**Files (Bench):**
- Modify: `core/todo.js`, `core/todo.py`, `core/fixtures/generate-parse.mjs`, `core/fixtures/parse.json` (generated), `core/test_todo.py`, `kanban/js/19-drawer.js` (`RESERVED_TAG_KEYS`), `kanban/js/23-conflict-modal.js` (`MERGE_FIELD_NAMES`), plus the docs that list the tags (`README.md`, `CONVENTIONS.md`).

- [ ] **Step 1: Branch**

```bash
cd /Users/jerome/Developer/bench
git status --short   # must be clean apart from data/; stop and report if not
git checkout main && git pull --ff-only
git checkout -b feature/lead-tag
```

- [ ] **Step 2: The failing fixture cases**

In `core/fixtures/generate-parse.mjs`, add `'lead'` to `FIELDS`, and to `STEP_FIELDS` if steps can carry it (see how `theme` was added on 25 Sep 2026, and do the same). Append three cases to `NEW_LINES`, next to theme's:

```js
'- [ ] **Filed under a lead** [lead:: acme-studio]',
'- [ ] **A lead in code form** `lead:acme-studio`',
'- [ ] **No lead here** [theme:: Tokens]',
```

Run `node core/fixtures/generate-parse.mjs`, then `node core/test_todo.mjs` and `python3 core/test_todo.py`.
Expected: the generator records `lead: ''` for the new lines (todo.js does not know the field yet), and the round-trip checks show `[lead:: acme-studio]` kept in `extra`. Read the diff of `parse.json`; nothing else should change.

- [ ] **Step 3: `core/todo.js`**

Following Bench's recipe for a simple string field:
- In `readTags`'s `take()`, add `key === 'lead'` to the simple string fields (next to `'theme'`).
- In its return object, add `lead: tags.lead || '',`.
- In `serializeTask`, write it right after theme: `if (t.lead && t.lead.trim()) tags.push('[lead:: ' + t.lead.trim() + ']');`. `id` must stay last.
- Add `'lead'` to `MERGE_FIELDS`, after `'theme'`.
- In `splitBody`, copy `lead` onto the step object only if steps carry theme the same way.

The tier objects already have a `lead` property (the lines under a column heading). It is a different object, so nothing clashes, but add a one-line comment at the new task field saying `lead` here is the Binder organisation's slug.

- [ ] **Step 4: `core/todo.py`**

Mirror it exactly:
- add `"lead"` to `INLINE_KEYS`, to `Task.__slots__`, and default it to `""` in `__init__`
- add `"lead"` to `MERGE_FIELDS` at the same position as in JS (and to `_PY_NAME` if that map needs it)
- write it in `_mg_line` at the same position as `serializeTask`
- update the module docstring if it lists the fields

- [ ] **Step 5: Regenerate and run both suites**

```bash
node core/fixtures/generate-parse.mjs
node core/fixtures/generate-merge.mjs
node core/test_todo.mjs
python3 core/test_todo.py
```

Expected: both suites pass. In `parse.json` the three new cases now show `lead: 'acme-studio'`, `'acme-studio'` and `''`, and their `roundTrip` keeps `[lead:: acme-studio]` (the code-span form is rewritten to the bracket form, as for theme). Read the whole diff of both fixture files before going on. Add `"lead"` to `STEP_FIELDS` in `core/test_todo.py` if Step 2 added it to the generator's `STEP_FIELDS`.

- [ ] **Step 6: The board's lists**

- Add `'lead'` to `RESERVED_TAG_KEYS` in `kanban/js/19-drawer.js`, so "+ Add tag" does not offer a second `lead`.
- Add `lead: 'Lead'` (in that file's style) to `MERGE_FIELD_NAMES` in `kanban/js/23-conflict-modal.js`.

- [ ] **Step 7: Docs**

Add `[lead:: <slug>]` wherever Bench's `README.md` and `CONVENTIONS.md` list the inline tags: "the Binder organisation this task is for; the card shows it as a chip that opens `https://binder.offdesk.io/o/<slug>`". Keep Bench's writing rules (`WRITING.md`).

- [ ] **Step 8: Run all of Bench's suites**

```bash
python3 core/test_todo.py && node core/test_todo.mjs
scripts/test-board.sh --all
npm test && npm run check
```

Expected: all pass. Never run anything against the live server on port 8765.

- [ ] **Step 9: Commit (in Bench)**

```bash
git add core kanban/js/19-drawer.js kanban/js/23-conflict-modal.js README.md CONVENTIONS.md
git commit -m "Add the [lead:: <slug>] tag, for the Binder organisation a task is for"
```

---

### Task 9: Bench — the lead chip on the card (Bench repo)

**Files (Bench):**
- Modify: `kanban/js/09-columns.js` (`cardModel`), `kanban/ui/TaskCard.tsx` (`Chip`, `ChipSpan`), `kanban/test_board.mjs`

- [ ] **Step 1: The failing test**

In `kanban/test_board.mjs`, next to the theme pill check (it sets `t.theme` on demo card bd0003 and asserts the pill), add a check that sets `t.lead = 'acme-studio'` on the same card and asserts the card holds
`a.tenon-pill.tenon-pill--neutral[href="https://binder.offdesk.io/o/acme-studio"][title="Lead: acme-studio"]`, with `target="_blank"` and `rel="noopener noreferrer"`, and text `acme-studio`. Also assert that clicking it does not open the task drawer (the click must not bubble to the card).

Run: `scripts/test-board.sh test_board.mjs`
Expected: the new check FAILS.

- [ ] **Step 2: The chip**

- In `kanban/ui/TaskCard.tsx`, add an optional `href?: string` to the `Chip` interface. In `ChipSpan`, when `href` is set, render the Pill inside (or as) an `<a href target="_blank" rel="noopener noreferrer">` whose `onClick` calls `e.stopPropagation()`. Check Tenon's `Pill` props in `node_modules/@tiagopedras/tenon/dist/types/components/Pill/` first; if `Pill` cannot take a link, wrap it and keep the `tenon-pill` classes on the visible element so the test selector matches. Update `TaskCard.tsx`'s header comment if it still names `cardHTML()`, which no longer exists.
- In `cardModel()` (`kanban/js/09-columns.js`), right after the theme chip:

```js
if (t.lead) chips.push({ pill: 'neutral', text: t.lead, title: 'Lead: ' + t.lead, href: BINDER_URL + '/o/' + encodeURIComponent(t.lead) });
```

and define `const BINDER_URL = 'https://binder.offdesk.io';` once, near the top of that file or in `02-state.js` with the other constants (follow Bench's convention for shared constants).

- [ ] **Step 3: Run the suites**

```bash
scripts/test-board.sh --all
npm test && npm run check
```

Expected: all pass, including `CARD_PARITY` (the pinned demo cards carry no lead, so their shapes do not change).

- [ ] **Step 4: Commit (in Bench)**

```bash
git add kanban
git commit -m "Card: a lead chip that opens the organisation in Binder"
```

---

### Task 10: Bench — the Lead field in the drawer (Bench repo)

**Files (Bench):**
- Modify: `kanban/ui/DrawerPanel.tsx` (`DrawerBodyProps` and the Details layout), `kanban/js/19-drawer.js` (`openDrawer`), `kanban/test_board.mjs`

- [ ] **Step 1: The failing test**

In `kanban/test_board.mjs`, add a check that opens the drawer on a demo task, finds a text input labelled "Lead", types `acme-studio`, fires `change`, and asserts that `t.lead === 'acme-studio'`, that `t.dirty === true`, and that the serialised line now ends with `[lead:: acme-studio]` before the `id`. Clearing the input sets `t.lead` to `''`, and the tag goes. A slug is lowercased and trimmed on change (`' Acme-Studio '` → `'acme-studio'`). Also check that when `t.lead` is set the drawer shows an "Open in Binder" link to `https://binder.offdesk.io/o/acme-studio`, and that a read-only drawer (`ro`) shows the slug as text with no input.

Run: `scripts/test-board.sh test_board.mjs`
Expected: FAIL.

- [ ] **Step 2: The field**

- In `DrawerPanel.tsx`, add a `leadHTML` prop to `DrawerBodyProps` and a "Lead" row in the Details section right after Theme, following exactly how `themeHTML` is passed and placed.
- In `openDrawer` (`19-drawer.js`), build the row's HTML the way the theme row is built: a Tenon field (`tenon-field`, `tenon-field__label` "Lead", `tenon-field__control` text input `id="f-lead"`, `placeholder="organisation slug"`), its note "The Binder organisation, as in binder.offdesk.io/o/<slug>", and, when `t.lead` is set, an `Open in Binder` link (`target="_blank" rel="noopener noreferrer"`) using the same `BINDER_URL`. Escape the value with the helper the drawer already uses for attributes.
- Where the other handlers are wired (only when `!ro`), add:

```js
$('#f-lead').onchange = e => { t.lead = e.target.value.trim().toLowerCase(); touch(); openDrawer(t.id); };
```

(Re-opening the drawer refreshes the "Open in Binder" link; check that the theme handler does not already have a lighter way to redraw.)

- [ ] **Step 3: Run the suites**

```bash
python3 core/test_todo.py && node core/test_todo.mjs
scripts/test-board.sh --all
npm test && npm run check
```

Expected: all pass.

- [ ] **Step 4: Commit (in Bench)**

```bash
git add kanban
git commit -m "Drawer: a Lead field for the task's Binder organisation"
```

---

### Task 11: Bench — the PR (Bench repo), not merged

- [ ] **Step 1: Review**

Use superpowers:requesting-code-review on Bench's `feature/lead-tag` against `main`, with this plan's Tasks 8-10 and Bench's `CLAUDE.md` and `CONVENTIONS.md` as the standard. Fix what it finds, on the same branch, and run Bench's suites again.

- [ ] **Step 2: Add the IMPROVEMENTS.md entry if Bench expects one**

Bench's `IMPROVEMENTS.md` calls a new tag "Big". If its rules ask for an entry for work that is being done (read the header), add one in its format, marked as done by this PR. If they do not, skip this step and say so.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feature/lead-tag
gh pr create --base main --head feature/lead-tag --title "Lead tag: link a task to its Binder organisation"
```

The body says: what the tag is and why (the card chip is the view that needs it, per CONVENTIONS.md); the three changes (format in todo.js and todo.py with fixtures, the chip, the drawer field); that the search picker is left for later, once the sign-in cookie's scope is known; the suites run and their results. Add no attribution lines.

**Stop here. Do not merge the PR, and do not push to Bench's `main`.** Report the PR's URL.

---

## Spec coverage

| Spec item | Task |
|---|---|
| `[lead:: <slug>]` in `core/todo.js` and `core/todo.py` together, fixtures regenerated, both suites run | 8 |
| Card chip linking to `https://binder.offdesk.io/o/<slug>`, parity tests kept | 9 |
| Drawer "Lead" picker | 10 (a text field; the search picker waits for plan 5's cookie check, a decision taken with the owner) |
| Binder reads linked tasks server to server as a service identity with read access to one board | 1, 2 (token over HTTPS, the PA's pattern; the token and access entry are plan 5) |
| Parses with Bench's `core/todo.py` by path | 2 |
| Refresh every 10 minutes, and on opening an organisation when older than a minute | 4 |
| Lists every task with the slug, open and done | 2, 3, 4, 6 |
| Binder never writes `todo.md` | 2 (GET only), 5 (the PA tags) |
| `bench_links` table as a cache | 3 |
| Organisation page Work section with links to `#!board=<board>!task=<key>` | 4, 6 |
| Timeline includes Bench tasks | 4, 6 (finished ones, dated by their done date) |
| Import: every Leads task, open and done; one org per task; notes and sub-steps as a note; status from the column; owner from `[to::]` | 2, 5 |
| Dry run table for the owner to approve and edit; same slug merges | 5 (a CSV plan file) |
| `--apply` creates the orgs and writes `import-links.json`; the PA applies the tags | 5, 7 |
| Testing: fixture `todo.md` with a Leads bucket, dry run, apply against a throwaway database | 5 |
