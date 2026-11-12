# Binder Plan 1: Core API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working, tested FastAPI backend for Binder. It covers Offdesk header sign-in, a SQLite store with migrations, organisations with a status pipeline and history, contacts, interactions, a timeline, full-text search, and the "needs attention" and activity feeds.

**Architecture:** A FastAPI app built by `create_app(settings)`. Each request opens its own SQLite connection, from a dependency. The data access code is in plain functions in `binder/repo/` that take a connection and return dicts. Routers in `binder/api/` validate the request with pydantic and call those functions. Numbered `.sql` migrations are applied at startup and tracked in `PRAGMA user_version`. An FTS5 table is kept in step by triggers.

**Tech Stack:** Python ≥ 3.9 (code stays 3.9-compatible: `Optional[...]`, no `X | Y`), FastAPI, uvicorn, pydantic v2, stdlib `sqlite3` with FTS5, pytest, httpx (for `TestClient`).

Spec: `docs/superpowers/specs/2026-11-11-binder-design.md`. Later plans: 2 Frontend, 3 AI, 4 Bench link + import, 5 Deploy.

**Commits:** plain messages, and no attribution lines of any kind.

---

## File structure

```
binder/
  pyproject.toml              package + deps
  .gitignore
  binder/
    __init__.py
    __main__.py               `python -m binder` → uvicorn
    config.py                 Settings, load_settings(), ConfigError
    auth.py                   Identity, identity_from_headers(), guard()
    db.py                     connect(), migrate(), get_db(), now()
    errors.py                 NotFound, Conflict, Invalid + handlers
    statuses.py               status sets and transition rules
    schemas.py                pydantic request bodies
    app.py                    create_app()
    migrations/
      001_init.sql
    repo/
      __init__.py
      orgs.py                 create/get/list/update/delete, slugify
      contacts.py
      interactions.py
      timeline.py
      search.py
      feeds.py                attention + activity
    api/
      __init__.py
      orgs.py
      contacts.py
      interactions.py
      misc.py                 whoami, search, attention, activity
  tests/
    conftest.py
    test_config.py
    test_auth.py
    test_db.py
    test_orgs.py
    test_status.py
    test_contacts.py
    test_interactions.py
    test_search.py
    test_feeds.py
```

---

### Task 1: Project skeleton

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `binder/__init__.py`, `tests/__init__.py` (empty)

- [ ] **Step 1: Check Python**

Run: `python3 --version`
Expected: 3.9 or newer.

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[project]
name = "binder"
version = "0.1.0"
requires-python = ">=3.9"
dependencies = [
  "fastapi>=0.110,<1",
  "uvicorn>=0.29",
  "pydantic>=2.6,<3",
]

[project.optional-dependencies]
dev = ["pytest>=8", "httpx>=0.27"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["binder*"]

[tool.setuptools.package-data]
binder = ["migrations/*.sql"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = ["online: hits real external services; not run in CI"]
addopts = "-m 'not online'"
```

- [ ] **Step 3: Write `.gitignore`**

```
.venv/
__pycache__/
*.db
*.db-wal
*.db-shm
backups/
node_modules/
dist/
.pytest_cache/
```

- [ ] **Step 4: Write `binder/__init__.py`**

```python
"""Binder: the Offdesk leads and clients manager."""
```

- [ ] **Step 5: Create venv and install**

Run: `python3 -m venv .venv && .venv/bin/pip install -q -e '.[dev]' && .venv/bin/pytest -q`
Expected: `no tests ran` (exit code 5 is fine here).

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml .gitignore binder/__init__.py tests/__init__.py
git commit -m "Project skeleton"
```

---

### Task 2: Settings

**Files:**
- Create: `binder/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest
from binder.config import load_settings, ConfigError


def test_defaults_are_local_dev():
    s = load_settings({})
    assert s.auth == ""
    assert s.host == "127.0.0.1"
    assert s.port == 8770
    assert s.team == "offdesk"
    assert s.db_path == "binder.db"


def test_header_mode_accepted_on_loopback():
    s = load_settings({"BINDER_AUTH": "header", "BINDER_DB": "/x/l.db", "BINDER_PORT": "9000"})
    assert s.auth == "header"
    assert s.db_path == "/x/l.db"
    assert s.port == 9000


def test_unknown_auth_mode_refuses():
    with pytest.raises(ConfigError):
        load_settings({"BINDER_AUTH": "heder"})


def test_header_mode_refuses_public_host():
    with pytest.raises(ConfigError):
        load_settings({"BINDER_AUTH": "header", "BINDER_HOST": "0.0.0.0"})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest tests/test_config.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'binder.config'`

- [ ] **Step 3: Implement `binder/config.py`**

```python
"""Runtime settings, read from the environment.

BINDER_AUTH unset or empty is local development: one fixed identity, no
sign-in. BINDER_AUTH=header is the server behind nginx and the Offdesk
sign-in, which passes X-Offdesk-* headers. Any other value refuses to start,
so a typo cannot leave the app open. Header mode listens on loopback only,
because the headers are only trustworthy when nginx is the only caller.
"""

from dataclasses import dataclass
from typing import Mapping

LOOPBACK = ("127.0.0.1", "::1")


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    auth: str
    db_path: str
    host: str
    port: int
    team: str


def load_settings(env: Mapping[str, str]) -> Settings:
    auth = env.get("BINDER_AUTH", "")
    if auth not in ("", "header"):
        raise ConfigError("BINDER_AUTH=%r is not a known mode; use 'header' or leave it unset." % auth)
    host = env.get("BINDER_HOST", "127.0.0.1")
    if auth == "header" and host not in LOOPBACK:
        raise ConfigError("BINDER_AUTH=header listens on 127.0.0.1 only, not %s." % host)
    return Settings(
        auth=auth,
        db_path=env.get("BINDER_DB", "binder.db"),
        host=host,
        port=int(env.get("BINDER_PORT", "8770")),
        team=env.get("BINDER_TEAM", "offdesk"),
    )
```

- [ ] **Step 4: Run tests**

Run: `.venv/bin/pytest tests/test_config.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add binder/config.py tests/test_config.py
git commit -m "Settings from environment with safe auth modes"
```

---

### Task 3: Database and migrations

**Files:**
- Create: `binder/db.py`, `binder/migrations/001_init.sql`
- Test: `tests/test_db.py`

- [ ] **Step 1: Write the failing test**

```python
import sqlite3

import pytest

from binder.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate


def tables(conn):
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table')")}


def test_migrate_creates_schema_and_sets_version(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
    assert {"organisations", "contacts", "interactions", "interaction_contacts",
            "status_history", "search"} <= tables(conn)


def test_migrate_is_idempotent(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 1


def test_backup_taken_before_migrating_existing_db(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)  # fresh database: v1, no backup
    assert not (tmp_path / "backups").exists()
    mig = tmp_path / "migs"
    mig.mkdir()
    (mig / "001_init.sql").write_text((REAL_MIGRATIONS / "001_init.sql").read_text())
    (mig / "002_add.sql").write_text("CREATE TABLE added(x);")
    monkeypatch.setattr("binder.db.MIGRATIONS", mig)
    migrate(conn, path)
    assert len(list((tmp_path / "backups").glob("l-v1-*.db"))) == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 2


def test_failed_migration_rolls_back(tmp_path, monkeypatch):
    mig = tmp_path / "migs"
    mig.mkdir()
    (mig / "001_bad.sql").write_text("CREATE TABLE ok(x); CREATE TABLE ok(x);")
    monkeypatch.setattr("binder.db.MIGRATIONS", mig)
    path = str(tmp_path / "l.db")
    conn = connect(path)
    with pytest.raises(sqlite3.OperationalError):
        migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 0
    assert "ok" not in tables(conn)


def test_foreign_keys_on(tmp_path):
    conn = connect(str(tmp_path / "l.db"))
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest tests/test_db.py -v`
Expected: FAIL, `No module named 'binder.db'`

- [ ] **Step 3: Write `binder/migrations/001_init.sql`**

```sql
CREATE TABLE organisations (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  website        TEXT,
  sector         TEXT,
  size           TEXT,
  location       TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('lead','client')),
  status         TEXT NOT NULL,
  owner_email    TEXT,
  source         TEXT,
  value_estimate REAL,
  tags           TEXT NOT NULL DEFAULT '[]',
  summary        TEXT,
  next_step      TEXT,
  next_step_due  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

CREATE TABLE contacts (
  id            INTEGER PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  email         TEXT,
  phone         TEXT,
  linkedin_url  TEXT,
  notes         TEXT,
  is_primary    INTEGER NOT NULL DEFAULT 0,
  relationship  TEXT CHECK (relationship IN ('cold','warm','strong')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL
);
CREATE INDEX contacts_org ON contacts(org_id);

CREATE TABLE interactions (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('call','email','meeting','note')),
  happened_at    TEXT NOT NULL,
  summary        TEXT NOT NULL,
  next_step      TEXT,
  next_step_due  TEXT,
  author_email   TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);
CREATE INDEX interactions_org ON interactions(org_id, happened_at);

CREATE TABLE interaction_contacts (
  interaction_id INTEGER NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  contact_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, contact_id)
);

CREATE TABLE status_history (
  id           INTEGER PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  at           TEXT NOT NULL,
  by_email     TEXT NOT NULL
);
CREATE INDEX status_history_org ON status_history(org_id, at);

CREATE VIRTUAL TABLE search USING fts5(
  kind UNINDEXED, ref_id UNINDEXED, org_id UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER org_ai AFTER INSERT ON organisations BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('org', new.id, new.id, new.name,
    coalesce(new.summary,'') || ' ' || coalesce(new.sector,'') || ' ' || new.tags || ' ' ||
    coalesce(new.next_step,'') || ' ' || coalesce(new.website,'') || ' ' || coalesce(new.location,''));
END;
CREATE TRIGGER org_au AFTER UPDATE ON organisations BEGIN
  DELETE FROM search WHERE kind = 'org' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('org', new.id, new.id, new.name,
    coalesce(new.summary,'') || ' ' || coalesce(new.sector,'') || ' ' || new.tags || ' ' ||
    coalesce(new.next_step,'') || ' ' || coalesce(new.website,'') || ' ' || coalesce(new.location,''));
END;
CREATE TRIGGER org_ad AFTER DELETE ON organisations BEGIN
  DELETE FROM search WHERE org_id = old.id;
END;

CREATE TRIGGER contact_ai AFTER INSERT ON contacts BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('contact', new.id, new.org_id, new.name,
    coalesce(new.role,'') || ' ' || coalesce(new.email,'') || ' ' || coalesce(new.notes,''));
END;
CREATE TRIGGER contact_au AFTER UPDATE ON contacts BEGIN
  DELETE FROM search WHERE kind = 'contact' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('contact', new.id, new.org_id, new.name,
    coalesce(new.role,'') || ' ' || coalesce(new.email,'') || ' ' || coalesce(new.notes,''));
END;
CREATE TRIGGER contact_ad AFTER DELETE ON contacts BEGIN
  DELETE FROM search WHERE kind = 'contact' AND ref_id = old.id;
END;

CREATE TRIGGER interaction_ai AFTER INSERT ON interactions BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || new.happened_at, new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_au AFTER UPDATE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || new.happened_at, new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_ad AFTER DELETE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
END;
```

- [ ] **Step 4: Implement `binder/db.py`**

```python
"""SQLite access: one connection per request, numbered migrations at startup.

Migrations are `migrations/NNN_name.sql`, applied in order, each in its own
transaction together with `PRAGMA user_version = NNN`, so a failed one leaves
the database exactly as it was. Before migrating a database that already has
a schema, a copy goes to `<db dir>/backups/<name>-v<version>-<stamp>.db`.
"""

import datetime
import os
import pathlib
import sqlite3
from typing import Iterator, Optional

from fastapi import Request

MIGRATIONS = pathlib.Path(__file__).parent / "migrations"


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="microseconds")


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _version(conn: sqlite3.Connection) -> int:
    return conn.execute("PRAGMA user_version").fetchone()[0]


def _backup(conn: sqlite3.Connection, path: str, version: int) -> None:
    db = pathlib.Path(path)
    folder = db.parent / "backups"
    folder.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = sqlite3.connect(str(folder / ("%s-v%d-%s.db" % (db.stem, version, stamp))))
    with dest:
        conn.backup(dest)
    dest.close()


def migrate(conn: sqlite3.Connection, path: Optional[str] = None) -> None:
    current = _version(conn)
    pending = sorted(
        (int(f.name.split("_", 1)[0]), f) for f in MIGRATIONS.glob("*.sql")
        if int(f.name.split("_", 1)[0]) > current
    )
    if not pending:
        return
    if current > 0 and path and path != ":memory:" and os.path.exists(path):
        _backup(conn, path, current)
    for number, f in pending:
        script = "BEGIN;\n%s\nPRAGMA user_version = %d;\nCOMMIT;" % (f.read_text(), number)
        try:
            conn.executescript(script)
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    conn = connect(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()
```

- [ ] **Step 5: Run tests**

Run: `.venv/bin/pytest tests/test_db.py -v`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add binder/db.py binder/migrations/001_init.sql tests/test_db.py
git commit -m "SQLite schema, FTS triggers and transactional migrations"
```

---

### Task 4: Sign-in guard

**Files:**
- Create: `binder/auth.py`
- Test: `tests/test_auth.py` (unit part; HTTP part comes in Task 6)

- [ ] **Step 1: Write the failing test**

```python
import pytest
from fastapi import HTTPException
from binder.auth import identity_from_headers, DEV_IDENTITY
from binder.config import load_settings

HEADER = load_settings({"BINDER_AUTH": "header", "BINDER_DB": "/tmp/binder-test.db"})
LOCAL = load_settings({})


def test_local_mode_is_dev_identity():
    assert identity_from_headers({}, LOCAL) == DEV_IDENTITY


def test_header_mode_reads_identity():
    who = identity_from_headers({
        "x-offdesk-email": "A@Example.com",
        "x-offdesk-name": "Ana%20S%C3%A1",
        "x-offdesk-teams": "offdesk, other",
    }, HEADER)
    assert who.email == "a@example.com"
    assert who.name == "Ana Sá"
    assert who.teams == ("offdesk", "other")


def test_no_email_is_401():
    with pytest.raises(HTTPException) as e:
        identity_from_headers({"x-offdesk-teams": "offdesk"}, HEADER)
    assert e.value.status_code == 401


def test_wrong_team_is_403():
    with pytest.raises(HTTPException) as e:
        identity_from_headers({"x-offdesk-email": "a@example.com", "x-offdesk-teams": "other"}, HEADER)
    assert e.value.status_code == 403


def test_name_falls_back_to_email():
    who = identity_from_headers({"x-offdesk-email": "a@example.com", "x-offdesk-teams": "offdesk"}, HEADER)
    assert who.name == "a@example.com"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: FAIL, `No module named 'binder.auth'`

- [ ] **Step 3: Implement `binder/auth.py`**

```python
"""Who is calling.

Header mode trusts X-Offdesk-Email / -Name / -Teams because the app listens
on loopback only and nginx, which asks the Offdesk sign-in service, is the
only caller. Every non-GET request must also carry `X-Binder: 1`: a form on
another site can post with the visitor's cookie but cannot set that header.
"""

from dataclasses import dataclass
from typing import Mapping, Tuple
from urllib.parse import unquote

from fastapi import HTTPException, Request

from .config import Settings

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


@dataclass(frozen=True)
class Identity:
    email: str
    name: str
    teams: Tuple[str, ...]


DEV_IDENTITY = Identity("dev@binder.local", "Dev", ("offdesk",))


def identity_from_headers(headers: Mapping[str, str], settings: Settings) -> Identity:
    if not settings.auth:
        return DEV_IDENTITY
    email = (headers.get("x-offdesk-email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Not signed in")
    name = unquote(headers.get("x-offdesk-name") or "").strip() or email
    teams = tuple(t.strip() for t in (headers.get("x-offdesk-teams") or "").split(",") if t.strip())
    if settings.team not in teams:
        raise HTTPException(403, "Binder is for the %s team" % settings.team)
    return Identity(email, name, teams)


def guard(request: Request) -> Identity:
    who = identity_from_headers(request.headers, request.app.state.settings)
    if request.method not in SAFE_METHODS and request.headers.get("x-binder") != "1":
        raise HTTPException(403, "Missing X-Binder header")
    return who
```

- [ ] **Step 4: Run tests**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add binder/auth.py tests/test_auth.py
git commit -m "Offdesk header identity and CSRF guard"
```

---

### Task 5: Errors and statuses

**Files:**
- Create: `binder/errors.py`, `binder/statuses.py`
- Test: `tests/test_status.py` (rules part)

- [ ] **Step 1: Write the failing test**

```python
import pytest
from binder.errors import Invalid
from binder.statuses import check_transition, initial_status


def test_initial_status():
    assert initial_status("lead") == "lead"
    assert initial_status("client") == "active"


def test_lead_moves_within_lead_statuses():
    assert check_transition("lead", "lead", "contacted") == ("lead", "contacted")


def test_won_turns_lead_into_active_client():
    assert check_transition("lead", "proposal_sent", "won") == ("client", "active")


def test_client_cannot_take_lead_status():
    with pytest.raises(Invalid):
        check_transition("client", "active", "contacted")


def test_unknown_status_rejected():
    with pytest.raises(Invalid):
        check_transition("lead", "lead", "maybe")


def test_lost_lead_can_reopen():
    assert check_transition("lead", "lost", "in_conversation") == ("lead", "in_conversation")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/pytest tests/test_status.py -v`
Expected: FAIL, `No module named 'binder.errors'`

- [ ] **Step 3: Implement `binder/errors.py`**

```python
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class NotFound(Exception):
    pass


class Invalid(Exception):
    pass


class Conflict(Exception):
    """A save carried a stale updated_at. `current` is the row as it is now."""

    def __init__(self, current: Optional[Any] = None):
        super().__init__("Changed since you loaded it")
        self.current = current


def install(app: FastAPI) -> None:
    @app.exception_handler(NotFound)
    def _nf(request: Request, exc: NotFound):
        return JSONResponse({"detail": str(exc) or "Not found"}, status_code=404)

    @app.exception_handler(Invalid)
    def _inv(request: Request, exc: Invalid):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(Conflict)
    def _conf(request: Request, exc: Conflict):
        return JSONResponse({"detail": str(exc), "current": exc.current}, status_code=409)
```

- [ ] **Step 4: Implement `binder/statuses.py`**

```python
"""The pipeline. One record per organisation; Won flips a lead into a client."""

from typing import Tuple

from .errors import Invalid

LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent", "won", "lost", "parked")
OPEN_LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent")
CLIENT_STATUSES = ("active", "paused", "past")
KINDS = ("lead", "client")


def initial_status(kind: str) -> str:
    if kind not in KINDS:
        raise Invalid("Unknown kind %r" % kind)
    return "lead" if kind == "lead" else "active"


def check_transition(kind: str, current: str, new: str) -> Tuple[str, str]:
    """Return the (kind, status) to store. `won` is recorded in history but
    stored as an active client."""
    if kind == "lead":
        if new not in LEAD_STATUSES:
            raise Invalid("%r is not a lead status" % new)
        if new == "won":
            return "client", "active"
        return "lead", new
    if new not in CLIENT_STATUSES:
        raise Invalid("%r is not a client status" % new)
    return "client", new
```

- [ ] **Step 5: Run tests**

Run: `.venv/bin/pytest tests/test_status.py -v`
Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add binder/errors.py binder/statuses.py tests/test_status.py
git commit -m "Pipeline statuses and error types"
```

---

### Task 6: App factory, whoami, health

**Files:**
- Create: `binder/app.py`, `binder/api/__init__.py`, `binder/api/misc.py`, `binder/__main__.py`, `tests/conftest.py`
- Modify: `tests/test_auth.py` (append HTTP tests)

- [ ] **Step 1: Write `tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient

from binder.app import create_app
from binder.config import load_settings

TEAM = {"x-offdesk-email": "ana@example.com", "x-offdesk-name": "Ana", "x-offdesk-teams": "offdesk"}
WRITE = dict(TEAM, **{"x-binder": "1"})


@pytest.fixture
def make_client(tmp_path):
    def _make(auth="header"):
        env = {"BINDER_DB": str(tmp_path / "t.db")}
        if auth:
            env["BINDER_AUTH"] = auth
        return TestClient(create_app(load_settings(env)))
    return _make


@pytest.fixture
def client(make_client):
    """Header mode, signed in as Ana, X-Binder set on every request."""
    c = make_client()
    c.headers.update(WRITE)
    return c


@pytest.fixture
def org(client):
    r = client.post("/api/orgs", json={"name": "Acme Studio"})
    assert r.status_code == 201, r.text
    return r.json()
```

- [ ] **Step 2: Append failing HTTP tests to `tests/test_auth.py`**

```python
from tests.conftest import TEAM


def test_health_needs_no_sign_in(make_client):
    assert make_client().get("/api/health").json() == {"ok": True}


def test_whoami_signed_in(make_client):
    r = make_client().get("/api/whoami", headers=TEAM)
    assert r.json() == {"email": "ana@example.com", "name": "Ana", "teams": ["offdesk"]}


def test_whoami_without_headers_is_401(make_client):
    assert make_client().get("/api/whoami").status_code == 401


def test_local_mode_whoami_is_dev(make_client):
    assert make_client(auth="").get("/api/whoami").json()["email"] == "dev@binder.local"
```

- [ ] **Step 3: Run to verify failure**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: FAIL, `No module named 'binder.app'`

- [ ] **Step 4: Implement `binder/api/__init__.py`**

```python
"""HTTP routers. Every router here is mounted under /api behind guard()."""
```

- [ ] **Step 5: Implement `binder/api/misc.py`**

```python
from fastapi import APIRouter, Depends

from ..auth import Identity, guard

router = APIRouter()


@router.get("/whoami")
def whoami(who: Identity = Depends(guard)):
    return {"email": who.email, "name": who.name, "teams": list(who.teams)}
```

- [ ] **Step 6: Implement `binder/app.py`**

```python
from fastapi import APIRouter, Depends, FastAPI

from . import errors
from .auth import guard
from .config import Settings
from .db import connect, migrate
from .api import misc


def create_app(settings: Settings) -> FastAPI:
    conn = connect(settings.db_path)
    migrate(conn, settings.db_path)
    conn.close()

    app = FastAPI(title="Binder", docs_url=None, redoc_url=None)
    app.state.settings = settings
    errors.install(app)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    api = APIRouter(prefix="/api", dependencies=[Depends(guard)])
    api.include_router(misc.router)
    app.include_router(api)
    return app
```

- [ ] **Step 7: Implement `binder/__main__.py`**

```python
import os
import sys

import uvicorn

from .app import create_app
from .config import ConfigError, load_settings


def main() -> None:
    try:
        settings = load_settings(os.environ)
    except ConfigError as err:
        print(err, file=sys.stderr)
        sys.exit(2)
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: Run tests**

Run: `.venv/bin/pytest tests/test_auth.py -v`
Expected: 9 passed

- [ ] **Step 9: Commit**

```bash
git add binder/app.py binder/api binder/__main__.py tests/conftest.py tests/test_auth.py
git commit -m "App factory with health and whoami behind the sign-in guard"
```

---

### Task 7: Organisations

**Files:**
- Create: `binder/schemas.py`, `binder/repo/__init__.py`, `binder/repo/orgs.py`, `binder/api/orgs.py`
- Modify: `binder/app.py` (include router)
- Test: `tests/test_orgs.py`, and append to `tests/test_status.py`

- [ ] **Step 1: Write the failing tests `tests/test_orgs.py`**

```python
from tests.conftest import TEAM


def test_post_without_x_binder_is_403(make_client):
    r = make_client().post("/api/orgs", json={"name": "X"}, headers=TEAM)
    assert r.status_code == 403


def test_create_lead_defaults(client):
    r = client.post("/api/orgs", json={"name": "Acme Studio", "tags": ["design"]})
    assert r.status_code == 201
    o = r.json()
    assert o["slug"] == "acme-studio"
    assert o["kind"] == "lead" and o["status"] == "lead"
    assert o["tags"] == ["design"]
    assert o["owner_email"] == "ana@example.com"
    assert o["updated_by"] == "ana@example.com"


def test_slug_is_unique(client):
    client.post("/api/orgs", json={"name": "Acme"})
    assert client.post("/api/orgs", json={"name": "Acme"}).json()["slug"] == "acme-2"


def test_slug_strips_accents(client):
    assert client.post("/api/orgs", json={"name": "Café Açores"}).json()["slug"] == "cafe-acores"


def test_get_by_id_and_slug(client, org):
    assert client.get("/api/orgs/%d" % org["id"]).json()["name"] == "Acme Studio"
    assert client.get("/api/orgs/by-slug/acme-studio").json()["id"] == org["id"]


def test_get_missing_is_404(client):
    assert client.get("/api/orgs/999").status_code == 404


def test_patch_fields(client, org):
    r = client.patch("/api/orgs/%d" % org["id"], json={
        "updated_at": org["updated_at"], "website": "https://acme.example", "next_step": "Call Rui"})
    assert r.status_code == 200
    assert r.json()["website"] == "https://acme.example"


def test_stale_patch_is_409_with_current(client, org):
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "sector": "Retail"})
    r = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "sector": "Food"})
    assert r.status_code == 409
    assert r.json()["current"]["sector"] == "Retail"


def test_list_filters(client):
    client.post("/api/orgs", json={"name": "A", "tags": ["x"]})
    b = client.post("/api/orgs", json={"name": "B", "kind": "client"}).json()
    assert [o["name"] for o in client.get("/api/orgs?kind=client").json()] == ["B"]
    assert [o["name"] for o in client.get("/api/orgs?tag=x").json()] == ["A"]
    assert [o["name"] for o in client.get("/api/orgs?status=active").json()] == ["B"]
    assert b["status"] == "active"


def test_list_name_query(client):
    client.post("/api/orgs", json={"name": "Northwind"})
    client.post("/api/orgs", json={"name": "Acme"})
    assert [o["name"] for o in client.get("/api/orgs?q=north").json()] == ["Northwind"]


def test_delete(client, org):
    assert client.delete("/api/orgs/%d" % org["id"]).status_code == 204
    assert client.get("/api/orgs/%d" % org["id"]).status_code == 404
```

- [ ] **Step 2: Append failing status tests to `tests/test_status.py`**

```python
def test_status_change_writes_history(client, org):
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": "contacted"}).json()
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": o["updated_at"], "status": "won"}).json()
    assert o["kind"] == "client" and o["status"] == "active"
    hist = client.get("/api/orgs/%d/status-history" % org["id"]).json()
    assert [(h["from_status"], h["to_status"]) for h in hist] == [("contacted", "won"), ("lead", "contacted"), (None, "lead")]


def test_bad_status_is_422(client, org):
    r = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": "active"})
    assert r.status_code == 422
```

- [ ] **Step 3: Run to verify failure**

Run: `.venv/bin/pytest tests/test_orgs.py tests/test_status.py -v`
Expected: FAIL with 404/405 responses, because the routes don't exist yet.

- [ ] **Step 4: Implement `binder/schemas.py`**

```python
"""Request bodies. Responses are plain dicts from binder/repo."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OrgCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    slug: Optional[str] = None
    kind: str = "lead"
    website: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None
    owner_email: Optional[str] = None
    source: Optional[str] = None
    value_estimate: Optional[float] = None
    tags: List[str] = []
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None


class OrgPatch(_Body):
    updated_at: str
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[str] = None
    website: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None
    owner_email: Optional[str] = None
    source: Optional[str] = None
    value_estimate: Optional[float] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None


class ContactCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False
    relationship: Optional[str] = None


class ContactPatch(_Body):
    updated_at: str
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: Optional[bool] = None
    relationship: Optional[str] = None


class InteractionCreate(_Body):
    type: str
    summary: str = Field(min_length=1)
    happened_at: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    contact_ids: List[int] = []


class InteractionPatch(_Body):
    updated_at: str
    type: Optional[str] = None
    summary: Optional[str] = Field(default=None, min_length=1)
    happened_at: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    contact_ids: Optional[List[int]] = None
```

- [ ] **Step 5: Implement `binder/repo/__init__.py`**

```python
"""Data access. Plain functions: (conn, ...) -> dict. No HTTP here."""

import sqlite3
from typing import Any, Dict, Optional


def row(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(r) if r is not None else None
```

- [ ] **Step 6: Implement `binder/repo/orgs.py`**

```python
import json
import re
import sqlite3
import unicodedata
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, NotFound
from ..statuses import check_transition, initial_status
from . import row

FIELDS = ("name", "website", "sector", "size", "location", "owner_email", "source",
          "value_estimate", "tags", "summary", "next_step", "next_step_due")

LAST_CONTACT = "(SELECT max(happened_at) FROM interactions i WHERE i.org_id = o.id)"


def slugify(text: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-") or "org"


def _unique_slug(conn: sqlite3.Connection, base: str) -> str:
    slug, n = base, 1
    while conn.execute("SELECT 1 FROM organisations WHERE slug = ?", (slug,)).fetchone():
        n += 1
        slug = "%s-%d" % (base, n)
    return slug


def _out(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    d = row(r)
    if d is not None:
        d["tags"] = json.loads(d["tags"])
    return d


def _history(conn, org_id: int, frm: Optional[str], to: str, by: str, at: str) -> None:
    conn.execute("INSERT INTO status_history(org_id, from_status, to_status, at, by_email) VALUES (?,?,?,?,?)",
                 (org_id, frm, to, at, by))


def get(conn: sqlite3.Connection, org_id: int) -> Dict[str, Any]:
    d = _out(conn.execute("SELECT o.*, %s AS last_contact FROM organisations o WHERE o.id = ?" % LAST_CONTACT,
                          (org_id,)).fetchone())
    if d is None:
        raise NotFound("No organisation %d" % org_id)
    return d


def get_by_slug(conn: sqlite3.Connection, slug: str) -> Dict[str, Any]:
    r = conn.execute("SELECT id FROM organisations WHERE slug = ?", (slug,)).fetchone()
    if r is None:
        raise NotFound("No organisation %r" % slug)
    return get(conn, r["id"])


def create(conn: sqlite3.Connection, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    kind = data.pop("kind", "lead") or "lead"
    status = initial_status(kind)
    requested_slug = data.pop("slug", None)
    data.setdefault("owner_email", None)
    if not data["owner_email"]:
        data["owner_email"] = by
    data["tags"] = json.dumps(data.get("tags") or [])
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN IMMEDIATE")  # slug lookup and insert under one write lock
    slug = _unique_slug(conn, slugify(requested_slug or data["name"]))
    cur = conn.execute(
        "INSERT INTO organisations(slug, kind, status, created_at, updated_at, updated_by, %s) VALUES (?,?,?,?,?,?,%s)"
        % (", ".join(cols), ", ".join("?" * len(cols))),
        [slug, kind, status, at, at, by] + [data[c] for c in cols])
    _history(conn, cur.lastrowid, None, status, by, at)
    conn.execute("COMMIT")
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, org_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, org_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        at = now()
        sets: Dict[str, Any] = {k: v for k, v in patch.items() if k in FIELDS}
        if "tags" in sets:
            sets["tags"] = json.dumps(sets["tags"] or [])
        new_status = patch.get("status")
        if new_status and new_status != current["status"]:
            kind, stored = check_transition(current["kind"], current["status"], new_status)
            sets["kind"], sets["status"] = kind, stored
            _history(conn, org_id, current["status"], new_status, by, at)
        sets["updated_at"], sets["updated_by"] = at, by
        conn.execute("UPDATE organisations SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [org_id])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, org_id)


def delete(conn: sqlite3.Connection, org_id: int) -> None:
    if conn.execute("DELETE FROM organisations WHERE id = ?", (org_id,)).rowcount == 0:
        raise NotFound("No organisation %d" % org_id)


def list_(conn: sqlite3.Connection, kind: Optional[str] = None, status: Optional[str] = None,
          owner: Optional[str] = None, tag: Optional[str] = None, q: Optional[str] = None,
          sort: str = "updated") -> List[Dict[str, Any]]:
    where, args = [], []  # type: List[str], List[Any]
    if kind:
        where.append("o.kind = ?"); args.append(kind)
    if status:
        where.append("o.status = ?"); args.append(status)
    if owner:
        where.append("o.owner_email = ?"); args.append(owner)
    if tag:
        where.append("EXISTS (SELECT 1 FROM json_each(o.tags) WHERE value = ?)"); args.append(tag)
    if q:
        where.append("o.name LIKE ?"); args.append("%" + q + "%")
    order = {"updated": "o.updated_at DESC", "name": "o.name COLLATE NOCASE",
             "last_contact": "last_contact IS NULL, last_contact DESC",
             "value": "o.value_estimate IS NULL, o.value_estimate DESC"}.get(sort, "o.updated_at DESC")
    sql = "SELECT o.*, %s AS last_contact FROM organisations o %s ORDER BY %s" % (
        LAST_CONTACT, ("WHERE " + " AND ".join(where)) if where else "", order)
    return [_out(r) for r in conn.execute(sql, args)]


def status_history(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    get(conn, org_id)
    return [row(r) for r in conn.execute(
        "SELECT * FROM status_history WHERE org_id = ? ORDER BY at DESC, id DESC", (org_id,))]
```

- [ ] **Step 7: Implement `binder/api/orgs.py`**

```python
import sqlite3

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import orgs
from ..schemas import OrgCreate, OrgPatch

router = APIRouter(prefix="/orgs")


@router.get("")
def list_orgs(kind: str = None, status: str = None, owner: str = None, tag: str = None,
              q: str = None, sort: str = "updated", db: sqlite3.Connection = Depends(get_db)):
    return orgs.list_(db, kind=kind, status=status, owner=owner, tag=tag, q=q, sort=sort)


@router.post("", status_code=201)
def create_org(body: OrgCreate, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    return orgs.create(db, body.model_dump(), who.email)


@router.get("/by-slug/{slug}")
def get_by_slug(slug: str, db: sqlite3.Connection = Depends(get_db)):
    return orgs.get_by_slug(db, slug)


@router.get("/{org_id}")
def get_org(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return orgs.get(db, org_id)


@router.patch("/{org_id}")
def patch_org(org_id: int, body: OrgPatch, db: sqlite3.Connection = Depends(get_db),
              who: Identity = Depends(guard)):
    return orgs.update(db, org_id, body.model_dump(exclude_unset=True), who.email)


@router.delete("/{org_id}", status_code=204)
def delete_org(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    orgs.delete(db, org_id)
    return Response(status_code=204)


@router.get("/{org_id}/status-history")
def history(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return orgs.status_history(db, org_id)
```

- [ ] **Step 8: Register the router in `binder/app.py`**

Change the import line `from .api import misc` to `from .api import misc, orgs`, and after `api.include_router(misc.router)` add:

```python
    api.include_router(orgs.router)
```

- [ ] **Step 9: Run tests**

Run: `.venv/bin/pytest -v`
Expected: all pass. If `test_status_change_writes_history` shows ties in ordering, keep it: history `at` is microsecond-precise, and `id DESC` breaks ties.

- [ ] **Step 10: Commit**

```bash
git add binder tests
git commit -m "Organisations: CRUD, slugs, filters, status pipeline with history"
```

---

### Task 8: Contacts

**Files:**
- Create: `binder/repo/contacts.py`, `binder/api/contacts.py`
- Modify: `binder/app.py`
- Test: `tests/test_contacts.py`

- [ ] **Step 1: Write the failing test**

```python
def add(client, org, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_add_and_list(client, org):
    add(client, org, name="Rui", role="CEO", email="rui@acme.example")
    add(client, org, name="Inês")
    names = [c["name"] for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()]
    assert names == ["Inês", "Rui"]


def test_one_primary_per_org(client, org):
    a = add(client, org, name="A", is_primary=True)
    add(client, org, name="B", is_primary=True)
    contacts = {c["name"]: c for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()}
    assert contacts["B"]["is_primary"] is True
    assert contacts["A"]["is_primary"] is False
    listed = client.get("/api/orgs/%d/contacts" % org["id"]).json()
    assert listed[0]["name"] == "B"  # primary first
    assert a["id"] != contacts["B"]["id"]


def test_patch_and_conflict(client, org):
    c = add(client, org, name="Rui")
    r = client.patch("/api/contacts/%d" % c["id"], json={"updated_at": c["updated_at"], "role": "CTO"})
    assert r.json()["role"] == "CTO"
    r = client.patch("/api/contacts/%d" % c["id"], json={"updated_at": c["updated_at"], "role": "COO"})
    assert r.status_code == 409


def test_bad_relationship_is_422(client, org):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "X", "relationship": "best"})
    assert r.status_code == 422


def test_get_and_delete(client, org):
    c = add(client, org, name="Rui")
    assert client.get("/api/contacts/%d" % c["id"]).json()["org_name"] == "Acme Studio"
    assert client.delete("/api/contacts/%d" % c["id"]).status_code == 204
    assert client.get("/api/contacts/%d" % c["id"]).status_code == 404


def test_contact_on_missing_org_is_404(client):
    assert client.post("/api/orgs/999/contacts", json={"name": "X"}).status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_contacts.py -v`
Expected: FAIL (404/405 responses)

- [ ] **Step 3: Implement `binder/repo/contacts.py`**

```python
import sqlite3
from typing import Any, Dict, List

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from . import orgs, row

FIELDS = ("name", "role", "email", "phone", "linkedin_url", "notes", "is_primary", "relationship")
RELATIONSHIPS = (None, "cold", "warm", "strong")


def _out(r) -> Dict[str, Any]:
    d = row(r)
    d["is_primary"] = bool(d["is_primary"])
    return d


def _check(data: Dict[str, Any]) -> None:
    if data.get("relationship", None) not in RELATIONSHIPS:
        raise Invalid("relationship must be cold, warm or strong")


def get(conn: sqlite3.Connection, contact_id: int) -> Dict[str, Any]:
    r = conn.execute("SELECT c.*, o.name AS org_name, o.slug AS org_slug FROM contacts c "
                     "JOIN organisations o ON o.id = c.org_id WHERE c.id = ?", (contact_id,)).fetchone()
    if r is None:
        raise NotFound("No contact %d" % contact_id)
    return _out(r)


def list_for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    orgs.get(conn, org_id)
    return [_out(r) for r in conn.execute(
        "SELECT * FROM contacts WHERE org_id = ? ORDER BY is_primary DESC, name COLLATE NOCASE", (org_id,))]


def _clear_primary(conn, org_id: int, keep: int) -> None:
    conn.execute("UPDATE contacts SET is_primary = 0 WHERE org_id = ? AND id != ?", (org_id, keep))


def create(conn: sqlite3.Connection, org_id: int, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    orgs.get(conn, org_id)
    _check(data)
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN")
    cur = conn.execute(
        "INSERT INTO contacts(org_id, created_at, updated_at, updated_by, %s) VALUES (?,?,?,?,%s)"
        % (", ".join(cols), ", ".join("?" * len(cols))),
        [org_id, at, at, by] + [int(data[c]) if c == "is_primary" else data[c] for c in cols])
    if data.get("is_primary"):
        _clear_primary(conn, org_id, cur.lastrowid)
    conn.execute("COMMIT")
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, contact_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    _check(patch)
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, contact_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        sets = {k: (int(v) if k == "is_primary" else v) for k, v in patch.items() if k in FIELDS}
        sets["updated_at"], sets["updated_by"] = now(), by
        conn.execute("UPDATE contacts SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [contact_id])
        if patch.get("is_primary"):
            _clear_primary(conn, current["org_id"], contact_id)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, contact_id)


def delete(conn: sqlite3.Connection, contact_id: int) -> None:
    if conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,)).rowcount == 0:
        raise NotFound("No contact %d" % contact_id)
```

- [ ] **Step 4: Implement `binder/api/contacts.py`**

```python
import sqlite3

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import contacts
from ..schemas import ContactCreate, ContactPatch

router = APIRouter()


@router.get("/orgs/{org_id}/contacts")
def list_contacts(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.list_for_org(db, org_id)


@router.post("/orgs/{org_id}/contacts", status_code=201)
def add_contact(org_id: int, body: ContactCreate, db: sqlite3.Connection = Depends(get_db),
                who: Identity = Depends(guard)):
    return contacts.create(db, org_id, body.model_dump(), who.email)


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.get(db, contact_id)


@router.patch("/contacts/{contact_id}")
def patch_contact(contact_id: int, body: ContactPatch, db: sqlite3.Connection = Depends(get_db),
                  who: Identity = Depends(guard)):
    return contacts.update(db, contact_id, body.model_dump(exclude_unset=True), who.email)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    contacts.delete(db, contact_id)
    return Response(status_code=204)
```

- [ ] **Step 5: Register in `binder/app.py`**

Import `contacts` alongside the others (`from .api import misc, orgs, contacts`) and add `api.include_router(contacts.router)`.

- [ ] **Step 6: Run tests**

Run: `.venv/bin/pytest -v`
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add binder tests
git commit -m "Contacts with a single primary per organisation"
```

---

### Task 9: Interactions and timeline

**Files:**
- Create: `binder/repo/interactions.py`, `binder/repo/timeline.py`, `binder/api/interactions.py`
- Modify: `binder/app.py`
- Test: `tests/test_interactions.py`

- [ ] **Step 1: Write the failing test**

```python
def contact(client, org, name):
    return client.post("/api/orgs/%d/contacts" % org["id"], json={"name": name}).json()


def log(client, org, **kw):
    kw.setdefault("type", "call")
    kw.setdefault("summary", "Intro call")
    r = client.post("/api/orgs/%d/interactions" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_log_with_contacts(client, org):
    rui = contact(client, org, "Rui")
    i = log(client, org, contact_ids=[rui["id"]], happened_at="2026-11-01T10:00:00+00:00", next_step="Send deck")
    assert i["contact_ids"] == [rui["id"]]
    assert i["author_email"] == "ana@example.com"
    assert client.get("/api/orgs/%d" % org["id"]).json()["last_contact"] == "2026-11-01T10:00:00+00:00"


def test_happened_at_defaults_to_now(client, org):
    i = log(client, org)
    assert i["happened_at"] == i["created_at"]


def test_contact_from_other_org_is_422(client, org):
    other = client.post("/api/orgs", json={"name": "Other"}).json()
    stranger = contact(client, other, "Zé")
    r = client.post("/api/orgs/%d/interactions" % org["id"],
                    json={"type": "call", "summary": "x", "contact_ids": [stranger["id"]]})
    assert r.status_code == 422


def test_bad_type_is_422(client, org):
    r = client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "fax", "summary": "x"})
    assert r.status_code == 422


def test_patch_contacts_and_conflict(client, org):
    rui, ines = contact(client, org, "Rui"), contact(client, org, "Inês")
    i = log(client, org, contact_ids=[rui["id"]])
    j = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "contact_ids": [ines["id"]]}).json()
    assert j["contact_ids"] == [ines["id"]]
    r = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "summary": "y"})
    assert r.status_code == 409


def test_contact_interactions(client, org):
    rui = contact(client, org, "Rui")
    log(client, org, contact_ids=[rui["id"]], summary="With Rui")
    log(client, org, summary="Without")
    assert [i["summary"] for i in client.get("/api/contacts/%d/interactions" % rui["id"]).json()] == ["With Rui"]


def test_timeline_mixes_interactions_and_status(client, org):
    log(client, org, happened_at="2000-01-01T00:00:00+00:00", summary="Old note", type="note")
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": "contacted"})
    items = client.get("/api/orgs/%d/timeline" % org["id"]).json()
    assert [i["kind"] for i in items] == ["status", "status", "interaction"]
    assert items[0]["to_status"] == "contacted"
    assert items[-1]["summary"] == "Old note"


def test_delete_interaction(client, org):
    i = log(client, org)
    assert client.delete("/api/interactions/%d" % i["id"]).status_code == 204
    assert client.get("/api/orgs/%d/interactions" % org["id"]).json() == []
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_interactions.py -v`
Expected: FAIL (404/405)

- [ ] **Step 3: Implement `binder/repo/interactions.py`**

```python
import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from . import orgs, row

TYPES = ("call", "email", "meeting", "note")
FIELDS = ("type", "summary", "happened_at", "next_step", "next_step_due")


def _with_contacts(conn, d: Dict[str, Any]) -> Dict[str, Any]:
    d["contact_ids"] = [r[0] for r in conn.execute(
        "SELECT contact_id FROM interaction_contacts WHERE interaction_id = ? ORDER BY contact_id", (d["id"],))]
    return d


def _check(conn, org_id: int, data: Dict[str, Any]) -> None:
    if "type" in data and data["type"] not in TYPES:
        raise Invalid("type must be one of %s" % ", ".join(TYPES))
    ids = data.get("contact_ids") or []
    if ids:
        found = conn.execute("SELECT count(*) FROM contacts WHERE org_id = ? AND id IN (%s)"
                             % ",".join("?" * len(ids)), [org_id] + list(ids)).fetchone()[0]
        if found != len(set(ids)):
            raise Invalid("Every contact must belong to this organisation")


def _set_contacts(conn, interaction_id: int, ids: List[int]) -> None:
    conn.execute("DELETE FROM interaction_contacts WHERE interaction_id = ?", (interaction_id,))
    conn.executemany("INSERT INTO interaction_contacts VALUES (?, ?)", [(interaction_id, c) for c in set(ids)])


def get(conn: sqlite3.Connection, interaction_id: int) -> Dict[str, Any]:
    d = row(conn.execute("SELECT * FROM interactions WHERE id = ?", (interaction_id,)).fetchone())
    if d is None:
        raise NotFound("No interaction %d" % interaction_id)
    return _with_contacts(conn, d)


def list_for_org(conn: sqlite3.Connection, org_id: int, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    orgs.get(conn, org_id)
    sql = "SELECT * FROM interactions WHERE org_id = ? ORDER BY happened_at DESC, id DESC"
    args: List[Any] = [org_id]
    if limit:
        sql += " LIMIT ?"
        args.append(limit)
    return [_with_contacts(conn, row(r)) for r in conn.execute(sql, args)]


def list_for_contact(conn: sqlite3.Connection, contact_id: int) -> List[Dict[str, Any]]:
    return [_with_contacts(conn, row(r)) for r in conn.execute(
        "SELECT i.* FROM interactions i JOIN interaction_contacts ic ON ic.interaction_id = i.id "
        "WHERE ic.contact_id = ? ORDER BY i.happened_at DESC, i.id DESC", (contact_id,))]


def create(conn: sqlite3.Connection, org_id: int, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    orgs.get(conn, org_id)
    _check(conn, org_id, data)
    at = now()
    data["happened_at"] = data.get("happened_at") or at
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN")
    cur = conn.execute(
        "INSERT INTO interactions(org_id, author_email, created_at, updated_at, updated_by, %s) "
        "VALUES (?,?,?,?,?,%s)" % (", ".join(cols), ", ".join("?" * len(cols))),
        [org_id, by, at, at, by] + [data[c] for c in cols])
    _set_contacts(conn, cur.lastrowid, data.get("contact_ids") or [])
    conn.execute("COMMIT")
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, interaction_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, interaction_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        _check(conn, current["org_id"], patch)
        sets = {k: v for k, v in patch.items() if k in FIELDS}
        sets["updated_at"], sets["updated_by"] = now(), by
        conn.execute("UPDATE interactions SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [interaction_id])
        if patch.get("contact_ids") is not None:
            _set_contacts(conn, interaction_id, patch["contact_ids"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, interaction_id)


def delete(conn: sqlite3.Connection, interaction_id: int) -> None:
    if conn.execute("DELETE FROM interactions WHERE id = ?", (interaction_id,)).rowcount == 0:
        raise NotFound("No interaction %d" % interaction_id)
```

- [ ] **Step 4: Implement `binder/repo/timeline.py`**

```python
"""One organisation's history, newest first: interactions and status changes.
Plan 4 adds Bench tasks to the same list."""

import sqlite3
from typing import Any, Dict, List

from . import interactions, orgs


def for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for i in interactions.list_for_org(conn, org_id):
        items.append(dict(i, kind="interaction", at=i["happened_at"]))
    for h in orgs.status_history(conn, org_id):
        items.append(dict(h, kind="status"))
    items.sort(key=lambda x: (x["at"], x["id"]), reverse=True)
    return items
```

- [ ] **Step 5: Implement `binder/api/interactions.py`**

```python
import sqlite3

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import interactions, timeline
from ..schemas import InteractionCreate, InteractionPatch

router = APIRouter()


@router.get("/orgs/{org_id}/interactions")
def list_interactions(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return interactions.list_for_org(db, org_id)


@router.post("/orgs/{org_id}/interactions", status_code=201)
def log_interaction(org_id: int, body: InteractionCreate, db: sqlite3.Connection = Depends(get_db),
                    who: Identity = Depends(guard)):
    return interactions.create(db, org_id, body.model_dump(), who.email)


@router.get("/orgs/{org_id}/timeline")
def org_timeline(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return timeline.for_org(db, org_id)


@router.get("/contacts/{contact_id}/interactions")
def contact_interactions(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    return interactions.list_for_contact(db, contact_id)


@router.patch("/interactions/{interaction_id}")
def patch_interaction(interaction_id: int, body: InteractionPatch, db: sqlite3.Connection = Depends(get_db),
                      who: Identity = Depends(guard)):
    return interactions.update(db, interaction_id, body.model_dump(exclude_unset=True), who.email)


@router.delete("/interactions/{interaction_id}", status_code=204)
def delete_interaction(interaction_id: int, db: sqlite3.Connection = Depends(get_db)):
    interactions.delete(db, interaction_id)
    return Response(status_code=204)
```

- [ ] **Step 6: Register in `binder/app.py`**

Import `interactions` with the others and add `api.include_router(interactions.router)`.

- [ ] **Step 7: Run tests**

Run: `.venv/bin/pytest -v`
Expected: all pass. In `test_timeline_mixes_interactions_and_status` the order is: status `contacted` (now), status `lead` (creation, now minus a moment), then the interaction dated 2000.

- [ ] **Step 8: Commit**

```bash
git add binder tests
git commit -m "Interactions with contacts, and the organisation timeline"
```

---

### Task 10: Search

**Files:**
- Create: `binder/repo/search.py`
- Modify: `binder/api/misc.py`
- Test: `tests/test_search.py`

- [ ] **Step 1: Write the failing test**

```python
def test_search_finds_each_kind(client, org):
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "summary": "Ceramics brand in Porto"})
    client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui Costa", "role": "Founder"})
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "call", "summary": "Talked about the Lisbon pop-up"})

    hits = client.get("/api/search?q=porto").json()
    assert [(h["kind"], h["org_name"]) for h in hits] == [("org", "Acme Studio")]
    assert "[Porto]" in hits[0]["snippet"]

    assert client.get("/api/search?q=founder").json()[0]["kind"] == "contact"
    assert client.get("/api/search?q=lisb").json()[0]["kind"] == "interaction"  # prefix match


def test_search_ignores_accents_and_quotes(client):
    client.post("/api/orgs", json={"name": "Café Açores"})
    assert len(client.get("/api/search?q=acores").json()) == 1
    assert client.get('/api/search?q="').json() == []


def test_search_follows_edits_and_deletes(client, org):
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "name": "Zebra Co"}).json()
    assert client.get("/api/search?q=acme").json() == []
    assert len(client.get("/api/search?q=zebra").json()) == 1
    client.delete("/api/orgs/%d" % o["id"])
    assert client.get("/api/search?q=zebra").json() == []


def test_empty_query(client):
    assert client.get("/api/search?q=").json() == []
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_search.py -v`
Expected: FAIL (404)

- [ ] **Step 3: Implement `binder/repo/search.py`**

```python
"""Full-text search over organisations, contacts and interactions (and
research, from plan 3). Each word becomes a quoted prefix term, so user
input can never be read as FTS5 syntax."""

import sqlite3
from typing import Any, Dict, List


def _match(q: str) -> str:
    terms = [t.replace('"', "") for t in q.split()]
    return " ".join('"%s"*' % t for t in terms if t)


def query(conn: sqlite3.Connection, q: str, limit: int = 50) -> List[Dict[str, Any]]:
    match = _match(q or "")
    if not match:
        return []
    rows = conn.execute(
        "SELECT s.kind, s.ref_id, s.org_id, s.title, o.name AS org_name, o.slug AS org_slug, "
        "snippet(search, 4, '[', ']', '…', 12) AS snippet "
        "FROM search s JOIN organisations o ON o.id = s.org_id "
        "WHERE search MATCH ? ORDER BY rank LIMIT ?", (match, limit))
    return [dict(r, ref_id=int(r["ref_id"]), org_id=int(r["org_id"])) for r in rows]
```

Note: if the term only matches the `title` column, `snippet` on column 4 still returns body text without brackets. That's fine, because the UI shows `title` as well.

- [ ] **Step 4: Add the route to `binder/api/misc.py`**

```python
import sqlite3

from ..db import get_db
from ..repo import search


@router.get("/search")
def search_all(q: str = "", db: sqlite3.Connection = Depends(get_db)):
    return search.query(db, q)
```

(Put the imports at the top of the file with the existing ones.)

- [ ] **Step 5: Run tests**

Run: `.venv/bin/pytest -v`
Expected: all pass. If `[Porto]` fails because the match landed in `title`, check that the summary edit landed: the `org_au` trigger rebuilds the row.

- [ ] **Step 6: Commit**

```bash
git add binder tests
git commit -m "Full-text search with safe prefix terms"
```

---

### Task 11: Needs-attention and activity feeds

**Files:**
- Create: `binder/repo/feeds.py`
- Modify: `binder/api/misc.py`
- Test: `tests/test_feeds.py`

Rules (spec, Screens §1), for open leads only (`kind = lead`, status in `OPEN_LEAD_STATUSES`), except `overdue`, which applies to every record:
- `overdue`: `next_step_due` before today.
- `quiet`: no interaction in 14 days. Measured from the last interaction, or from `created_at` when there is none.
- `stuck`: more than 30 days since the last status change.

- [ ] **Step 1: Write the failing test**

```python
from binder.repo import feeds


def db(client):
    from binder.db import connect
    return connect(client.app.state.settings.db_path)


def test_attention_reasons(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = '2026-01-01T00:00:00+00:00', next_step_due = '2026-01-05' WHERE id = ?", (org["id"],))
    conn.execute("UPDATE status_history SET at = '2026-01-01T00:00:00+00:00' WHERE org_id = ?", (org["id"],))
    fresh = client.post("/api/orgs", json={"name": "Fresh"}).json()
    items = feeds.attention(conn, today="2026-11-11")
    assert [(i["org"]["name"], sorted(i["reasons"])) for i in items] == [("Acme Studio", ["overdue", "quiet", "stuck"])]
    assert fresh["id"] not in [i["org"]["id"] for i in items]


def test_recent_interaction_clears_quiet(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = '2026-01-01T00:00:00+00:00' WHERE id = ?", (org["id"],))
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "call", "summary": "x", "happened_at": "2026-11-10T09:00:00+00:00"})
    items = feeds.attention(conn, today="2026-11-11")
    assert all("quiet" not in i["reasons"] for i in items)


def test_closed_leads_and_clients_only_overdue(client):
    c = client.post("/api/orgs", json={"name": "Client", "kind": "client"}).json()
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = '2026-01-01T00:00:00+00:00' WHERE id = ?", (c["id"],))
    conn.execute("UPDATE status_history SET at = '2026-01-01T00:00:00+00:00' WHERE org_id = ?", (c["id"],))
    assert feeds.attention(conn, today="2026-11-11") == []


def test_attention_route(client, org):
    assert client.get("/api/attention").status_code == 200


def test_activity_feed(client, org):
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "note", "summary": "Hello"})
    items = client.get("/api/activity").json()
    assert items[0]["kind"] == "interaction" and items[0]["org_name"] == "Acme Studio"
    assert items[1]["kind"] == "status"
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_feeds.py -v`
Expected: FAIL, `cannot import name 'feeds'`

- [ ] **Step 3: Implement `binder/repo/feeds.py`**

```python
"""Home screen feeds: what needs attention, and what happened lately."""

import datetime
import sqlite3
from typing import Any, Dict, List, Optional

from ..statuses import OPEN_LEAD_STATUSES
from . import orgs, row

QUIET_DAYS = 14
STUCK_DAYS = 30


def _days_before(today: str, days: int) -> str:
    return (datetime.date.fromisoformat(today) - datetime.timedelta(days=days)).isoformat()


def attention(conn: sqlite3.Connection, today: Optional[str] = None) -> List[Dict[str, Any]]:
    today = today or datetime.date.today().isoformat()
    quiet_before = _days_before(today, QUIET_DAYS)
    stuck_before = _days_before(today, STUCK_DAYS)
    open_list = ",".join("'%s'" % s for s in OPEN_LEAD_STATUSES)
    rows = conn.execute(
        "SELECT o.id, "
        "  (o.next_step_due IS NOT NULL AND o.next_step_due < ?) AS overdue, "
        "  (o.kind = 'lead' AND o.status IN (%s) AND "
        "     coalesce((SELECT max(happened_at) FROM interactions i WHERE i.org_id = o.id), o.created_at) < ?) AS quiet, "
        "  (o.kind = 'lead' AND o.status IN (%s) AND "
        "     (SELECT max(at) FROM status_history h WHERE h.org_id = o.id) < ?) AS stuck "
        "FROM organisations o" % (open_list, open_list),
        (today, quiet_before, stuck_before)).fetchall()
    out = []
    for r in rows:
        reasons = [k for k in ("overdue", "quiet", "stuck") if r[k]]
        if reasons:
            out.append({"org": orgs.get(conn, r["id"]), "reasons": reasons})
    out.sort(key=lambda x: (-len(x["reasons"]), x["org"]["name"].lower()))
    return out


def activity(conn: sqlite3.Connection, limit: int = 30) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM ("
        " SELECT 'interaction' AS kind, i.id, i.org_id, o.name AS org_name, o.slug AS org_slug, i.happened_at AS at, "
        "        i.type, i.summary, NULL AS from_status, NULL AS to_status, i.author_email AS by_email "
        " FROM interactions i JOIN organisations o ON o.id = i.org_id "
        " UNION ALL "
        " SELECT 'status', h.id, h.org_id, o.name, o.slug, h.at, NULL, NULL, h.from_status, h.to_status, h.by_email "
        " FROM status_history h JOIN organisations o ON o.id = h.org_id"
        ") ORDER BY at DESC, kind LIMIT ?", (limit,))
    return [row(r) for r in rows]
```

- [ ] **Step 4: Add the routes to `binder/api/misc.py`**

```python
from ..repo import feeds


@router.get("/attention")
def needs_attention(db: sqlite3.Connection = Depends(get_db)):
    return feeds.attention(db)


@router.get("/activity")
def recent_activity(limit: int = 30, db: sqlite3.Connection = Depends(get_db)):
    return feeds.activity(db, limit=min(max(limit, 1), 200))
```

- [ ] **Step 5: Run tests**

Run: `.venv/bin/pytest -v`
Expected: all pass. `test_activity_feed`: the interaction and the creation status row can share a timestamp to the microsecond only in theory. If the order flakes, compare by `kind` set rather than position.

- [ ] **Step 6: Commit**

```bash
git add binder tests
git commit -m "Needs-attention and activity feeds"
```

---

### Task 12: Run it for real

- [ ] **Step 1: Start locally**

Run: `BINDER_DB=/tmp/binder-dev.db .venv/bin/python -m binder &` then `curl -s localhost:8770/api/health` and `curl -s localhost:8770/api/whoami`
Expected: `{"ok":true}` and `{"email":"dev@binder.local",...}`

- [ ] **Step 2: Check the refusal paths**

Run: `BINDER_AUTH=heder .venv/bin/python -m binder; echo $?` → prints the error, exits 2.
Run: `BINDER_AUTH=header BINDER_HOST=0.0.0.0 .venv/bin/python -m binder; echo $?` → prints the error, exits 2.

- [ ] **Step 3: Stop the server and run the whole suite**

Run: `kill %1; .venv/bin/pytest -q`
Expected: all pass, 0 skipped.

- [ ] **Step 4: Add a README stub and commit**

`README.md`:

````markdown
# Binder

Leads and clients for Offdesk. Sibling to Bench: same sign-in, same Tenon design system.
Design: `docs/superpowers/specs/2026-11-11-binder-design.md`.

```
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
BINDER_DB=binder.db .venv/bin/python -m binder     # http://127.0.0.1:8770
```

`BINDER_AUTH=header` is the server behind nginx; unset is local development.
````

```bash
git add README.md
git commit -m "README: run and test"
```
