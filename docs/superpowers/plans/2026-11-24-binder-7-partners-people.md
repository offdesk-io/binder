# Binder 7: Partners and People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Binder a home for partners (organisations with `kind = partner`) and for people who matter without being a lead or client: optional organisation on a contact, a key-connector star, who introduced a lead, year-end thanks, and a nudge on Home for connectors gone quiet.

**Architecture:** One migration (`006_partners_people.sql`) rebuilds `organisations`, `contacts` and `interactions` and adds `thanks`. The repo layer (`binder/repo/`) gains the partner kind, `introduced_by` checks and reads, people without an organisation, logs against a person, a `thanks` module and a quiet-connector rule; routers in `binder/api/` stay thin. The web app gains Partners and People tabs, a Thanks checklist, an "Introduced by" picker on the organisation, and contact-page support for people with no organisation.

**Tech Stack:** Python 3.9, FastAPI, pydantic v2, SQLite (FTS5), pytest; React 18 + TypeScript + Vite, Tenon v0.22.0, react-router 6, Vitest + Testing Library, Playwright.

Spec: `docs/superpowers/specs/2026-11-24-binder-7-partners-people-design.md`.

---

## Rules for whoever builds this

- Never mention AI tools anywhere: code, comments, commits, PR text, docs.
- Commit messages are plain sentences. No trailers, no attribution lines of any kind.
- No real names or emails in code or tests: use `@example.com` addresses and made-up names.
- Before every commit run both suites and see them pass:
  `.venv/bin/pytest -q` and `(cd web && npm run check && npm test)`.
- Work on `feature/binder-7-partners-people`, branched from `main` once the docs
  branch `docs/binder-7-partners-people` (this plan and its spec) is merged.
  The controller opens the PR; do not open one yourself.
- Follow `CLAUDE.md`: Python 3.9 typing (`Optional`, `List`, `Dict`), repo/api
  layering, `BEGIN IMMEDIATE` on every write with `ROLLBACK` on failure,
  column names only from a `FIELDS` whitelist, stale PATCH is 409 with
  `current`, migrations never edited once deployed, Tenon components first,
  CSS tokens only, `types.ts` and the README API section change together, every
  fetch through `web/src/api/client.ts`, PATCH only what changed, vocabularies
  from `/api/meta`, one breakpoint (`useIsPhone`, 768px).
- Read a file before changing it. If a line quoted in an "Edit" step does not
  match the file, stop and look: do not guess.

## Before you start

```bash
git checkout main && git pull
git checkout -b feature/binder-7-partners-people
python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -e '.[dev]'
(cd web && npm ci)
.venv/bin/pytest -q && (cd web && npm run check && npm test)
```

Expected: everything passes on a clean `main`. Use `npm ci`, not an old `node_modules`: the lockfile pins
Tenon v0.22.0, and an older install fails `npm run check` on `AppHeader` and `Drawer`.

## File map

Backend

| File | Change | Responsibility |
|---|---|---|
| `binder/migrations/006_partners_people.sql` | create | Rebuild three tables, add `thanks`, recreate indexes and every search trigger |
| `binder/statuses.py` | rewrite | `partner` kind, `PARTNER_STATUSES`, transitions |
| `binder/schemas.py` | modify | Introduced-by fields, `PersonCreate`, contact `org_id`/`connector`/`postal_address`, `ThanksPut` |
| `binder/repo/__init__.py` | modify | `like()` helper for LIKE patterns |
| `binder/repo/orgs.py` | rewrite | `introduced_by` checks and reads, `introduced()`, delete keeps people |
| `binder/repo/contacts.py` | rewrite | Optional organisation, connector, postal address, `people()`, `connectors()`, moving between organisations |
| `binder/repo/interactions.py` | rewrite | Logs with no organisation, `create_for_contact()`, the org-or-person rule |
| `binder/repo/search.py` | rewrite | Hits with no organisation, `connector`, the person behind an organisation-less log |
| `binder/repo/research.py` | modify | Refuse research on a person with no organisation |
| `binder/repo/thanks.py` | create | Year checklist, upsert with stale check, delete |
| `binder/repo/feeds.py` | modify | Quiet connectors in `attention()` |
| `binder/api/orgs.py` | modify | `GET /orgs/{id}/introduced`, delete passes who |
| `binder/api/contacts.py` | rewrite | `GET /people`, `POST /contacts`, `GET /contacts/{id}/introduced` |
| `binder/api/interactions.py` | modify | `POST /contacts/{id}/interactions` |
| `binder/api/thanks.py` | create | `GET /thanks`, `PUT`/`DELETE /thanks/{contact_id}/{year}` |
| `binder/api/misc.py` | modify | `partner_statuses` in `/api/meta` |
| `binder/app.py` | modify | Mount the thanks router |

Backend tests: `tests/test_migration_006.py`, `tests/test_partners.py`, `tests/test_people.py`, `tests/test_person_logs.py`, `tests/test_thanks.py` (new); `tests/test_db.py`, `tests/test_status.py`, `tests/test_shapes.py`, `tests/test_bench_links.py`, `tests/test_feeds.py` (modified).

Frontend

| File | Change | Responsibility |
|---|---|---|
| `web/src/api/client.ts` | modify | `PUT` method |
| `web/src/api/types.ts` | modify | New shapes; nullable organisation on contacts, logs and hits; attention union |
| `web/src/api/endpoints.ts` | rewrite | New routes |
| `web/src/test/fixtures.ts`, `web/src/test/render.tsx` | modify | New fields, `person()`, `thanks()`, partner meta |
| `web/src/components/Star.tsx` | create | The key-connector star |
| `web/src/components/IntroducedSection.tsx` | create | What a person or partner brought in |
| `web/src/components/ContactForm.tsx` | rewrite | Organisation choice, Key connector, postal address, people on their own |
| `web/src/components/QuickLog.tsx` | modify | Log against a person; no summarise without an organisation |
| `web/src/components/OrgForm.tsx` | modify | Kind from meta, a starting kind, delete note |
| `web/src/components/StatusPicker.tsx` | rewrite | Partner statuses |
| `web/src/components/ConfirmDelete.tsx` | rewrite | Optional note on the second click |
| `web/src/app/newOrg.ts`, `web/src/app/Layout.tsx`, `web/src/app/App.tsx` | modify | New form opens with a kind; Partners and People tabs and routes |
| `web/src/pages/PartnersPage.tsx` | create | Partners list |
| `web/src/pages/PeoplePage.tsx` | create | People list with filters, reach buttons, New person, Thanks switch |
| `web/src/pages/people/ReachButtons.tsx`, `web/src/pages/people/ThanksView.tsx` | create | Email/Call/LinkedIn; the year checklist |
| `web/src/pages/ContactPage.tsx` | rewrite | Star toggle, no organisation, postal address, Introduced, log against the person |
| `web/src/pages/org/IntroducedBy.tsx` | create | Introduced-by link and picker |
| `web/src/pages/org/OrgDetail.tsx`, `web/src/pages/org/PeopleSection.tsx` | modify | Introduced by, partner Introduced section, stars, delete destination |
| `web/src/pages/ListPage.tsx`, `web/src/pages/PipelinePage.tsx` | modify | List without partners; opener call |
| `web/src/pages/HomePage.tsx`, `web/src/pages/SearchPage.tsx` | modify | Quiet connectors; hits with no organisation, star |
| `web/src/lib/format.ts`, `web/src/lib/colour.ts` | modify | `shortDay()`, quiet-connector text and tone |
| `web/src/styles.css` | modify | Star, address, reach buttons, thanks lines |
| `web/e2e/people.spec.ts` | create | Connector flow end to end |
| `README.md`, `CLAUDE.md` | modify | API section; plan list |

---

## Task 1: Migration 006

**Files:**
- Create: `binder/migrations/006_partners_people.sql`
- Create: `tests/test_migration_006.py`
- Modify: `tests/test_db.py:80-89` (the fake rebuild in `test_table_rebuild_migration_keeps_child_rows`)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_migration_006.py`:

```python
"""Migration 006 rebuilds organisations, contacts and interactions. A database
from before it keeps every row, its search index and its rules."""

import sqlite3

import pytest

from binder.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate

T = "2026-11-01T10:00:00.000000+00:00"
BRIEF = '{"overview": "Kilns and glaze"}'
OLD_COLUMNS = {
    "organisations": "id, slug, name, kind, status, summary, tags, created_at, updated_at, updated_by",
    "contacts": "id, org_id, name, role, is_primary, relationship, created_at, updated_at, updated_by",
    "interactions": "id, org_id, type, happened_at, summary, author_email",
    "interaction_contacts": "interaction_id, contact_id",
    "status_history": "id, org_id, from_status, to_status, at",
    "research": "id, org_id, contact_id, status, brief",
}


def _old_database(tmp_path, monkeypatch):
    """A database at version 5, the last one before 006, with one of everything in it."""
    mig = tmp_path / "migs5"
    mig.mkdir()
    for f in REAL_MIGRATIONS.glob("*.sql"):
        if int(f.name[:3]) <= 5:
            (mig / f.name).write_text(f.read_text())
    monkeypatch.setattr("binder.db.MIGRATIONS", mig)
    path = str(tmp_path / "old.db")
    conn = connect(path)
    migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 5
    conn.execute("INSERT INTO organisations(slug,name,kind,status,summary,tags,created_at,updated_at,updated_by)"
                 " VALUES ('acme','Acme','lead','lead','Ceramics in Porto','[]',?,?,'u')", (T, T))
    conn.execute("INSERT INTO organisations(slug,name,kind,status,tags,created_at,updated_at,updated_by)"
                 " VALUES ('bolt','Bolt','client','active','[]',?,?,'u')", (T, T))
    conn.execute("INSERT INTO contacts(org_id,name,role,is_primary,relationship,created_at,updated_at,updated_by)"
                 " VALUES (1,'Rui','Founder',1,'warm',?,?,'u')", (T, T))
    conn.execute("INSERT INTO contacts(org_id,name,created_at,updated_at,updated_by) VALUES (2,'Bo',?,?,'u')", (T, T))
    conn.execute("INSERT INTO interactions(org_id,type,happened_at,summary,author_email,created_at,updated_at,updated_by)"
                 " VALUES (1,'call',?,'Talked about the pop-up','u',?,?,'u')", (T, T, T))
    conn.execute("INSERT INTO interaction_contacts VALUES (1, 1)")
    conn.execute("INSERT INTO status_history(org_id,from_status,to_status,at,by_email) VALUES (1,NULL,'lead',?,'u')", (T,))
    conn.execute("INSERT INTO research(org_id,contact_id,status,brief,run_at,author_email)"
                 " VALUES (1,1,'running',?,?,'u')", (BRIEF, T))
    conn.execute("UPDATE research SET status = 'done' WHERE id = 1")  # research_au indexes it
    return conn, path


def _to_latest(conn, path, monkeypatch):
    monkeypatch.setattr("binder.db.MIGRATIONS", REAL_MIGRATIONS)
    migrate(conn, path)


def _snapshot(conn):
    out = {t: [tuple(r) for r in conn.execute("SELECT %s FROM %s ORDER BY 1, 2" % (cols, t))]
           for t, cols in OLD_COLUMNS.items()}
    out["search"] = [tuple(r) for r in conn.execute(
        "SELECT kind, ref_id, org_id, title, body FROM search ORDER BY kind, ref_id")]
    return out


def test_an_old_database_keeps_every_row_and_its_search_index(tmp_path, monkeypatch):
    conn, path = _old_database(tmp_path, monkeypatch)
    before = _snapshot(conn)
    assert len(before["search"]) == 6
    _to_latest(conn, path, monkeypatch)
    assert conn.execute("PRAGMA user_version").fetchone()[0] >= 6
    assert _snapshot(conn) == before
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert tuple(conn.execute("SELECT connector, postal_address FROM contacts WHERE id = 1").fetchone()) == (0, None)
    assert tuple(conn.execute(
        "SELECT introduced_by_contact_id, introduced_by_org_id FROM organisations WHERE id = 1").fetchone()) == (None, None)
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_the_search_triggers_work_on_all_three_tables(tmp_path, monkeypatch):
    conn, path = _old_database(tmp_path, monkeypatch)
    _to_latest(conn, path, monkeypatch)
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'")}
    assert {"org_ai", "org_au", "org_ad", "contact_ai", "contact_au", "contact_ad", "interaction_ai",
            "interaction_au", "interaction_ad", "research_au", "research_ad"} <= names
    conn.execute("UPDATE organisations SET name = 'Zebra' WHERE id = 1")
    assert [r[0] for r in conn.execute("SELECT title FROM search WHERE kind = 'org' AND ref_id = 1")] == ["Zebra"]
    conn.execute("INSERT INTO contacts(name,connector,created_at,updated_at,updated_by) VALUES ('Solo',1,?,?,'u')", (T, T))
    assert conn.execute("SELECT org_id FROM search WHERE kind = 'contact' AND title = 'Solo'").fetchone()[0] is None
    conn.execute("INSERT INTO interactions(org_id,type,happened_at,summary,author_email,created_at,updated_at,updated_by)"
                 " VALUES (NULL,'call',?,'Coffee with Solo','u',?,?,'u')", (T, T, T))
    assert [r[0] for r in conn.execute("SELECT title FROM search WHERE kind = 'interaction' ORDER BY ref_id")] == [
        "call 2026-11-01", "call 2026-11-01"]
    conn.execute("DELETE FROM interactions WHERE id = 2")
    assert conn.execute("SELECT count(*) FROM search WHERE kind = 'interaction'").fetchone()[0] == 1
    conn.execute("UPDATE research SET status = 'running' WHERE id = 1")
    conn.execute("UPDATE research SET status = 'done' WHERE id = 1")
    assert [r[0] for r in conn.execute("SELECT title FROM search WHERE kind = 'research'")] == ["Research brief: Rui"]


def test_the_rules_hold(tmp_path, monkeypatch):
    conn, path = _old_database(tmp_path, monkeypatch)
    _to_latest(conn, path, monkeypatch)
    ins = "INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,'u')"
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(ins, (1, "Second primary", 1, T, T))  # one primary per organisation
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(ins, (None, "Primary of nothing", 1, T, T))  # no organisation, no primary
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE contacts SET connector = 2 WHERE id = 2")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE organisations SET introduced_by_contact_id = 2, introduced_by_org_id = 2 WHERE id = 1")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE organisations SET kind = 'vendor' WHERE id = 1")
    conn.execute("UPDATE organisations SET kind = 'partner', status = 'prospect' WHERE id = 2")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO thanks(contact_id,year,created_at,updated_at,updated_by) VALUES (2,2026,?,?,'u'),"
                     " (2,2026,?,?,'u')", (T, T, T, T))
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
    assert {"contacts_org", "contacts_one_primary", "interactions_org"} <= names


def test_deleting_an_organisation_keeps_its_people(tmp_path, monkeypatch):
    conn, path = _old_database(tmp_path, monkeypatch)
    _to_latest(conn, path, monkeypatch)
    conn.execute("DELETE FROM organisations WHERE id = 2")  # Bo is not the one to talk to there
    assert conn.execute("SELECT org_id FROM contacts WHERE id = 2").fetchone()[0] is None
    assert conn.execute("SELECT org_id FROM search WHERE kind = 'contact' AND ref_id = 2").fetchone()[0] is None
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("DELETE FROM organisations WHERE id = 1")  # Rui is: the repo clears that first
    conn.execute("UPDATE contacts SET is_primary = 0 WHERE id = 1")
    conn.execute("DELETE FROM organisations WHERE id = 1")
    assert conn.execute("SELECT count(*) FROM interactions").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM contacts WHERE org_id IS NULL").fetchone()[0] == 2
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `.venv/bin/pytest -q tests/test_migration_006.py`
Expected: FAIL (the version stays 5; `no such column: connector`).

- [ ] **Step 3: Write the migration**

Create `binder/migrations/006_partners_people.sql`:

```sql
-- Binder 7: partners, people without an organisation, key connectors and
-- year-end thanks. Rebuilds organisations, contacts and interactions. A rebuild
-- drops a table's indexes and triggers, so every one of them is recreated
-- below. research_au reads contacts, and a table cannot be renamed while a
-- trigger names a table that is missing, so it is dropped first and recreated
-- at the end.

DROP TRIGGER research_au;

CREATE TABLE organisations_new (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  website        TEXT,
  sector         TEXT,
  size           TEXT,
  location       TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('lead','client','partner')),
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
  updated_by     TEXT NOT NULL,
  -- Who brought it in: one person or one partner, at most. The repo checks
  -- that introduced_by_org_id is a partner and not the organisation itself.
  introduced_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  introduced_by_org_id     INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
  CHECK (introduced_by_contact_id IS NULL OR introduced_by_org_id IS NULL)
);
INSERT INTO organisations_new (id, slug, name, website, sector, size, location, kind, status, owner_email, source,
                               value_estimate, tags, summary, next_step, next_step_due, created_at, updated_at, updated_by)
  SELECT id, slug, name, website, sector, size, location, kind, status, owner_email, source,
         value_estimate, tags, summary, next_step, next_step_due, created_at, updated_at, updated_by
  FROM organisations;
DROP TABLE organisations;
ALTER TABLE organisations_new RENAME TO organisations;
CREATE INDEX organisations_introduced_contact ON organisations(introduced_by_contact_id);
CREATE INDEX organisations_introduced_org ON organisations(introduced_by_org_id);

-- A person's organisation is optional. Deleting an organisation keeps its
-- people (the repo clears their primary flag first): someone with no
-- organisation cannot be the one to talk to.
CREATE TABLE contacts_new (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  role           TEXT,
  email          TEXT,
  phone          TEXT,
  linkedin_url   TEXT,
  notes          TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  relationship   TEXT CHECK (relationship IN ('cold','warm','strong')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL,
  connector      INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0,1)),
  postal_address TEXT,
  CHECK (org_id IS NOT NULL OR is_primary = 0)
);
INSERT INTO contacts_new (id, org_id, name, role, email, phone, linkedin_url, notes, is_primary, relationship,
                          created_at, updated_at, updated_by)
  SELECT id, org_id, name, role, email, phone, linkedin_url, notes, is_primary, relationship,
         created_at, updated_at, updated_by
  FROM contacts;
DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;
CREATE INDEX contacts_org ON contacts(org_id);
CREATE UNIQUE INDEX contacts_one_primary ON contacts(org_id) WHERE is_primary = 1;

-- A log may have no organisation: a call with a person who has none. The repo
-- makes sure it then has at least one person.
CREATE TABLE interactions_new (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER REFERENCES organisations(id) ON DELETE CASCADE,
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
INSERT INTO interactions_new (id, org_id, type, happened_at, summary, next_step, next_step_due, author_email,
                              created_at, updated_at, updated_by)
  SELECT id, org_id, type, happened_at, summary, next_step, next_step_due, author_email,
         created_at, updated_at, updated_by
  FROM interactions;
DROP TABLE interactions;
ALTER TABLE interactions_new RENAME TO interactions;
CREATE INDEX interactions_org ON interactions(org_id, happened_at);

-- Year-end thanks: one row per person and year.
CREATE TABLE thanks (
  id          INTEGER PRIMARY KEY,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  what        TEXT,
  sent_on     TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  UNIQUE (contact_id, year)
);

-- The search triggers, as 001 and 003 left them. A person or a log with no
-- organisation is indexed with a null org_id.
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
    new.type || ' ' || substr(new.happened_at, 1, 10), new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_au AFTER UPDATE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || substr(new.happened_at, 1, 10), new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_ad AFTER DELETE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
END;

-- As 004 wrote it.
CREATE TRIGGER research_au AFTER UPDATE OF status ON research WHEN new.status = 'done' BEGIN
  DELETE FROM search WHERE kind = 'research' AND ref_id = new.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('research', new.id, new.org_id,
    CASE WHEN new.contact_id IS NULL THEN 'Research brief'
         ELSE 'Research brief: ' || coalesce((SELECT name FROM contacts WHERE id = new.contact_id), '') END,
    coalesce(json_extract(new.brief, '$.overview'), '') || ' ' ||
    coalesce(json_extract(new.brief, '$.what_they_do'), '') || ' ' ||
    coalesce(json_extract(new.brief, '$.size_and_funding'), '') || ' ' ||
    coalesce(json_extract(new.brief, '$.offdesk_angle'), '') || ' ' ||
    coalesce((SELECT group_concat(value, ' ') FROM json_each(new.brief, '$.likely_needs')), '') || ' ' ||
    coalesce((SELECT group_concat(value, ' ') FROM json_each(new.brief, '$.open_questions')), '') || ' ' ||
    coalesce((SELECT group_concat(coalesce(json_extract(value, '$.name'), '') || ' ' ||
                                  coalesce(json_extract(value, '$.role'), ''), ' ')
              FROM json_each(new.brief, '$.people')), '') || ' ' ||
    coalesce((SELECT group_concat(json_extract(value, '$.headline'), ' ')
              FROM json_each(new.brief, '$.recent_news')), ''));
END;
```

- [ ] **Step 4: Bring the old rebuild test up to the new columns**

In `tests/test_db.py`, `test_table_rebuild_migration_keeps_child_rows` copies `organisations` with `SELECT *`, so its table needs the two new columns, in the same order (they sit at the end). Replace:

```python
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);\n"
```

with:

```python
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,"
        " introduced_by_contact_id INTEGER, introduced_by_org_id INTEGER);\n"
```

- [ ] **Step 5: Run the tests**

Run: `.venv/bin/pytest -q tests/test_migration_006.py tests/test_db.py`
Expected: PASS.

- [ ] **Step 6: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add binder/migrations/006_partners_people.sql tests/test_migration_006.py tests/test_db.py
git commit -m "Migration 006: partners, people without an organisation, thanks"
```

---

## Task 2: Partner statuses and introduced-by on organisations

**Files:**
- Modify: `binder/statuses.py` (rewrite)
- Modify: `binder/repo/__init__.py`
- Modify: `binder/repo/orgs.py` (rewrite)
- Modify: `binder/schemas.py:63-103` (`OrgCreate`, `OrgPatch`)
- Modify: `binder/api/orgs.py`
- Modify: `binder/api/misc.py:18-29`
- Create: `tests/test_partners.py`
- Modify: `tests/test_status.py`, `tests/test_shapes.py:39-51`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_status.py`:

```python


def test_partner_starts_as_prospect_and_keeps_its_kind():
    assert initial_status("partner") == "prospect"
    assert check_transition("partner", "active") == ("partner", "active")
    assert check_transition("partner", "past") == ("partner", "past")


def test_partner_cannot_take_a_lead_or_client_only_status():
    for status in ("won", "contacted", "paused"):
        with pytest.raises(Invalid):
            check_transition("partner", status)


def test_client_cannot_take_a_partner_only_status():
    with pytest.raises(Invalid):
        check_transition("client", "prospect")
```

In `tests/test_shapes.py`, `test_meta_lists_the_vocabularies`, add the partner list to the expected dict. Replace:

```python
        "client_statuses": list(statuses.CLIENT_STATUSES),
```

with:

```python
        "client_statuses": list(statuses.CLIENT_STATUSES),
        "partner_statuses": list(statuses.PARTNER_STATUSES),
```

Create `tests/test_partners.py`:

```python
"""Partners are organisations with kind `partner`. Any organisation can say who
introduced it: one person or one partner."""


def partner(client, name="Northwind Partners", **kw):
    r = client.post("/api/orgs", json=dict(kw, name=name, kind="partner"))
    assert r.status_code == 201, r.text
    return r.json()


def url(o):
    return "/api/orgs/%d" % o["id"]


def test_a_partner_is_an_organisation_with_partner_statuses(client):
    p = partner(client)
    assert (p["kind"], p["status"]) == ("partner", "prospect")
    r = client.patch(url(p), json={"updated_at": p["updated_at"], "status": "active"})
    assert (r.json()["kind"], r.json()["status"]) == ("partner", "active")
    assert client.patch(url(p), json={"updated_at": r.json()["updated_at"], "status": "won"}).status_code == 422
    client.post("/api/orgs", json={"name": "Plain lead"})
    assert [o["name"] for o in client.get("/api/orgs?kind=partner").json()] == ["Northwind Partners"]


def test_meta_serves_the_partner_kind_and_statuses(client):
    m = client.get("/api/meta").json()
    assert m["partner_statuses"] == ["prospect", "active", "past"]
    assert m["kinds"] == ["lead", "client", "partner"]


def test_an_unknown_kind_is_422(client):
    assert client.post("/api/orgs", json={"name": "X", "kind": "vendor"}).status_code == 422


def test_introduced_by_a_partner_is_read_back_with_its_name_and_slug(client, org):
    p = partner(client)
    r = client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["introduced_by"] == {"type": "partner", "id": p["id"], "name": "Northwind Partners", "slug": p["slug"]}
    listed = [o for o in client.get("/api/orgs").json() if o["id"] == org["id"]][0]
    assert listed["introduced_by"] == r.json()["introduced_by"]
    assert client.get(url(p)).json()["introduced_by"] is None


def test_introduced_by_a_person(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    o = client.post("/api/orgs", json={"name": "Brought In", "introduced_by_contact_id": rui["id"]}).json()
    assert o["introduced_by"] == {"type": "contact", "id": rui["id"], "name": "Rui"}
    assert (o["introduced_by_contact_id"], o["introduced_by_org_id"]) == (rui["id"], None)


def test_only_a_partner_that_exists_and_never_itself(client, org):
    lead = client.post("/api/orgs", json={"name": "Plain lead"}).json()
    base = {"updated_at": org["updated_at"]}
    assert client.patch(url(org), json=dict(base, introduced_by_org_id=lead["id"])).status_code == 422
    assert client.patch(url(org), json=dict(base, introduced_by_org_id=999)).status_code == 422
    assert client.patch(url(org), json=dict(base, introduced_by_contact_id=999)).status_code == 422
    p = partner(client)
    assert client.patch(url(p), json={"updated_at": p["updated_at"], "introduced_by_org_id": p["id"]}).status_code == 422


def test_one_introducer_at_most(client, org):
    p = partner(client)
    rui = client.post("/api/orgs/%d/contacts" % p["id"], json={"name": "Rui"}).json()
    both = client.post("/api/orgs", json={"name": "Both", "introduced_by_org_id": p["id"],
                                          "introduced_by_contact_id": rui["id"]})
    assert both.status_code == 422
    o = client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]}).json()
    # Setting the person while the stored partner stays would make two.
    r = client.patch(url(org), json={"updated_at": o["updated_at"], "introduced_by_contact_id": rui["id"]})
    assert r.status_code == 422
    swapped = client.patch(url(org), json={"updated_at": o["updated_at"], "introduced_by_contact_id": rui["id"],
                                           "introduced_by_org_id": None}).json()
    assert swapped["introduced_by"] == {"type": "contact", "id": rui["id"], "name": "Rui"}


def test_what_a_partner_introduced_and_what_its_clients_are_worth(client):
    p = partner(client)
    a = client.post("/api/orgs", json={"name": "Alpha", "kind": "client", "value_estimate": 3000,
                                       "introduced_by_org_id": p["id"]}).json()
    client.post("/api/orgs", json={"name": "Beta", "kind": "client", "value_estimate": 2000,
                                   "introduced_by_org_id": p["id"]})
    client.post("/api/orgs", json={"name": "Gamma", "value_estimate": 9000, "introduced_by_org_id": p["id"]})
    client.post("/api/orgs", json={"name": "Delta", "kind": "client", "value_estimate": 7000})
    got = client.get("/api/orgs/%d/introduced" % p["id"]).json()
    assert [o["name"] for o in got["orgs"]] == ["Alpha", "Beta", "Gamma"]
    assert got["orgs"][0] == {"id": a["id"], "name": "Alpha", "slug": a["slug"], "kind": "client",
                              "status": "active", "value_estimate": 3000}
    assert got["client_value"] == 5000
    assert client.get("/api/orgs/999/introduced").status_code == 404


def test_deleting_the_partner_clears_introduced_by(client, org):
    p = partner(client)
    client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]})
    assert client.delete(url(p)).status_code == 204
    assert client.get(url(org)).json()["introduced_by"] is None


def test_a_stale_introduced_by_save_is_409(client, org):
    p = partner(client)
    client.patch(url(org), json={"updated_at": org["updated_at"], "sector": "Retail"})
    r = client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]})
    assert r.status_code == 409
    assert r.json()["current"]["sector"] == "Retail"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `.venv/bin/pytest -q tests/test_status.py tests/test_partners.py tests/test_shapes.py`
Expected: FAIL (`Unknown kind 'partner'`, missing `partner_statuses`, extra fields forbidden).

- [ ] **Step 3: Rewrite `binder/statuses.py`**

```python
"""The vocabularies: pipeline statuses, client and partner statuses,
interaction types and contact relationships. One record per organisation; Won
flips a lead into a client. GET /api/meta serves these lists, so this file is
the one source."""

from typing import Tuple

from .errors import Invalid

KINDS = ("lead", "client", "partner")
LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent", "won", "lost", "parked")
OPEN_LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent")
CLIENT_STATUSES = ("active", "paused", "past")
PARTNER_STATUSES = ("prospect", "active", "past")
INTERACTION_TYPES = ("call", "email", "meeting", "note")
RELATIONSHIPS = ("cold", "warm", "strong")  # a contact's relationship may also be null

_INITIAL = {"lead": "lead", "client": "active", "partner": "prospect"}


def initial_status(kind: str) -> str:
    if kind not in KINDS:
        raise Invalid("Unknown kind %r" % kind)
    return _INITIAL[kind]


def check_transition(kind: str, new: str) -> Tuple[str, str]:
    """Return the (kind, status) to store. Transitions are unordered: a lead
    may move to any lead status (a lost lead can reopen), a client to any
    client status, a partner to any partner status. Only the kind limits the
    move. `won` is recorded in history but stored as an active client, a client
    never goes back to a lead, and a partner never changes kind."""
    if kind == "lead":
        if new not in LEAD_STATUSES:
            raise Invalid("%r is not a lead status" % new)
        if new == "won":
            return "client", "active"
        return "lead", new
    if kind == "partner":
        if new not in PARTNER_STATUSES:
            raise Invalid("%r is not a partner status" % new)
        return "partner", new
    if new not in CLIENT_STATUSES:
        raise Invalid("%r is not a client status" % new)
    return "client", new
```

- [ ] **Step 4: Add the LIKE helper to `binder/repo/__init__.py`**

Replace the whole file with:

```python
"""Data access. Plain functions: (conn, ...) -> dict. No HTTP here."""

import sqlite3
from typing import Any, Dict, Optional


def row(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(r) if r is not None else None


def like(q: str) -> str:
    """A LIKE pattern that finds `q` anywhere, with %, _ and the backslash taken
    literally. Use it with ESCAPE '\\'."""
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
```

- [ ] **Step 5: Rewrite `binder/repo/orgs.py`**

```python
import json
import re
import sqlite3
import unicodedata
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import check_transition, initial_status
from . import like, row

FIELDS = ("name", "website", "sector", "size", "location", "owner_email", "source",
          "value_estimate", "tags", "summary", "next_step", "next_step_due",
          "introduced_by_contact_id", "introduced_by_org_id")
# Who brought an organisation in: a person, or a partner. At most one is set.
INTRODUCED_BY = ("introduced_by_contact_id", "introduced_by_org_id")

LAST_CONTACT = "(SELECT max(happened_at) FROM interactions i WHERE i.org_id = o.id)"
# Every read of an organisation carries the name of who introduced it, and a partner's slug for the link.
SELECT = ("SELECT o.*, %s AS last_contact, ibc.name AS ib_contact_name, ibo.name AS ib_org_name, "
          "ibo.slug AS ib_org_slug FROM organisations o "
          "LEFT JOIN contacts ibc ON ibc.id = o.introduced_by_contact_id "
          "LEFT JOIN organisations ibo ON ibo.id = o.introduced_by_org_id " % LAST_CONTACT)


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
    if d is None:
        return d
    d["tags"] = json.loads(d["tags"])
    contact_name, org_name, org_slug = d.pop("ib_contact_name"), d.pop("ib_org_name"), d.pop("ib_org_slug")
    if d["introduced_by_contact_id"] is not None:
        d["introduced_by"] = {"type": "contact", "id": d["introduced_by_contact_id"], "name": contact_name}
    elif d["introduced_by_org_id"] is not None:
        d["introduced_by"] = {"type": "partner", "id": d["introduced_by_org_id"], "name": org_name, "slug": org_slug}
    else:
        d["introduced_by"] = None
    return d


def _history(conn, org_id: int, frm: Optional[str], to: str, by: str, at: str) -> None:
    conn.execute("INSERT INTO status_history(org_id, from_status, to_status, at, by_email) VALUES (?,?,?,?,?)",
                 (org_id, frm, to, at, by))


def _check_introducer(conn: sqlite3.Connection, org_id: Optional[int], contact_id: Optional[int],
                      partner_id: Optional[int]) -> None:
    """One person or one partner, at most, and a partner that is not the
    organisation itself. Runs inside the caller's write transaction."""
    if contact_id is not None and partner_id is not None:
        raise Invalid("Introduced by one person or one partner, not both")
    if contact_id is not None and conn.execute("SELECT 1 FROM contacts WHERE id = ?", (contact_id,)).fetchone() is None:
        raise Invalid("No person %d" % contact_id)
    if partner_id is not None:
        if partner_id == org_id:
            raise Invalid("An organisation cannot introduce itself")
        r = conn.execute("SELECT kind FROM organisations WHERE id = ?", (partner_id,)).fetchone()
        if r is None or r["kind"] != "partner":
            raise Invalid("Only a partner can introduce an organisation")


def get(conn: sqlite3.Connection, org_id: int) -> Dict[str, Any]:
    d = _out(conn.execute(SELECT + "WHERE o.id = ?", (org_id,)).fetchone())
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
    try:
        _check_introducer(conn, None, data.get("introduced_by_contact_id"), data.get("introduced_by_org_id"))
        slug = _unique_slug(conn, slugify(requested_slug or data["name"]))
        cur = conn.execute(
            "INSERT INTO organisations(slug, kind, status, created_at, updated_at, updated_by, %s) "
            "VALUES (?,?,?,?,?,?,%s)" % (", ".join(cols), ", ".join("?" * len(cols))),
            [slug, kind, status, at, at, by] + [data[c] for c in cols])
        _history(conn, cur.lastrowid, None, status, by, at)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, org_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, org_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        if any(k in patch for k in INTRODUCED_BY):
            # The pair as it will be after this save: a field left out keeps its stored value.
            after = {k: patch[k] if k in patch else current[k] for k in INTRODUCED_BY}
            _check_introducer(conn, org_id, after["introduced_by_contact_id"], after["introduced_by_org_id"])
        at = now()
        sets: Dict[str, Any] = {k: v for k, v in patch.items() if k in FIELDS}
        if "tags" in sets:
            sets["tags"] = json.dumps(sets["tags"] or [])
        new_status = patch.get("status")
        if new_status and new_status != current["status"]:
            kind, stored = check_transition(current["kind"], new_status)
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
        where.append("o.owner_email = ?"); args.append(owner.strip().lower())
    if tag:
        where.append("EXISTS (SELECT 1 FROM json_each(o.tags) WHERE value = ?)"); args.append(tag)
    if q:
        where.append("o.name LIKE ? ESCAPE '\\'"); args.append(like(q))
    order = {"updated": "o.updated_at DESC", "name": "o.name COLLATE NOCASE",
             "last_contact": "last_contact IS NULL, last_contact DESC",
             "value": "o.value_estimate IS NULL, o.value_estimate DESC"}.get(sort, "o.updated_at DESC")
    sql = SELECT + "%s ORDER BY %s" % (("WHERE " + " AND ".join(where)) if where else "", order)
    return [_out(r) for r in conn.execute(sql, args)]


def introduced(conn: sqlite3.Connection, column: str, ref_id: int) -> Dict[str, Any]:
    """What one person (`introduced_by_contact_id`) or one partner
    (`introduced_by_org_id`) brought in, A to Z, and what the clients among
    them are worth."""
    if column not in INTRODUCED_BY:
        raise ValueError("not an introduced-by column: %r" % column)
    found = [row(r) for r in conn.execute(
        "SELECT id, name, slug, kind, status, value_estimate FROM organisations WHERE %s = ? "
        "ORDER BY name COLLATE NOCASE" % column, (ref_id,))]
    return {"orgs": found,
            "client_value": sum(o["value_estimate"] or 0 for o in found if o["kind"] == "client")}


def status_history(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    get(conn, org_id)
    return [row(r) for r in conn.execute(
        "SELECT * FROM status_history WHERE org_id = ? ORDER BY at DESC, id DESC", (org_id,))]
```

- [ ] **Step 6: Accept the new fields in `binder/schemas.py`**

In `OrgCreate`, after `next_step_due: Optional[str] = None` (the one inside `OrgCreate`), add:

```python
    introduced_by_contact_id: Optional[int] = None
    introduced_by_org_id: Optional[int] = None
```

In `OrgPatch`, after its `next_step_due: Optional[str] = None`, add the same two lines:

```python
    introduced_by_contact_id: Optional[int] = None
    introduced_by_org_id: Optional[int] = None
```

- [ ] **Step 7: Add the introduced route to `binder/api/orgs.py`**

After the `history` route (`@router.get("/{org_id}/status-history")`), add:

```python
@router.get("/{org_id}/introduced")
def introduced_list(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    orgs.get(db, org_id)  # 404 for an unknown organisation
    return orgs.introduced(db, "introduced_by_org_id", org_id)
```

- [ ] **Step 8: Serve the partner statuses from `/api/meta`**

In `binder/api/misc.py`, replace:

```python
        "client_statuses": list(statuses.CLIENT_STATUSES),
```

with:

```python
        "client_statuses": list(statuses.CLIENT_STATUSES),
        "partner_statuses": list(statuses.PARTNER_STATUSES),
```

- [ ] **Step 9: Run the tests**

Run: `.venv/bin/pytest -q tests/test_status.py tests/test_partners.py tests/test_shapes.py tests/test_orgs.py`
Expected: PASS.

- [ ] **Step 10: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add binder/statuses.py binder/repo/__init__.py binder/repo/orgs.py binder/schemas.py binder/api/orgs.py binder/api/misc.py tests/test_status.py tests/test_shapes.py tests/test_partners.py
git commit -m "Partners: a partner kind with its own statuses, and who introduced an organisation"
```

---

## Task 3: People with or without an organisation

**Files:**
- Modify: `binder/repo/contacts.py` (rewrite)
- Modify: `binder/repo/orgs.py` (`delete`)
- Modify: `binder/repo/research.py:57-76` (`start`) and its imports
- Modify: `binder/schemas.py:106-133` (`ContactCreate`, `ContactPatch`, new `PersonCreate`)
- Modify: `binder/api/contacts.py` (rewrite), `binder/api/orgs.py` (`delete_org`)
- Create: `tests/test_people.py`
- Modify: `tests/test_bench_links.py:57`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_people.py`:

```python
"""People: a contact's organisation is optional. Key connectors carry a flag
and a postal address; /api/people lists everyone, connectors first."""

from tests.conftest import TEAM


def person(client, **kw):
    r = client.post("/api/contacts", json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def at(client, org, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def url(c):
    return "/api/contacts/%d" % c["id"]


def test_a_person_without_an_organisation(client):
    p = person(client, name="Marta", connector=True, postal_address="1 Example Street\nPorto")
    assert (p["org_id"], p["org_name"], p["org_slug"]) == (None, None, None)
    assert p["connector"] is True and p["postal_address"] == "1 Example Street\nPorto"
    assert client.get(url(p)).json() == p


def test_the_people_route_can_place_someone_at_an_organisation(client, org):
    p = person(client, name="Rui", org_id=org["id"])
    assert p["org_name"] == "Acme Studio"
    assert client.post("/api/contacts", json={"name": "X", "org_id": 999}).status_code == 404


def test_no_organisation_means_no_one_to_talk_to(client):
    assert client.post("/api/contacts", json={"name": "X", "is_primary": True}).status_code == 422


def test_moving_a_person_between_organisations_and_out(client, org):
    other = client.post("/api/orgs", json={"name": "Other"}).json()
    rui = at(client, org, name="Rui", is_primary=True)
    moved = client.patch(url(rui), json={"updated_at": rui["updated_at"], "org_id": other["id"]}).json()
    assert (moved["org_id"], moved["org_name"], moved["is_primary"]) == (other["id"], "Other", False)
    out = client.patch(url(rui), json={"updated_at": moved["updated_at"], "org_id": None}).json()
    assert (out["org_id"], out["org_slug"]) == (None, None)
    assert client.patch(url(rui), json={"updated_at": out["updated_at"], "is_primary": True}).status_code == 422
    assert client.patch(url(rui), json={"updated_at": out["updated_at"], "org_id": 999}).status_code == 422


def test_moving_in_as_the_one_to_talk_to_replaces_the_old_one(client, org):
    at(client, org, name="A", is_primary=True)
    solo = person(client, name="Solo")
    r = client.patch(url(solo), json={"updated_at": solo["updated_at"], "org_id": org["id"], "is_primary": True})
    assert r.json()["is_primary"] is True
    got = {c["name"]: c["is_primary"] for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()}
    assert got == {"A": False, "Solo": True}


def test_connector_and_postal_address_can_change_and_a_stale_save_is_409(client):
    p = person(client, name="Marta")
    assert p["connector"] is False and p["postal_address"] is None
    q = client.patch(url(p), json={"updated_at": p["updated_at"], "connector": True, "postal_address": "Porto"}).json()
    assert (q["connector"], q["postal_address"]) == (True, "Porto")
    assert client.patch(url(p), json={"updated_at": q["updated_at"], "connector": None}).status_code == 422
    assert client.patch(url(p), json={"updated_at": p["updated_at"], "role": "Chef"}).status_code == 409


def test_people_puts_connectors_first_then_a_to_z(client, org):
    at(client, org, name="Zoe")
    person(client, name="Yara", connector=True)
    person(client, name="Abel")
    person(client, name="Bea", connector=True)
    assert [p["name"] for p in client.get("/api/people").json()] == ["Bea", "Yara", "Abel", "Zoe"]
    assert [p["name"] for p in client.get("/api/people?connector=1").json()] == ["Bea", "Yara"]


def test_people_search_by_name_or_organisation(client, org):
    at(client, org, name="Zoe")
    person(client, name="Abel")
    assert [p["name"] for p in client.get("/api/people", params={"q": "acme"}).json()] == ["Zoe"]
    assert [p["name"] for p in client.get("/api/people", params={"q": "abe"}).json()] == ["Abel"]
    assert client.get("/api/people", params={"q": "%"}).json() == []


def test_people_carry_their_last_log_and_how_many_they_introduced(client, org):
    rui = at(client, org, name="Rui")
    client.post("/api/orgs/%d/interactions" % org["id"], json={
        "type": "call", "summary": "x", "contact_ids": [rui["id"]], "happened_at": "2026-09-12T10:00:00+00:00"})
    client.post("/api/orgs", json={"name": "Brought", "introduced_by_contact_id": rui["id"]})
    got = client.get("/api/people").json()[0]
    assert (got["name"], got["org_slug"], got["last_contact"], got["introduced_count"]) == (
        "Rui", "acme-studio", "2026-09-12T10:00:00.000000+00:00", 1)


def test_what_a_person_introduced(client):
    marta = person(client, name="Marta", connector=True)
    lead = client.post("/api/orgs", json={"name": "Lead Co", "value_estimate": 900,
                                          "introduced_by_contact_id": marta["id"]}).json()
    got = client.get("/api/contacts/%d/introduced" % marta["id"]).json()
    assert [o["slug"] for o in got["orgs"]] == [lead["slug"]]
    assert got["client_value"] == 0
    assert client.get("/api/contacts/999/introduced").status_code == 404


def test_deleting_an_organisation_keeps_its_people(client, org):
    rui = at(client, org, name="Rui", is_primary=True)
    assert client.delete("/api/orgs/%d" % org["id"]).status_code == 204
    kept = client.get(url(rui)).json()
    assert (kept["org_id"], kept["is_primary"], kept["updated_by"]) == (None, False, "ana@example.com")
    assert [p["name"] for p in client.get("/api/people").json()] == ["Rui"]


def test_a_person_without_an_organisation_cannot_be_researched(ai_client):
    solo = ai_client.post("/api/contacts", json={"name": "Solo"}).json()
    assert ai_client.post("/api/contacts/%d/research" % solo["id"]).status_code == 422
    assert ai_client.get("/api/contacts/%d/research" % solo["id"]).json() == []


def test_adding_a_person_needs_the_header(make_client):
    assert make_client().post("/api/contacts", json={"name": "X"}, headers=TEAM).status_code == 403
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `.venv/bin/pytest -q tests/test_people.py`
Expected: FAIL (`POST /api/contacts` is 405; `/api/people` is 404).

- [ ] **Step 3: Update the contact schemas in `binder/schemas.py`**

Replace the `ContactCreate` and `ContactPatch` classes (from `class ContactCreate(_Body):` through the line `    _linkedin = field_validator("linkedin_url")(web_url)` that ends `ContactPatch`) with:

```python
class ContactCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False
    relationship: Optional[str] = None
    connector: bool = False
    postal_address: Optional[str] = None

    _email = field_validator("email")(lower_email)
    _linkedin = field_validator("linkedin_url")(web_url)


class PersonCreate(ContactCreate):
    """A person added on their own: the organisation is optional."""
    org_id: Optional[int] = None


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
    connector: Optional[bool] = None
    postal_address: Optional[str] = None
    # Move the person to another organisation, or null for none.
    org_id: Optional[int] = None

    _required = field_validator("name", "is_primary", "connector")(not_null)
    _email = field_validator("email")(lower_email)
    _linkedin = field_validator("linkedin_url")(web_url)
```

- [ ] **Step 4: Rewrite `binder/repo/contacts.py`**

```python
import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import RELATIONSHIPS
from . import like, orgs, row

FIELDS = ("name", "role", "email", "phone", "linkedin_url", "notes", "is_primary", "relationship",
          "connector", "postal_address")
FLAGS = ("is_primary", "connector")  # stored as 0 or 1, read as booleans
SELECT = ("SELECT c.*, o.name AS org_name, o.slug AS org_slug FROM contacts c "
          "LEFT JOIN organisations o ON o.id = c.org_id ")
# When someone was last on a log, through the people each log was with.
LAST_TOUCH = ("(SELECT max(i.happened_at) FROM interactions i JOIN interaction_contacts ic "
              "ON ic.interaction_id = i.id WHERE ic.contact_id = c.id)")
INTRODUCED_COUNT = "(SELECT count(*) FROM organisations x WHERE x.introduced_by_contact_id = c.id)"
NO_ORG_PRIMARY = "Only someone at an organisation can be the one to talk to"


def _out(r) -> Dict[str, Any]:
    d = row(r)
    for k in FLAGS:
        d[k] = bool(d[k])
    return d


def _value(k: str, v: Any) -> Any:
    return int(v) if k in FLAGS else v


def _check(data: Dict[str, Any]) -> None:
    if data.get("relationship") not in (None,) + RELATIONSHIPS:
        raise Invalid("relationship must be cold, warm or strong")


def get(conn: sqlite3.Connection, contact_id: int) -> Dict[str, Any]:
    r = conn.execute(SELECT + "WHERE c.id = ?", (contact_id,)).fetchone()
    if r is None:
        raise NotFound("No contact %d" % contact_id)
    return _out(r)


def list_for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    orgs.get(conn, org_id)
    return [_out(r) for r in conn.execute(
        SELECT + "WHERE c.org_id = ? ORDER BY c.is_primary DESC, c.name COLLATE NOCASE", (org_id,))]


def connectors(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Every key connector, A to Z."""
    return [_out(r) for r in conn.execute(SELECT + "WHERE c.connector = 1 ORDER BY c.name COLLATE NOCASE")]


def people(conn: sqlite3.Connection, connector: bool = False, q: Optional[str] = None) -> List[Dict[str, Any]]:
    """Everyone, with or without an organisation: connectors first, then A to Z.
    Each carries `last_contact` (their newest log) and `introduced_count`."""
    where, args = [], []  # type: List[str], List[Any]
    if connector:
        where.append("c.connector = 1")
    if q:
        where.append("(c.name LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')")
        args += [like(q), like(q)]
    sql = ("SELECT c.*, o.name AS org_name, o.slug AS org_slug, %s AS last_contact, %s AS introduced_count "
           "FROM contacts c LEFT JOIN organisations o ON o.id = c.org_id %s "
           "ORDER BY c.connector DESC, c.name COLLATE NOCASE") % (
        LAST_TOUCH, INTRODUCED_COUNT, ("WHERE " + " AND ".join(where)) if where else "")
    return [_out(r) for r in conn.execute(sql, args)]


def _clear_primary(conn, org_id: int, keep: int) -> None:
    conn.execute("UPDATE contacts SET is_primary = 0 WHERE org_id = ? AND id != ?", (org_id, keep))


def create(conn: sqlite3.Connection, org_id: Optional[int], data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """A person at `org_id`, or on their own when it is None."""
    _check(data)
    if org_id is None and data.get("is_primary"):
        raise Invalid(NO_ORG_PRIMARY)
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN IMMEDIATE")
    try:
        if org_id is not None:
            orgs.get(conn, org_id)  # checked under the write lock, so the org cannot vanish before the insert
            if data.get("is_primary"):
                _clear_primary(conn, org_id, 0)  # before the insert: a unique index allows one primary
        cur = conn.execute(
            "INSERT INTO contacts(org_id, created_at, updated_at, updated_by, %s) VALUES (?,?,?,?,%s)"
            % (", ".join(cols), ", ".join("?" * len(cols))),
            [org_id, at, at, by] + [_value(c, data[c]) for c in cols])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, contact_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    _check(patch)
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, contact_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        sets = {k: _value(k, v) for k, v in patch.items() if k in FIELDS}
        org_id = current["org_id"]
        if "org_id" in patch and patch["org_id"] != org_id:
            org_id = patch["org_id"]
            if org_id is not None and conn.execute(
                    "SELECT 1 FROM organisations WHERE id = ?", (org_id,)).fetchone() is None:
                raise Invalid("No organisation %d" % org_id)
            sets["org_id"] = org_id
            # Being the one to talk to belongs to the old organisation, unless this save says otherwise.
            sets.setdefault("is_primary", 0)
        if sets.get("is_primary", int(current["is_primary"])) and org_id is None:
            raise Invalid(NO_ORG_PRIMARY)
        if sets.get("is_primary"):
            _clear_primary(conn, org_id, contact_id)  # before the update, see create()
        sets["updated_at"], sets["updated_by"] = now(), by
        conn.execute("UPDATE contacts SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [contact_id])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, contact_id)


def delete(conn: sqlite3.Connection, contact_id: int) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        if conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,)).rowcount == 0:
            raise NotFound("No contact %d" % contact_id)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
```

`sets` keys come from `FIELDS` plus `org_id`, `updated_at` and `updated_by`, all fixed names, so only whitelisted column names reach the SQL.

- [ ] **Step 5: Keep people when an organisation is deleted (`binder/repo/orgs.py`)**

Replace the `delete` function with:

```python
def delete(conn: sqlite3.Connection, org_id: int, by: str) -> None:
    """Deletes the organisation with its log, research and Bench links. Its
    people stay, without an organisation, and none of them is the one to talk
    to any more (a person with no organisation cannot be)."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("UPDATE contacts SET org_id = NULL, is_primary = 0, updated_at = ?, updated_by = ? "
                     "WHERE org_id = ?", (now(), by, org_id))
        if conn.execute("DELETE FROM organisations WHERE id = ?", (org_id,)).rowcount == 0:
            raise NotFound("No organisation %d" % org_id)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
```

In `binder/api/orgs.py`, replace the `delete_org` route with:

```python
@router.delete("/{org_id}", status_code=204)
def delete_org(org_id: int, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    orgs.delete(db, org_id, who.email)
    return Response(status_code=204)
```

In `tests/test_bench_links.py`, `test_deleting_the_org_drops_its_links`, replace:

```python
    orgs.delete(conn, acme["id"])
```

with:

```python
    orgs.delete(conn, acme["id"], "ana@example.com")
```

- [ ] **Step 6: Refuse research on a person with no organisation (`binder/repo/research.py`)**

Replace the import line:

```python
from ..errors import Conflict, NotFound
```

with:

```python
from ..errors import Conflict, Invalid, NotFound
```

In `start`, replace:

```python
        if contact_id is not None:
            org_id = contacts.get(conn, contact_id)["org_id"]
        else:
```

with:

```python
        if contact_id is not None:
            org_id = contacts.get(conn, contact_id)["org_id"]
            if org_id is None:
                raise Invalid("Add this person to an organisation before researching them")
        else:
```

- [ ] **Step 7: Rewrite `binder/api/contacts.py`**

```python
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import contacts, orgs
from ..schemas import ContactCreate, ContactPatch, PersonCreate

router = APIRouter()


@router.get("/orgs/{org_id}/contacts")
def list_contacts(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.list_for_org(db, org_id)


@router.post("/orgs/{org_id}/contacts", status_code=201)
def add_contact(org_id: int, body: ContactCreate, db: sqlite3.Connection = Depends(get_db),
                who: Identity = Depends(guard)):
    return contacts.create(db, org_id, body.model_dump(), who.email)


@router.get("/people")
def list_people(connector: bool = False, q: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
    return contacts.people(db, connector=connector, q=q[:200] if q else None)


@router.post("/contacts", status_code=201)
def add_person(body: PersonCreate, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    data = body.model_dump()
    org_id = data.pop("org_id")
    return contacts.create(db, org_id, data, who.email)


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


@router.get("/contacts/{contact_id}/introduced")
def contact_introduced(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    contacts.get(db, contact_id)  # 404 for an unknown person
    return orgs.introduced(db, "introduced_by_contact_id", contact_id)
```

- [ ] **Step 8: Run the tests**

Run: `.venv/bin/pytest -q tests/test_people.py tests/test_contacts.py tests/test_bench_links.py tests/test_research.py tests/test_research_repo.py tests/test_shapes.py`
Expected: PASS.

- [ ] **Step 9: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add binder/repo/contacts.py binder/repo/orgs.py binder/repo/research.py binder/schemas.py binder/api/contacts.py binder/api/orgs.py tests/test_people.py tests/test_bench_links.py
git commit -m "People: contacts without an organisation, key connectors and the people list"
```

---

## Task 4: Logs against a person, and search without an organisation

**Files:**
- Modify: `binder/repo/interactions.py` (rewrite)
- Modify: `binder/repo/contacts.py` (`delete`)
- Modify: `binder/repo/search.py` (rewrite)
- Modify: `binder/api/interactions.py`
- Create: `tests/test_person_logs.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_person_logs.py`:

```python
"""A log can be about a person with no organisation. It then needs at least
one person. Search finds people and logs with no organisation."""

import pytest

from binder.db import connect
from binder.errors import Invalid
from binder.repo import interactions


def solo(client, name="Marta"):
    r = client.post("/api/contacts", json={"name": name, "connector": True})
    assert r.status_code == 201, r.text
    return r.json()


def log_with(client, c, **kw):
    kw.setdefault("type", "call")
    kw.setdefault("summary", "Coffee in Porto")
    r = client.post("/api/contacts/%d/interactions" % c["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_a_log_with_a_person_who_has_no_organisation(client):
    m = solo(client)
    i = log_with(client, m)
    assert (i["org_id"], i["contact_ids"], i["author_email"]) == (None, [m["id"]], "ana@example.com")
    assert [x["summary"] for x in client.get("/api/contacts/%d/interactions" % m["id"]).json()] == ["Coffee in Porto"]


def test_a_log_with_a_person_at_an_organisation_belongs_to_it(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    bo = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo"}).json()
    i = log_with(client, rui, summary="Lunch", contact_ids=[bo["id"]])
    assert (i["org_id"], i["contact_ids"]) == (org["id"], sorted([rui["id"], bo["id"]]))
    assert [x["summary"] for x in client.get("/api/orgs/%d/interactions" % org["id"]).json()] == ["Lunch"]


def test_others_on_a_person_log_follow_the_organisation_rule(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    m = solo(client)
    r = client.post("/api/contacts/%d/interactions" % rui["id"],
                    json={"type": "note", "summary": "x", "contact_ids": [m["id"]]})
    assert r.status_code == 422


def test_a_log_with_a_missing_person_is_404(client):
    assert client.post("/api/contacts/999/interactions", json={"type": "call", "summary": "x"}).status_code == 404


def test_a_log_without_an_organisation_must_keep_someone(client):
    m = solo(client)
    i = log_with(client, m)
    r = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "contact_ids": []})
    assert r.status_code == 422
    conn = connect(client.app.state.settings.db_path)
    with pytest.raises(Invalid):
        interactions.create(conn, None, {"type": "call", "summary": "x"}, "ana@example.com")
    assert not conn.in_transaction


def test_a_log_kept_only_by_a_deleted_person_goes_with_them(client):
    m, n = solo(client, "Marta"), solo(client, "Nuno")
    alone = log_with(client, m, summary="Just Marta")
    log_with(client, m, summary="Both", contact_ids=[n["id"]])
    assert client.delete("/api/contacts/%d" % m["id"]).status_code == 204
    assert [x["summary"] for x in client.get("/api/contacts/%d/interactions" % n["id"]).json()] == ["Both"]
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM interactions WHERE id = ?", (alone["id"],)).fetchone()[0] == 0


def test_search_finds_people_and_logs_with_no_organisation(client):
    m = solo(client, "Marta Quintela")
    log_with(client, m, summary="Talked about azulejos")
    hit = client.get("/api/search?q=quintela").json()[0]
    assert (hit["kind"], hit["id"], hit["org_id"], hit["org_name"], hit["org_slug"], hit["org_status"],
            hit["connector"]) == ("contact", m["id"], None, None, None, None, True)
    log = client.get("/api/search?q=azulejos").json()[0]
    assert (log["kind"], log["org_id"], log["contact_id"]) == ("interaction", None, m["id"])


def test_search_finds_partners_and_people_kept_after_their_organisation_goes(client, org):
    client.post("/api/orgs", json={"name": "Northwind Partners", "kind": "partner"})
    assert [(h["kind"], h["org_status"]) for h in client.get("/api/search?q=northwind").json()] == [("org", "prospect")]
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui Kept"}).json()
    client.delete("/api/orgs/%d" % org["id"])
    hits = client.get("/api/search?q=kept").json()
    assert [(h["kind"], h["id"], h["org_id"]) for h in hits] == [("contact", rui["id"], None)]


def test_other_hits_are_not_connectors(client, org):
    hits = client.get("/api/search?q=acme").json()
    assert hits and all(h["connector"] is False for h in hits)
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `.venv/bin/pytest -q tests/test_person_logs.py`
Expected: FAIL (`POST /api/contacts/{id}/interactions` is 405; search has no `connector`).

- [ ] **Step 3: Rewrite `binder/repo/interactions.py`**

```python
import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import INTERACTION_TYPES as TYPES
from . import orgs, row

FIELDS = ("type", "summary", "happened_at", "next_step", "next_step_due")
NEEDS_SOMEONE = "A log needs an organisation or at least one person"


def _with_contacts(conn, d: Dict[str, Any]) -> Dict[str, Any]:
    d["contact_ids"] = [r[0] for r in conn.execute(
        "SELECT contact_id FROM interaction_contacts WHERE interaction_id = ? ORDER BY contact_id", (d["id"],))]
    return d


def _check(conn, org_id: Optional[int], data: Dict[str, Any]) -> None:
    if "type" in data and data["type"] not in TYPES:
        raise Invalid("type must be one of %s" % ", ".join(TYPES))
    ids = data.get("contact_ids") or []
    if not ids:
        return
    marks = ",".join("?" * len(ids))
    if org_id is None:
        # A log with no organisation is about its people, wherever they are now.
        found = conn.execute("SELECT count(*) FROM contacts WHERE id IN (%s)" % marks, list(ids)).fetchone()[0]
        if found != len(set(ids)):
            raise Invalid("Every person on the log must be in Binder")
        return
    found = conn.execute("SELECT count(*) FROM contacts WHERE org_id = ? AND id IN (%s)" % marks,
                         [org_id] + list(ids)).fetchone()[0]
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
    if conn.execute("SELECT id FROM contacts WHERE id = ?", (contact_id,)).fetchone() is None:
        raise NotFound("No contact %d" % contact_id)
    return [_with_contacts(conn, row(r)) for r in conn.execute(
        "SELECT i.* FROM interactions i JOIN interaction_contacts ic ON ic.interaction_id = i.id "
        "WHERE ic.contact_id = ? ORDER BY i.happened_at DESC, i.id DESC", (contact_id,))]


def _insert(conn: sqlite3.Connection, org_id: Optional[int], data: Dict[str, Any], by: str, at: str) -> int:
    """Inside the caller's write transaction, so the checks and the insert see the same rows."""
    if org_id is not None:
        orgs.get(conn, org_id)
    elif not data.get("contact_ids"):
        raise Invalid(NEEDS_SOMEONE)
    _check(conn, org_id, data)  # contact ownership is checked under the write lock
    cols = [f for f in FIELDS if f in data]
    cur = conn.execute(
        "INSERT INTO interactions(org_id, author_email, created_at, updated_at, updated_by, %s) "
        "VALUES (?,?,?,?,?,%s)" % (", ".join(cols), ", ".join("?" * len(cols))),
        [org_id, by, at, at, by] + [data[c] for c in cols])
    _set_contacts(conn, cur.lastrowid, data.get("contact_ids") or [])
    return cur.lastrowid


def create(conn: sqlite3.Connection, org_id: Optional[int], data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """A log for `org_id`, or, when it is None, about the people in `contact_ids` alone."""
    at = now()
    data["happened_at"] = data.get("happened_at") or at
    conn.execute("BEGIN IMMEDIATE")
    try:
        new_id = _insert(conn, org_id, data, by, at)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, new_id)


def create_for_contact(conn: sqlite3.Connection, contact_id: int, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """A log against one person: they are on it, and it belongs to their organisation if they have one."""
    at = now()
    data["happened_at"] = data.get("happened_at") or at
    conn.execute("BEGIN IMMEDIATE")
    try:
        r = conn.execute("SELECT org_id FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if r is None:
            raise NotFound("No contact %d" % contact_id)
        data["contact_ids"] = sorted(set(data.get("contact_ids") or []) | {contact_id})
        new_id = _insert(conn, r["org_id"], data, by, at)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, new_id)


def update(conn: sqlite3.Connection, interaction_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, interaction_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        _check(conn, current["org_id"], patch)
        if current["org_id"] is None and patch.get("contact_ids") == []:
            raise Invalid(NEEDS_SOMEONE)
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

- [ ] **Step 4: A deleted person takes the logs only they kept (`binder/repo/contacts.py`)**

Replace the `delete` function with:

```python
def delete(conn: sqlite3.Connection, contact_id: int) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        # A log with no organisation is held by its people: one left with nobody goes with its last person.
        conn.execute(
            "DELETE FROM interactions WHERE org_id IS NULL "
            "AND id IN (SELECT interaction_id FROM interaction_contacts WHERE contact_id = ?) "
            "AND NOT EXISTS (SELECT 1 FROM interaction_contacts ic "
            "                WHERE ic.interaction_id = interactions.id AND ic.contact_id != ?)",
            (contact_id, contact_id))
        if conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,)).rowcount == 0:
            raise NotFound("No contact %d" % contact_id)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
```

- [ ] **Step 5: Add the route to `binder/api/interactions.py`**

After the `contact_interactions` route, add:

```python
@router.post("/contacts/{contact_id}/interactions", status_code=201)
def log_with_person(contact_id: int, body: InteractionCreate, db: sqlite3.Connection = Depends(get_db),
                    who: Identity = Depends(guard)):
    return interactions.create_for_contact(db, contact_id, body.model_dump(), who.email)
```

- [ ] **Step 6: Rewrite `binder/repo/search.py`**

```python
"""Full-text search over organisations, contacts, interactions and research briefs.
Each word becomes a quoted prefix term, so user input can never be read as FTS5 syntax."""

import sqlite3
from typing import Any, Dict, List


def _match(q: str) -> str:
    terms = ["".join(ch for ch in t if ch.isprintable() and ch != '"') for t in q.split()]
    return " ".join('"%s"*' % t for t in terms if t)


def query(conn: sqlite3.Connection, q: str, limit: int = 50) -> List[Dict[str, Any]]:
    """A person or a log with no organisation has null org_id, org_name,
    org_slug and org_status. `contact_id` is the person a research brief is
    about, or the first person on a log with no organisation. `connector` is
    true for a person who is a key connector."""
    match = _match(q or "")
    if not match:
        return []
    rows = conn.execute(
        "SELECT s.kind, s.ref_id AS id, s.org_id, s.title, o.name AS org_name, o.slug AS org_slug, "
        "o.status AS org_status, "
        "CASE WHEN s.kind = 'research' THEN r.contact_id "
        "     WHEN s.kind = 'interaction' AND s.org_id IS NULL THEN "
        "       (SELECT min(ic.contact_id) FROM interaction_contacts ic WHERE ic.interaction_id = s.ref_id) "
        "END AS contact_id, "
        "coalesce(c.connector, 0) AS connector, "
        "snippet(search, 4, char(2), char(3), '…', 12) AS snippet "
        "FROM search s LEFT JOIN organisations o ON o.id = s.org_id "
        "LEFT JOIN research r ON s.kind = 'research' AND r.id = s.ref_id "
        "LEFT JOIN contacts c ON s.kind = 'contact' AND c.id = s.ref_id "
        "WHERE search MATCH ? ORDER BY rank LIMIT ?", (match, limit))
    return [dict(r, id=int(r["id"]), org_id=None if r["org_id"] is None else int(r["org_id"]),
                 connector=bool(r["connector"])) for r in rows]
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest -q tests/test_person_logs.py tests/test_interactions.py tests/test_search.py tests/test_research_repo.py tests/test_import.py tests/test_import_sheet.py`
Expected: PASS.

- [ ] **Step 8: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add binder/repo/interactions.py binder/repo/contacts.py binder/repo/search.py binder/api/interactions.py tests/test_person_logs.py
git commit -m "Logs against a person, with or without an organisation, and search for them"
```

---

## Task 5: Year-end thanks

**Files:**
- Create: `binder/repo/thanks.py`
- Create: `binder/api/thanks.py`
- Modify: `binder/schemas.py` (new `ThanksPut`)
- Modify: `binder/app.py:13` and `:73-75`
- Create: `tests/test_thanks.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_thanks.py`:

```python
"""Year-end thanks: one row per person and year, saying what was sent and when."""

import datetime
import sqlite3
import zoneinfo

import pytest

from binder.db import connect

YEAR = 2026


def connector(client, name, **kw):
    r = client.post("/api/contacts", json=dict(kw, name=name, connector=True))
    assert r.status_code == 201, r.text
    return r.json()


def put(client, c, year=YEAR, **body):
    return client.put("/api/thanks/%d/%d" % (c["id"], year), json=body)


def test_a_year_lists_every_connector_with_their_row_or_none(client, org):
    marta = connector(client, "Marta", postal_address="1 Example Street")
    connector(client, "Bea")
    client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Not a connector"})
    put(client, marta, what="Port wine")
    got = client.get("/api/thanks?year=2026").json()
    assert [(r["contact"]["name"], r["thanks"] and r["thanks"]["what"]) for r in got] == [
        ("Bea", None), ("Marta", "Port wine")]
    assert got[1]["contact"]["postal_address"] == "1 Example Street"
    assert client.get("/api/thanks?year=2025").json()[1]["thanks"] is None


def test_put_creates_the_row_then_changes_only_what_it_is_given(client):
    m = connector(client, "Marta")
    r = put(client, m, what="Port wine")
    assert r.status_code == 200, r.text
    first = r.json()
    assert (first["contact_id"], first["year"], first["what"], first["sent_on"], first["note"],
            first["updated_by"]) == (m["id"], 2026, "Port wine", None, None, "ana@example.com")
    second = put(client, m, updated_at=first["updated_at"], sent_on="2026-12-15").json()
    assert (second["what"], second["sent_on"]) == ("Port wine", "2026-12-15")
    third = put(client, m, updated_at=second["updated_at"], sent_on=None).json()
    assert third["sent_on"] is None


def test_one_row_per_person_and_year(client):
    m = connector(client, "Marta")
    put(client, m, what="Wine")
    assert put(client, m, what="Cheese").status_code == 409  # a second create is a stale save
    assert put(client, m, year=2025, what="Cheese").status_code == 200
    conn = connect(client.app.state.settings.db_path)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO thanks(contact_id, year, created_at, updated_at, updated_by)"
                     " VALUES (?, 2026, 't', 't', 'u')", (m["id"],))


def test_a_stale_save_is_409_with_the_row_as_it_is_now(client):
    m = connector(client, "Marta")
    first = put(client, m, what="Wine").json()
    put(client, m, updated_at=first["updated_at"], what="Cheese")
    r = put(client, m, updated_at=first["updated_at"], note="late")
    assert r.status_code == 409
    assert r.json()["current"]["what"] == "Cheese"


def test_delete_removes_the_row(client):
    m = connector(client, "Marta")
    put(client, m, what="Wine")
    assert client.delete("/api/thanks/%d/2026" % m["id"]).status_code == 204
    assert client.delete("/api/thanks/%d/2026" % m["id"]).status_code == 404
    assert client.get("/api/thanks?year=2026").json()[0]["thanks"] is None


def test_bad_input_is_refused(client):
    m = connector(client, "Marta")
    assert put(client, m, sent_on="soon").status_code == 422
    assert put(client, m, year=1999, what="x").status_code == 422
    assert put(client, {"id": 999}, what="x").status_code == 404
    assert client.get("/api/thanks?year=3000").status_code == 422


def test_deleting_the_person_removes_their_thanks(client):
    m = connector(client, "Marta")
    put(client, m, what="Wine")
    client.delete("/api/contacts/%d" % m["id"])
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_the_year_defaults_to_this_one(client):
    this = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Lisbon")).year
    m = connector(client, "Marta")
    put(client, m, year=this, what="Wine")
    assert client.get("/api/thanks").json()[0]["thanks"]["year"] == this


def test_writes_need_the_header(make_client):
    from tests.conftest import TEAM
    assert make_client().put("/api/thanks/1/2026", json={}, headers=TEAM).status_code == 403
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `.venv/bin/pytest -q tests/test_thanks.py`
Expected: FAIL (404 on `/api/thanks`).

- [ ] **Step 3: Add `ThanksPut` to `binder/schemas.py`**

After the `InteractionPatch` class, add:

```python
class ThanksPut(_Body):
    """Creates or changes one person's thanks for one year. `updated_at` is the
    row's as it was loaded, left out (or null) when there was no row yet."""
    updated_at: Optional[str] = None
    what: Optional[str] = Field(default=None, max_length=200)
    sent_on: Optional[str] = None
    note: Optional[str] = None

    _sent = field_validator("sent_on")(iso_date)
```

- [ ] **Step 4: Create `binder/repo/thanks.py`**

```python
"""Year-end thanks: at most one row per person and year, saying what was sent and when."""

import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, NotFound
from . import contacts, row

FIELDS = ("what", "sent_on", "note")


def _get(conn: sqlite3.Connection, contact_id: int, year: int) -> Optional[Dict[str, Any]]:
    return row(conn.execute("SELECT * FROM thanks WHERE contact_id = ? AND year = ?", (contact_id, year)).fetchone())


def for_year(conn: sqlite3.Connection, year: int) -> List[Dict[str, Any]]:
    """Every key connector, A to Z, with their row for `year`, or None when there is none yet."""
    rows = {r["contact_id"]: row(r) for r in conn.execute("SELECT * FROM thanks WHERE year = ?", (year,))}
    return [{"contact": c, "thanks": rows.get(c["id"])} for c in contacts.connectors(conn)]


def put(conn: sqlite3.Connection, contact_id: int, year: int, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """Creates or changes the row; only the fields given change. `updated_at`
    must be the row's as loaded, or None when there was no row: anything else
    is a stale save, answered with the row as it is now (which may be None)."""
    expected = data.pop("updated_at", None)
    at = now()
    conn.execute("BEGIN IMMEDIATE")
    try:
        contacts.get(conn, contact_id)  # 404 for an unknown person
        current = _get(conn, contact_id, year)
        if (current["updated_at"] if current else None) != expected:
            raise Conflict(current)
        sets = {k: data[k] for k in FIELDS if k in data}
        if current is None:
            cols = list(sets)
            conn.execute(
                "INSERT INTO thanks(contact_id, year, created_at, updated_at, updated_by%s) VALUES (?,?,?,?,?%s)"
                % ("".join(", " + c for c in cols), ",?" * len(cols)),
                [contact_id, year, at, at, by] + [sets[c] for c in cols])
        else:
            sets["updated_at"], sets["updated_by"] = at, by
            conn.execute("UPDATE thanks SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                         list(sets.values()) + [current["id"]])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return _get(conn, contact_id, year)


def delete(conn: sqlite3.Connection, contact_id: int, year: int) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        if conn.execute("DELETE FROM thanks WHERE contact_id = ? AND year = ?", (contact_id, year)).rowcount == 0:
            raise NotFound("No thanks for person %d in %d" % (contact_id, year))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
```

- [ ] **Step 5: Create `binder/api/thanks.py`**

```python
"""Year-end thanks for key connectors: a year's checklist, one person's row, and removing it."""

import datetime
import sqlite3
import zoneinfo
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import thanks
from ..schemas import ThanksPut

router = APIRouter(prefix="/thanks")


@router.get("")
def year_list(request: Request, year: Optional[int] = Query(default=None, ge=2000, le=2100),
              db: sqlite3.Connection = Depends(get_db)):
    if year is None:  # this year where the team is, as BINDER_TZ says
        year = datetime.datetime.now(zoneinfo.ZoneInfo(request.app.state.settings.tz)).year
    return thanks.for_year(db, year)


@router.put("/{contact_id}/{year}")
def put_thanks(contact_id: int, body: ThanksPut, year: int = Path(ge=2000, le=2100),
               db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    return thanks.put(db, contact_id, year, body.model_dump(exclude_unset=True), who.email)


@router.delete("/{contact_id}/{year}", status_code=204)
def delete_thanks(contact_id: int, year: int = Path(ge=2000, le=2100), db: sqlite3.Connection = Depends(get_db)):
    thanks.delete(db, contact_id, year)
    return Response(status_code=204)
```

- [ ] **Step 6: Mount the router in `binder/app.py`**

Replace:

```python
from .api import contacts, interactions, misc, orgs, research, summarise
```

with:

```python
from .api import contacts, interactions, misc, orgs, research, summarise, thanks
```

and replace:

```python
    api.include_router(summarise.router)
```

with:

```python
    api.include_router(summarise.router)
    api.include_router(thanks.router)
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest -q tests/test_thanks.py`
Expected: PASS.

- [ ] **Step 8: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add binder/repo/thanks.py binder/api/thanks.py binder/schemas.py binder/app.py tests/test_thanks.py
git commit -m "Thanks: a year-end checklist for key connectors"
```

---

## Task 6: Quiet connectors need attention

**Files:**
- Modify: `binder/repo/feeds.py:12-54`
- Modify: `tests/test_feeds.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_feeds.py`:

```python


def connector(client, name="Marta"):
    return client.post("/api/contacts", json={"name": name, "connector": True}).json()


def test_a_connector_goes_quiet_after_90_days_without_a_log(client):
    conn = db(client)
    m = connector(client)
    client.post("/api/contacts", json={"name": "Not a connector"})
    conn.execute("UPDATE contacts SET created_at = ?", (OLD,))
    log = client.post("/api/contacts/%d/interactions" % m["id"],
                      json={"type": "call", "summary": "x", "happened_at": "2026-08-14T09:00:00+00:00"}).json()
    # 90 days before 2026-11-11 is 2026-08-13: a log 89 days ago keeps them in touch, one 91 days ago does not.
    assert [i for i in feeds.attention(conn, today="2026-11-11") if "contact" in i] == []
    client.patch("/api/interactions/%d" % log["id"],
                 json={"updated_at": log["updated_at"], "happened_at": "2026-08-12T09:00:00+00:00"})
    items = [i for i in feeds.attention(conn, today="2026-11-11") if "contact" in i]
    assert [(i["contact"]["name"], i["reasons"]) for i in items] == [("Marta", ["quiet_connector"])]


def test_a_connector_never_logged_is_quiet_from_when_they_were_added(client):
    conn = db(client)
    m = connector(client)
    assert feeds.attention(conn, today="2026-11-11") == []  # just added
    conn.execute("UPDATE contacts SET created_at = ? WHERE id = ?", (OLD, m["id"]))
    assert [i["contact"]["id"] for i in feeds.attention(conn, today="2026-11-11")] == [m["id"]]


def test_organisations_come_before_people(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET next_step_due = '2026-01-05' WHERE id = ?", (org["id"],))
    m = connector(client)
    conn.execute("UPDATE contacts SET created_at = ? WHERE id = ?", (OLD, m["id"]))
    items = feeds.attention(conn, today="2026-11-11")
    assert ["org" in items[0], "contact" in items[1]] == [True, True]


def test_the_route_returns_people_items(client):
    m = connector(client)
    db(client).execute("UPDATE contacts SET created_at = ? WHERE id = ?", (OLD, m["id"]))
    items = client.get("/api/attention").json()
    assert [(i["contact"]["id"], i["reasons"]) for i in items] == [(m["id"], ["quiet_connector"])]
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `.venv/bin/pytest -q tests/test_feeds.py`
Expected: FAIL (no `contact` items).

- [ ] **Step 3: Add the rule to `binder/repo/feeds.py`**

Replace:

```python
from ..statuses import OPEN_LEAD_STATUSES
from . import orgs, row

QUIET_DAYS = 14
STUCK_DAYS = 30
```

with:

```python
from ..statuses import OPEN_LEAD_STATUSES
from . import contacts, orgs, row

QUIET_DAYS = 14
STUCK_DAYS = 30
CONNECTOR_DAYS = 90  # a key connector with no log for this long needs a word
```

Replace the docstring and the end of `attention()`:

```python
    """`today` (YYYY-MM-DD) is for tests; by default it is the date now in `tz`."""
```

with:

```python
    """Organisations first, as {org, reasons}, most reasons first and then by
    name; then key connectors with no log for CONNECTOR_DAYS (counted from
    when they were added if they have none), A to Z, as
    {contact, reasons: ["quiet_connector"]}. `today` (YYYY-MM-DD) is for
    tests; by default it is the date now in `tz`."""
```

and:

```python
    out.sort(key=lambda x: (-len(x["reasons"]), x["org"]["name"].lower()))
    return out
```

with:

```python
    out.sort(key=lambda x: (-len(x["reasons"]), x["org"]["name"].lower()))
    quiet_since = _cutoff(today, CONNECTOR_DAYS)
    for r in conn.execute(
            "SELECT c.id FROM contacts c WHERE c.connector = 1 AND coalesce(%s, c.created_at) < ? "
            "ORDER BY c.name COLLATE NOCASE" % contacts.LAST_TOUCH, (quiet_since,)).fetchall():
        out.append({"contact": contacts.get(conn, r["id"]), "reasons": ["quiet_connector"]})
    return out
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest -q tests/test_feeds.py`
Expected: PASS.

- [ ] **Step 5: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add binder/repo/feeds.py tests/test_feeds.py
git commit -m "Needs attention: key connectors with no log in 90 days"
```

---

## Task 7: Web API layer: types, endpoints, fixtures

This task adds shapes and routes. Making a contact's, a log's and a search hit's
organisation nullable waits for the tasks that handle it (Tasks 9 and 12), so
every commit type-checks.

**Files:**
- Modify: `web/src/api/client.ts:29`
- Modify: `web/src/api/types.ts`
- Modify: `web/src/api/endpoints.ts` (rewrite)
- Modify: `web/src/api/endpoints.test.ts` (append)
- Modify: `web/src/test/fixtures.ts`, `web/src/test/render.tsx:10-19`
- Modify: `README.md` (API section)

- [ ] **Step 1: Write the failing test**

Append to `web/src/api/endpoints.test.ts`:

```ts

test('people, introduced and thanks routes', async () => {
  const calls = capture()
  await api.people()
  await api.people({ connector: true, q: 'ma' })
  await api.createPerson({ name: 'Marta' })
  await api.orgIntroduced(3)
  await api.contactIntroduced(5)
  await api.logForPerson(5, { type: 'call', summary: 'Hi' })
  await api.thanks(2026)
  await api.putThanks(5, 2026, { what: 'Wine', updated_at: null })
  await api.deleteThanks(5, 2026)
  expect(calls()).toEqual([
    'GET /api/people',
    'GET /api/people?connector=1&q=ma',
    'POST /api/contacts',
    'GET /api/orgs/3/introduced',
    'GET /api/contacts/5/introduced',
    'POST /api/contacts/5/interactions',
    'GET /api/thanks?year=2026',
    'PUT /api/thanks/5/2026',
    'DELETE /api/thanks/5/2026',
  ])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd web && npx vitest run src/api/endpoints.test.ts)`
Expected: FAIL (`api.people is not a function`).

- [ ] **Step 3: Allow PUT in `web/src/api/client.ts`**

Replace:

```ts
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
```

with:

```ts
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
```

- [ ] **Step 4: Add the shapes to `web/src/api/types.ts`**

Replace:

```ts
export type Kind = 'lead' | 'client'
```

with:

```ts
export type Kind = 'lead' | 'client' | 'partner'

/** Who brought an organisation in: a person, or a partner (with its slug for the link). */
export interface IntroducedBy {
  type: 'contact' | 'partner'
  id: number
  name: string
  slug?: string
}
```

In `Org`, replace:

```ts
  last_contact: string | null
  created_at: string
```

with:

```ts
  last_contact: string | null
  /** One person or one partner at most; the other is null. */
  introduced_by_contact_id: number | null
  introduced_by_org_id: number | null
  introduced_by: IntroducedBy | null
  created_at: string
```

In `Contact`, replace:

```ts
  is_primary: boolean
  relationship: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

export interface Interaction {
```

with:

```ts
  is_primary: boolean
  relationship: string | null
  /** A key connector: starred wherever they appear. */
  connector: boolean
  postal_address: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

/** A row of GET /api/people: a contact with when they were last on a log and how many organisations they brought in. */
export type Person = Contact & { last_contact: string | null; introduced_count: number }

export interface IntroducedOrg {
  id: number
  name: string
  slug: string
  kind: Kind
  status: string
  value_estimate: number | null
}

/** What a person or a partner brought in, and the summed value of the clients among them. */
export interface Introduced {
  orgs: IntroducedOrg[]
  client_value: number
}

/** One person's year-end thanks for one year. */
export interface Thanks {
  id: number
  contact_id: number
  year: number
  what: string | null
  /** The day it was sent, or null while it has not been. */
  sent_on: string | null
  note: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

/** A line of the Thanks checklist: a key connector and their row for the year, or null. */
export interface ThanksRow {
  contact: Contact
  thanks: Thanks | null
}

export interface Interaction {
```

In `Meta`, replace:

```ts
  client_statuses: string[]
  interaction_types: string[]
```

with:

```ts
  client_statuses: string[]
  partner_statuses: string[]
  interaction_types: string[]
```

Replace:

```ts
export type OrgPatch = Partial<OrgFields> & { status?: string; updated_at: string }
```

with:

```ts
export type OrgPatch = Partial<OrgFields> & {
  status?: string
  introduced_by_contact_id?: number | null
  introduced_by_org_id?: number | null
  updated_at: string
}
```

Replace:

```ts
export type ContactPatch = Partial<ContactFields> & { updated_at: string }
```

with:

```ts
export type ContactPatch = Partial<ContactFields> & { updated_at: string }
/** POST /api/contacts: a person with an organisation, or on their own. */
export type PersonInput = ContactInput & { org_id?: number | null }

/** PUT /api/thanks/{contact_id}/{year}: the fields that changed, and the row's updated_at (null when there is no row). */
export interface ThanksPut {
  what?: string | null
  sent_on?: string | null
  note?: string | null
  updated_at: string | null
}
```

- [ ] **Step 5: Rewrite `web/src/api/endpoints.ts`**

```ts
import { request } from './client'
import type {
  ActivityItem, AttentionItem, Contact, ContactInput, ContactPatch, Interaction, InteractionInput,
  InteractionPatch, Introduced, Kind, Meta, Org, OrgInput, OrgPatch, Person, PersonInput, Research, SearchHit,
  Summary, Thanks, ThanksPut, ThanksRow, TimelineItem, Who, Work,
} from './types'

export type OrgSort = 'updated' | 'name' | 'last_contact' | 'value'

export interface OrgFilters {
  kind?: Kind | ''
  status?: string
  sort?: OrgSort
}

export interface PeopleFilters {
  connector?: boolean
  q?: string
}

function query(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const text = s.toString()
  return text ? `?${text}` : ''
}

const slug = (s: string) => encodeURIComponent(s)

export const api = {
  whoami: () => request<Who>('GET', '/api/whoami'),
  meta: () => request<Meta>('GET', '/api/meta'),
  search: (q: string) => request<SearchHit[]>('GET', `/api/search${query({ q })}`),
  attention: () => request<AttentionItem[]>('GET', '/api/attention'),
  activity: (limit = 30) => request<ActivityItem[]>('GET', `/api/activity?limit=${limit}`),

  orgs: (f: OrgFilters = {}) => request<Org[]>('GET', `/api/orgs${query({ ...f })}`),
  orgBySlug: (s: string) => request<Org>('GET', `/api/orgs/by-slug/${slug(s)}`),
  createOrg: (body: OrgInput) => request<Org>('POST', '/api/orgs', body),
  patchOrg: (id: number, body: OrgPatch) => request<Org>('PATCH', `/api/orgs/${id}`, body),
  deleteOrg: (id: number) => request<void>('DELETE', `/api/orgs/${id}`),
  orgIntroduced: (orgId: number) => request<Introduced>('GET', `/api/orgs/${orgId}/introduced`),

  contacts: (orgId: number) => request<Contact[]>('GET', `/api/orgs/${orgId}/contacts`),
  contact: (id: number) => request<Contact>('GET', `/api/contacts/${id}`),
  createContact: (orgId: number, body: ContactInput) => request<Contact>('POST', `/api/orgs/${orgId}/contacts`, body),
  createPerson: (body: PersonInput) => request<Contact>('POST', '/api/contacts', body),
  patchContact: (id: number, body: ContactPatch) => request<Contact>('PATCH', `/api/contacts/${id}`, body),
  deleteContact: (id: number) => request<void>('DELETE', `/api/contacts/${id}`),
  contactIntroduced: (contactId: number) => request<Introduced>('GET', `/api/contacts/${contactId}/introduced`),
  people: (f: PeopleFilters = {}) =>
    request<Person[]>('GET', `/api/people${query({ connector: f.connector ? '1' : undefined, q: f.q })}`),

  timeline: (orgId: number) => request<TimelineItem[]>('GET', `/api/orgs/${orgId}/timeline`),
  contactInteractions: (contactId: number) => request<Interaction[]>('GET', `/api/contacts/${contactId}/interactions`),
  createInteraction: (orgId: number, body: InteractionInput) =>
    request<Interaction>('POST', `/api/orgs/${orgId}/interactions`, body),
  logForPerson: (contactId: number, body: InteractionInput) =>
    request<Interaction>('POST', `/api/contacts/${contactId}/interactions`, body),
  patchInteraction: (id: number, body: InteractionPatch) => request<Interaction>('PATCH', `/api/interactions/${id}`, body),
  deleteInteraction: (id: number) => request<void>('DELETE', `/api/interactions/${id}`),
  orgResearch: (orgId: number) => request<Research[]>('GET', `/api/orgs/${orgId}/research`),
  contactResearch: (contactId: number) => request<Research[]>('GET', `/api/contacts/${contactId}/research`),
  research: (id: number) => request<Research>('GET', `/api/research/${id}`),
  startOrgResearch: (orgId: number) => request<Research>('POST', `/api/orgs/${orgId}/research`),
  startContactResearch: (contactId: number) => request<Research>('POST', `/api/contacts/${contactId}/research`),
  work: (orgId: number) => request<Work>('GET', `/api/orgs/${orgId}/work`),
  summarise: (orgId: number, text: string) => request<Summary>('POST', '/api/summarise', { org_id: orgId, text }),

  thanks: (year: number) => request<ThanksRow[]>('GET', `/api/thanks?year=${year}`),
  putThanks: (contactId: number, year: number, body: ThanksPut) =>
    request<Thanks>('PUT', `/api/thanks/${contactId}/${year}`, body),
  deleteThanks: (contactId: number, year: number) => request<void>('DELETE', `/api/thanks/${contactId}/${year}`),
}
```

- [ ] **Step 6: Bring the fixtures up to the new shapes**

In `web/src/test/fixtures.ts`, replace the import line:

```ts
import type { ActivityItem, Brief, BenchTask, Contact, Interaction, Org, Research } from '../api/types'
```

with:

```ts
import type { ActivityItem, Brief, BenchTask, Contact, Interaction, Org, Person, Research, Thanks } from '../api/types'
```

In `org()`, replace:

```ts
    tags: [], summary: null, next_step: null, next_step_due: null, last_contact: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
```

with:

```ts
    tags: [], summary: null, next_step: null, next_step_due: null, last_contact: null,
    introduced_by_contact_id: null, introduced_by_org_id: null, introduced_by: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
```

In `contact()`, replace:

```ts
    phone: null, linkedin_url: null, notes: null, is_primary: false, relationship: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}
```

with:

```ts
    phone: null, linkedin_url: null, notes: null, is_primary: false, relationship: null,
    connector: false, postal_address: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

/** A row of the people list. */
export function person(o: Partial<Person> = {}): Person {
  return { ...contact(), last_contact: null, introduced_count: 0, ...o }
}

export function thanks(o: Partial<Thanks> = {}): Thanks {
  return {
    id: 1, contact_id: 5, year: 2026, what: null, sent_on: null, note: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}
```

In `web/src/test/render.tsx`, replace:

```ts
    kinds: ['lead', 'client'],
    lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent', 'won', 'lost', 'parked'],
    open_lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent'],
    client_statuses: ['active', 'paused', 'past'],
```

with:

```ts
    kinds: ['lead', 'client', 'partner'],
    lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent', 'won', 'lost', 'parked'],
    open_lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent'],
    client_statuses: ['active', 'paused', 'past'],
    partner_statuses: ['prospect', 'active', 'past'],
```

- [ ] **Step 7: Update the README's API section**

In `README.md`, replace the Organisation bullet:

```
- **Organisation** (`/api/orgs`, `/api/orgs/{id}`, `/api/orgs/by-slug/{slug}`):
  `id`, `slug`, `name`, `kind` (`lead` or `client`), `status`, `website`,
  `sector`, `size`, `location`, `owner_email`, `source`, `value_estimate`,
  `tags` (list), `summary`, `next_step`, `next_step_due`, `last_contact`,
  `created_at`, `updated_at`, `updated_by`.
```

with:

```
- **Organisation** (`/api/orgs`, `/api/orgs/{id}`, `/api/orgs/by-slug/{slug}`):
  `id`, `slug`, `name`, `kind` (`lead`, `client` or `partner`), `status`,
  `website`, `sector`, `size`, `location`, `owner_email`, `source`,
  `value_estimate`, `tags` (list), `summary`, `next_step`, `next_step_due`,
  `last_contact`, `introduced_by_contact_id` and `introduced_by_org_id` (who
  brought it in: one person or one partner, at most, so one of the two is
  null), `introduced_by` (`{type: "contact", id, name}`,
  `{type: "partner", id, name, slug}` or null), `created_at`, `updated_at`,
  `updated_by`. `GET /api/orgs?kind=partner` lists the partners. A POST or
  PATCH may set `introduced_by_org_id` only to a partner other than the
  organisation itself, and never together with `introduced_by_contact_id`
  (422). `DELETE` keeps the organisation's people, now without an
  organisation, and none of them stays the one to talk to.
- **Introduced** (`GET /api/orgs/{id}/introduced` for a partner,
  `GET /api/contacts/{id}/introduced` for a person): `orgs`, the
  organisations they brought in, A to Z, each `{id, name, slug, kind, status,
  value_estimate}`, and `client_value`, the summed `value_estimate` of the
  clients among them.
- **Person** (`GET /api/people?connector=1&q=`): a contact, with or without an
  organisation, plus `last_contact` (their newest log, or null) and
  `introduced_count`. Key connectors come first, then everyone A to Z.
  `connector=1` keeps only connectors; `q` matches the name or the
  organisation's name.
- **Thanks** (`GET /api/thanks?year=`, default this year in `BINDER_TZ`): one
  line per key connector, A to Z, `{contact, thanks}`, where `thanks` is that
  person's row for the year or null. A row: `id`, `contact_id`, `year`,
  `what`, `sent_on` (a date, or null while not sent), `note`, `created_at`,
  `updated_at`, `updated_by`. `PUT /api/thanks/{contact_id}/{year}` with any
  of `what`, `sent_on` and `note` creates or changes the row; it carries the
  row's `updated_at`, or null when there was no row, and anything else is a
  409 with `current` (the row, or null). `DELETE` on the same path removes
  it. One row per person and year.
```

Replace:

```
A record's `kind` is `lead` or `client`, and only organisations have one.
```

with:

```
A record's `kind` is `lead`, `client` or `partner`, and only organisations
have one.
```

In the Vocabularies paragraph, replace:

```
`GET /api/meta` returns `kinds`, `lead_statuses`, `open_lead_statuses`,
`client_statuses`, `interaction_types` and `relationships`, from
```

with:

```
`GET /api/meta` returns `kinds`, `lead_statuses`, `open_lead_statuses`,
`client_statuses`, `partner_statuses`, `interaction_types` and
`relationships`, from
```

and in the same paragraph replace:

```
Moving a lead to `won` makes
it an active client, and a client never goes back to a lead.
```

with:

```
Moving a lead to `won` makes
it an active client, and a client never goes back to a lead. A partner starts
as `prospect`, moves to any partner status and never changes kind.
```

- [ ] **Step 8: Run the web checks**

Run: `(cd web && npm run check && npm test)`
Expected: PASS.

- [ ] **Step 9: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add web/src/api web/src/test README.md
git commit -m "Web: API shapes and routes for partners, people and thanks"
```

---

## Task 8: Partners tab, the partner kind in the app, and the star

**Files:**
- Create: `web/src/components/Star.tsx`
- Create: `web/src/pages/PartnersPage.tsx`, `web/src/pages/PartnersPage.test.tsx`
- Modify: `web/src/app/newOrg.ts` (rewrite), `web/src/app/Layout.tsx`, `web/src/app/App.tsx`
- Modify: `web/src/components/OrgForm.tsx`, `web/src/components/StatusPicker.tsx` (rewrite)
- Modify: `web/src/pages/PipelinePage.tsx:71`, `web/src/pages/ListPage.tsx:52-56` and `:95-97`
- Modify: `web/src/styles.css` (append)
- Tests: `web/src/app/Layout.test.tsx`, `web/src/components/OrgForm.test.tsx`, `web/src/components/StatusPicker.test.tsx`, `web/src/pages/ListPage.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Append to `web/src/app/Layout.test.tsx`:

```tsx

test('Partners is a tab', () => {
  app()
  expect(screen.getByRole('link', { name: 'Partners' })).toHaveAttribute('href', '/partners')
})
```

Append to `web/src/components/OrgForm.test.tsx`:

```tsx

test('a new organisation can start as a partner, and the kinds come from meta', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs': (b) => org({ name: (b as { name: string }).name, kind: 'partner' }) })
  const onSaved = vi.fn()
  renderApp(<OrgForm open kind="partner" onClose={() => {}} onSaved={onSaved} />)
  for (const k of ['Lead', 'Client', 'Partner']) expect(screen.getByRole('radio', { name: k })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Partner' })).toBeChecked()
  await user.type(screen.getByLabelText(/^Name/), 'Northwind')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ name: 'Northwind', kind: 'partner' })
})
```

Append to `web/src/components/StatusPicker.test.tsx`:

```tsx

test('a partner picks from partner statuses', async () => {
  const user = userEvent.setup()
  renderApp(<StatusPicker org={org({ kind: 'partner', status: 'prospect' })} aria="Status" onChange={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Prospect', 'Active', 'Past'])
})
```

Append to `web/src/pages/ListPage.test.tsx`:

```tsx

test('partners have their own tab and are not on the List', async () => {
  const partner = org({ id: 3, name: 'Northwind', slug: 'northwind', kind: 'partner', status: 'active' })
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client, partner] })
  renderApp(<ListPage />, '/list?kind=partner')
  expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Northwind' })).toBeNull()
  expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('2')
})
```

Create `web/src/pages/PartnersPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { Layout } from '../app/Layout'
import { AT, org, person } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { broughtIn, introducedBy, PartnersPage } from './PartnersPage'

const northwind = org({ id: 10, slug: 'northwind', name: 'Northwind', kind: 'partner', status: 'active' })
const acme = org({ id: 1, kind: 'client', status: 'active', value_estimate: 4000, introduced_by_org_id: 10 })
const bolt = org({ id: 2, slug: 'bolt', name: 'Bolt', value_estimate: 900, introduced_by_org_id: 10 })
const marta = person({ id: 8, name: 'Marta', org_id: 10, org_name: 'Northwind', org_slug: 'northwind', connector: true })

test('introducedBy counts each partner’s clients and leads, and what the clients are worth', () => {
  expect(introducedBy([acme, bolt, northwind]).get(10)).toEqual({ clients: 1, leads: 1, value: 4000 })
  expect(introducedBy([northwind]).get(10)).toBeUndefined()
  expect(broughtIn({ clients: 2, leads: 1, value: 0 })).toBe('2 clients · 1 lead')
  expect(broughtIn(undefined)).toBe('Nothing yet')
})

test('lists partners only, with their people, what they brought in and its value', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [acme, bolt, northwind], 'GET /api/people': () => [marta] })
  renderApp(<PartnersPage />, '/partners')
  expect(await screen.findByRole('link', { name: 'Northwind' })).toHaveAttribute('href', '/o/northwind')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.getByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByText('1 client · 1 lead')).toBeInTheDocument()
  expect(screen.getByText('€4,000')).toBeInTheDocument()
})

test('says so when there are no partners', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [acme], 'GET /api/people': () => [] })
  renderApp(<PartnersPage />, '/partners')
  expect(await screen.findByText('No partners yet.')).toBeInTheDocument()
})

test('New partner opens the shared form with Partner chosen, and the new one opens in the drawer', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [],
    'GET /api/people': () => [],
    'POST /api/orgs': () => northwind,
    'GET /api/orgs/by-slug/northwind': () => northwind,
    'GET /api/orgs/10/contacts': () => [],
    'GET /api/orgs/10/timeline': () => [],
    'GET /api/orgs/10/research': () => [],
    'GET /api/orgs/10/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
    'GET /api/orgs/10/introduced': () => ({ orgs: [], client_value: 0 }),
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/partners" element={<PartnersPage />} />
      </Route>
    </Routes>,
    '/partners',
  )
  await user.click(await screen.findByRole('button', { name: 'New partner' }))
  expect(screen.getByRole('radio', { name: 'Partner' })).toBeChecked()
  await user.type(screen.getByLabelText(/^Name/), 'Northwind')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.find((c) => c.key === 'POST /api/orgs')?.body).toMatchObject({ name: 'Northwind', kind: 'partner' }))
  expect(await screen.findByRole('dialog', { name: 'Northwind' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd web && npx vitest run src/app/Layout.test.tsx src/components/OrgForm.test.tsx src/components/StatusPicker.test.tsx src/pages/ListPage.test.tsx src/pages/PartnersPage.test.tsx)`
Expected: FAIL (no Partners tab, no `kind` prop, no PartnersPage).

- [ ] **Step 3: Create `web/src/components/Star.tsx`**

```tsx
/** The mark of a key connector, wherever the person appears. The label is what a screen reader says. */
export function Star() {
  return (
    <span className="tn-custom-star" role="img" aria-label="Key connector" title="Key connector">
      ★
    </span>
  )
}
```

Append to `web/src/styles.css`:

```css

/* A key connector's star, wherever the person appears. */
.tn-custom-star { color: var(--tenon-text-warning); }
```

- [ ] **Step 4: Let the shared New form open with a kind**

Rewrite `web/src/app/newOrg.ts`:

```ts
import { useEffect, type MutableRefObject } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Kind, Org } from '../api/types'

/** What Layout hands its pages: the shared New form (opened with the kind to start from, a lead by default), and the
 * slot where a page registers what to do with the result. */
export interface NewOrgContext {
  open: (kind?: Kind) => void
  created: MutableRefObject<((org: Org) => void) | null>
}

/**
 * A page that lists organisations owns what happens to a new one (put its row in, clear what would hide it, open it).
 * Registers `onCreated` with Layout's New form while the page is mounted, and returns the function that opens the form,
 * so the page's own "add" button and the header's New share one form. Outside Layout the opener does nothing.
 */
export function useNewOrg(onCreated: (org: Org) => void): (kind?: Kind) => void {
  const ctx = useOutletContext<NewOrgContext | null | undefined>()
  const slot = ctx?.created
  // Each render swaps in the latest handler, so it never sees stale state.
  useEffect(() => {
    if (!slot) return
    slot.current = onCreated
    return () => {
      slot.current = null
    }
  })
  return ctx?.open ?? (() => {})
}
```

In `web/src/app/Layout.tsx`, replace:

```tsx
import type { Org } from '../api/types'
```

with:

```tsx
import type { Kind, Org } from '../api/types'
```

replace:

```tsx
  { to: '/list', label: 'List', end: false },
]
```

with:

```tsx
  { to: '/list', label: 'List', end: false },
  { to: '/partners', label: 'Partners', end: false },
]
```

replace:

```tsx
  const [creating, setCreating] = useState(false)
  // A page that lists organisations registers here what to do with a new one; with none, it gets its own page.
  const created = useRef<((org: Org) => void) | null>(null)
  const context: NewOrgContext = { open: () => setCreating(true), created }
```

with:

```tsx
  // The kind the New form starts from while it is open; null while it is shut.
  const [creating, setCreating] = useState<Kind | null>(null)
  // A page that lists organisations registers here what to do with a new one; with none, it gets its own page.
  const created = useRef<((org: Org) => void) | null>(null)
  const context: NewOrgContext = { open: (kind: Kind = 'lead') => setCreating(kind), created }
```

replace:

```tsx
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>New</Button>
```

with:

```tsx
            <Button size="sm" variant="secondary" onClick={() => setCreating('lead')}>New</Button>
```

and replace:

```tsx
      <OrgForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(o) => {
          setCreating(false)
```

with:

```tsx
      <OrgForm
        open={creating !== null}
        kind={creating ?? 'lead'}
        onClose={() => setCreating(null)}
        onSaved={(o) => {
          setCreating(null)
```

In `web/src/pages/PipelinePage.tsx`, the opener now takes a kind, so it cannot be a click handler as it is. Replace:

```tsx
          <Button size="sm" variant="secondary" onClick={addOrganisation}>+ Add organisation</Button>
```

with:

```tsx
          <Button size="sm" variant="secondary" onClick={() => addOrganisation()}>+ Add organisation</Button>
```

- [ ] **Step 5: OrgForm takes a starting kind and lists the kinds from meta**

In `web/src/components/OrgForm.tsx`, replace:

```tsx
import { changed, orNull, saveErrorText, text } from '../lib/forms'
```

with:

```tsx
import { label } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
```

replace:

```tsx
/** The form's text for an organisation, or for a new one owned by `me`. */
export function orgForm(org: Org | undefined, me: Who): OrgFormState {
  return {
    name: text(org?.name),
    kind: org?.kind ?? 'lead',
```

with:

```tsx
/** The form's text for an organisation, or for a new one of `kind` owned by `me`. */
export function orgForm(org: Org | undefined, me: Who, kind: Kind = 'lead'): OrgFormState {
  return {
    name: text(org?.name),
    kind: org?.kind ?? kind,
```

replace:

```tsx
  open: boolean
  /** Left out for a new organisation. */
  org?: Org
```

with:

```tsx
  open: boolean
  /** Left out for a new organisation. */
  org?: Org
  /** The kind a new organisation starts as. */
  kind?: Kind
```

replace:

```tsx
export function OrgForm({ open, org, onClose, onSaved, onDeleted }: Props) {
  const { me } = useSession()
  const [base, setBase] = useState(org)
  const [form, setForm] = useState(() => orgForm(org, me))
```

with:

```tsx
export function OrgForm({ open, org, kind = 'lead', onClose, onSaved, onDeleted }: Props) {
  const { me, meta } = useSession()
  const [base, setBase] = useState(org)
  const [form, setForm] = useState(() => orgForm(org, me, kind))
```

replace:

```tsx
    setBase(org)
    setForm(orgForm(org, me))
    setError(undefined)
    setNameError(undefined)
  }, [open, org, me])
```

with:

```tsx
    setBase(org)
    setForm(orgForm(org, me, kind))
    setError(undefined)
    setNameError(undefined)
  }, [open, org, me, kind])
```

and replace:

```tsx
              options={[{ value: 'lead', label: 'Lead' }, { value: 'client', label: 'Client' }]}
```

with:

```tsx
              options={meta.kinds.map((k) => ({ value: k, label: label(k) }))}
```

- [ ] **Step 6: Rewrite `web/src/components/StatusPicker.tsx`**

```tsx
import { Dropdown } from '@tiagopedras/tenon'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'

/** A status dropdown for one organisation. A lead offers lead statuses (picking Won makes it a client), a client
 * offers client statuses, and a partner partner statuses. */
export function StatusPicker({ org, aria, onChange, disabled }: { org: Org; aria: string; onChange: (status: string) => void; disabled?: boolean }) {
  const { meta } = useSession()
  const list = org.kind === 'lead' ? meta.lead_statuses : org.kind === 'partner' ? meta.partner_statuses : meta.client_statuses
  return (
    <Dropdown
      className="tn-custom-status"
      aria-label={aria}
      value={org.status}
      onChange={onChange}
      disabled={disabled}
      options={list.map((s) => ({ value: s, label: label(s) }))}
    />
  )
}
```

- [ ] **Step 7: Keep partners off the List**

In `web/src/pages/ListPage.tsx`, replace:

```tsx
  const kindRaw = params.get('kind') ?? ''
  const kind = (meta.kinds as string[]).includes(kindRaw) ? kindRaw : ''
```

with:

```tsx
  const kindRaw = params.get('kind') ?? ''
  // Partners have their own tab: the List is leads and clients.
  const listKinds: string[] = meta.kinds.filter((k) => k !== 'partner')
  const kind = listKinds.includes(kindRaw) ? kindRaw : ''
```

and replace:

```tsx
  const all = orgs.data ?? []
```

with:

```tsx
  const all = (orgs.data ?? []).filter((o) => o.kind !== 'partner')
```

- [ ] **Step 8: Create `web/src/pages/PartnersPage.tsx`**

```tsx
import { Alert, Button, ColumnEmpty, Input } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Org, Person } from '../api/types'
import { useNewOrg } from '../app/newOrg'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { OrgDrawer } from '../components/OrgDrawer'
import { Star } from '../components/Star'
import { StatusTag } from '../components/StatusTag'
import { money, person } from '../lib/format'
import { matchesText } from '../lib/matchesText'
import { openInPlace } from '../lib/openInPlace'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { useOrgDrawer } from '../lib/useOrgDrawer'

export interface PartnerFigures {
  clients: number
  leads: number
  /** The summed value of the clients they brought in. */
  value: number
}

/** What each partner brought in, counted from every organisation's introduced_by_org_id, by partner id. */
export function introducedBy(orgs: Org[]): Map<number, PartnerFigures> {
  const out = new Map<number, PartnerFigures>()
  for (const o of orgs) {
    if (o.introduced_by_org_id == null) continue
    const f = out.get(o.introduced_by_org_id) ?? { clients: 0, leads: 0, value: 0 }
    if (o.kind === 'client') {
      f.clients += 1
      f.value += o.value_estimate ?? 0
    } else if (o.kind === 'lead') {
      f.leads += 1
    }
    out.set(o.introduced_by_org_id, f)
  }
  return out
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `2 clients · 1 lead`, or `Nothing yet`. */
export function broughtIn(f: PartnerFigures | undefined): string {
  if (!f || (f.clients === 0 && f.leads === 0)) return 'Nothing yet'
  const parts: string[] = []
  if (f.clients) parts.push(count(f.clients, 'client', 'clients'))
  if (f.leads) parts.push(count(f.leads, 'lead', 'leads'))
  return parts.join(' · ')
}

/** The people at a partner, connectors starred. */
function PeopleThere({ people }: { people: Person[] }) {
  if (people.length === 0) return <span className="tn-custom-faint">No one yet</span>
  return (
    <span className="tn-custom-chiprow">
      {people.map((p) => (
        <span key={p.id} className="tn-cluster">
          {p.connector && <Star />}
          <Link to={`/c/${p.id}`}>{p.name}</Link>
        </span>
      ))}
    </span>
  )
}

export function PartnersPage() {
  const phone = useIsPhone()
  // Every organisation, not just the partners: what each partner brought in is counted from the rest.
  const orgs = useApi(() => api.orgs({ sort: 'name' }), [])
  const people = useApi(() => api.people(), [])
  const [find, setFind] = useState('')
  const drawer = useOrgDrawer()

  /** A new organisation, a partner or anything else made from the header's New, opens in the drawer over the list. */
  function created(o: Org) {
    orgs.reload()
    setFind('')
    drawer.open(o.slug)
  }
  const addOrganisation = useNewOrg(created)

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  const figures = introducedBy(orgs.data)
  const partners = orgs.data.filter((o) => o.kind === 'partner' && matchesText(o, find))
  const at = (id: number) => (people.data ?? []).filter((p) => p.org_id === id)
  const value = (id: number) => figures.get(id)?.value ?? 0

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Partners</h1>
      <div className="tn-custom-filterbar">
        <div className="tn-custom-filterbar-end">
          <Input type="search" className="tn-custom-find" aria-label="Filter partners" placeholder="Filter partners…"
            value={find} onChange={(e) => setFind(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={() => addOrganisation('partner')}>New partner</Button>
        </div>
      </div>
      {people.error && <Alert tone="error">{people.error.message}</Alert>}
      {partners.length === 0 ? (
        <ColumnEmpty>{find.trim() ? 'Nothing matches this filter.' : 'No partners yet.'}</ColumnEmpty>
      ) : phone ? (
        <div className="tn-stack">
          {partners.map((o) => (
            <OrgCard
              key={o.id}
              org={o}
              onOpen={(x) => drawer.open(x.slug)}
              summary={<PeopleThere people={at(o.id)} />}
              footer={
                <span className="tn-custom-chiprow">
                  <span>{broughtIn(figures.get(o.id))}</span>
                  {value(o.id) > 0 && <span>{money(value(o.id))}</span>}
                </span>
              }
            />
          ))}
        </div>
      ) : (
        <div className="tn-table-wrap">
          <table className="tn-custom-table">
            <caption>{partners.length === 1 ? '1 partner' : `${partners.length} partners`}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Owner</th>
                <th scope="col">People</th>
                <th scope="col">Brought in</th>
                <th scope="col" data-numeric>Clients’ value</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/o/${o.slug}`} data-org-open={o.slug} onClick={(e) => openInPlace(e, () => drawer.open(o.slug))}>{o.name}</Link>
                  </td>
                  <td><StatusTag status={o.status} /></td>
                  <td>{person(o.owner_email)}</td>
                  <td><PeopleThere people={at(o.id)} /></td>
                  <td>{broughtIn(figures.get(o.id))}</td>
                  <td data-numeric className="tn-numeric">{value(o.id) > 0 ? money(value(o.id)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={() => orgs.reload()}
        onDeleted={() => { orgs.reload(); people.reload() }} />
    </div>
  )
}
```

- [ ] **Step 9: Route it in `web/src/app/App.tsx`**

Replace:

```tsx
import { OrgPage } from '../pages/OrgPage'
```

with:

```tsx
import { OrgPage } from '../pages/OrgPage'
import { PartnersPage } from '../pages/PartnersPage'
```

and replace:

```tsx
          <Route path="list" element={<ListPage />} />
```

with:

```tsx
          <Route path="list" element={<ListPage />} />
          <Route path="partners" element={<PartnersPage />} />
```

- [ ] **Step 10: Run the web checks**

Run: `(cd web && npm run check && npm test)`
Expected: PASS.

- [ ] **Step 11: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add web/src
git commit -m "Web: a Partners tab, partner statuses and the New form's starting kind"
```

---

## Task 9: Contact page: no organisation, the star, postal address, Introduced

**Files:**
- Modify: `web/src/api/types.ts` (`Contact`, `Interaction`, `ContactFields`, `ContactPatch`)
- Modify: `web/src/components/ContactForm.tsx` (rewrite)
- Modify: `web/src/components/QuickLog.tsx`
- Create: `web/src/components/IntroducedSection.tsx`
- Modify: `web/src/pages/ContactPage.tsx` (rewrite)
- Modify: `web/src/styles.css` (append)
- Tests: `web/src/components/ContactForm.test.tsx`, `web/src/components/QuickLog.test.tsx` (append); `web/src/pages/ContactPage.test.tsx` (rewrite)
- Modify: `README.md` (Contact and Interaction records)

- [ ] **Step 1: Write the failing tests**

Append to `web/src/components/ContactForm.test.tsx`:

```tsx

test('on its own, a new person goes to /api/contacts with the star on and no organisation', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [],
    'POST /api/contacts': () => contact({ org_id: null, org_name: null, org_slug: null, connector: true }),
  })
  const onSaved = vi.fn()
  renderApp(<ContactForm open orgId={null} chooseOrg connectorDefault onClose={() => {}} onSaved={onSaved} />)
  expect(screen.getByLabelText('Key connector')).toBeChecked()
  expect(screen.queryByLabelText('Who to talk to')).toBeNull()
  await user.type(screen.getByLabelText(/^Name/), 'Marta')
  await user.type(screen.getByLabelText('Postal address'), '1 Example Street')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls.find((c) => c.key === 'POST /api/contacts')!.body).toMatchObject({
    name: 'Marta', connector: true, postal_address: '1 Example Street', org_id: null, is_primary: false,
  })
})

test('taking a person out of their organisation sends only org_id', async () => {
  const user = userEvent.setup()
  const bo = contact()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [org(), org({ id: 2, name: 'Bolt', slug: 'bolt' })],
    'PATCH /api/contacts/5': () => ({ ...bo, org_id: null, org_name: null, org_slug: null }),
  })
  renderApp(<ContactForm open orgId={1} chooseOrg contact={bo} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.getByLabelText('Who to talk to')).toBeInTheDocument()
  // The dropdown waits for the organisations to load.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Organisation' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Organisation' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'No organisation' }))
  expect(screen.queryByLabelText('Who to talk to')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'PATCH /api/contacts/5')).toBe(true))
  expect(calls.find((c) => c.key === 'PATCH /api/contacts/5')!.body).toEqual({ org_id: null, updated_at: bo.updated_at })
})

test('on an organisation, the form does not offer a choice of organisation', () => {
  const calls = stubFetch({})
  renderApp(<ContactForm open orgId={1} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Organisation' })).toBeNull()
  expect(screen.getByLabelText('Key connector')).not.toBeChecked()
  expect(calls).toHaveLength(0)
})
```

and change that file's fixtures import from:

```tsx
import { contact } from '../test/fixtures'
```

to:

```tsx
import { contact, org } from '../test/fixtures'
```

Append to `web/src/components/QuickLog.test.tsx`:

```tsx

test('a log against a person goes to that person', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/contacts/5/interactions': () => interaction({ org_id: null }) })
  const onSaved = vi.fn()
  const solo = contact({ org_id: null, org_name: null, org_slug: null })
  renderApp(<QuickLog open orgId={null} personId={5} contacts={[solo]} preselect={[5]} onClose={() => {}} onSaved={onSaved} />)
  expect(screen.queryByRole('button', { name: 'Paste and summarise' })).toBeNull()
  await user.type(screen.getByLabelText(/What happened/), 'Coffee')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].key).toBe('POST /api/contacts/5/interactions')
  expect(calls[0].body).toMatchObject({ summary: 'Coffee', contact_ids: [5] })
})
```

Rewrite `web/src/pages/ContactPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { Contact } from '../api/types'
import { brief, contact, interaction, research } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactPage } from './ContactPage'

const bo = contact({ role: 'CEO', email: 'bo@example.com', notes: 'Prefers mornings', relationship: 'warm' })
const NOTHING_INTRODUCED = { orgs: [], client_value: 0 }

function stubs(c: Contact = bo, extra: Record<string, (b: unknown) => unknown> = {}) {
  return stubFetch({
    'GET /api/contacts/5': () => c,
    'GET /api/contacts/5/interactions': () => [interaction({ contact_ids: [5] })],
    'GET /api/orgs/1/contacts': () => [c],
    'GET /api/contacts/5/research': () => [],
    'GET /api/contacts/5/introduced': () => NOTHING_INTRODUCED,
    ...extra,
  })
}

function page(path = '/c/5') {
  return renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, path)
}

test('shows the person, their organisation and what was logged with them', async () => {
  stubs()
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Bo' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Prefers mornings')).toBeInTheDocument()
  expect(screen.getByText('Warm')).toBeInTheDocument()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
})

test('Log opens with this person ticked, and saves against them', async () => {
  const user = userEvent.setup()
  const calls = stubs(bo, { 'POST /api/contacts/5/interactions': () => interaction() })
  page()
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
  await user.type(screen.getByLabelText(/What happened/), 'Coffee')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/contacts/5/interactions')).toBe(true))
})

test('a link that is not a number says not found without calling the API', async () => {
  const calls = stubFetch({})
  page('/c/abc')
  expect(await screen.findByText('Person not found')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
})

test('a LinkedIn value that is not http(s) is shown as text, not a link', async () => {
  stubs({ ...bo, linkedin_url: 'javascript:alert(1)' })
  page()
  expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
})

test('a bare LinkedIn address becomes an https link', async () => {
  stubs({ ...bo, linkedin_url: 'linkedin.com/in/bo' })
  page()
  expect(await screen.findByRole('link', { name: 'Profile' })).toHaveAttribute('href', 'https://linkedin.com/in/bo')
})

test("shows the person's research", async () => {
  stubs(bo, {
    'GET /api/contacts/5/research': () => [research({ contact_id: 5, brief: brief({ overview: 'Bo collects teapots.' }) })],
  })
  page()
  expect(await screen.findByText('Bo collects teapots.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '#research')
})

test('a person with no organisation: no organisation link, no research, and Log is just them', async () => {
  const user = userEvent.setup()
  const solo = contact({ org_id: null, org_name: null, org_slug: null, role: 'Chef' })
  const calls = stubs(solo)
  page()
  expect(await screen.findByText('Chef · No organisation')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Research' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
  expect(calls.some((c) => c.key.startsWith('GET /api/orgs/'))).toBe(false)
  expect(calls.some((c) => c.key === 'GET /api/contacts/5/research')).toBe(false)
})

test('the Key connector chip saves the flag and shows the star', async () => {
  const user = userEvent.setup()
  const calls = stubs(bo, { 'PATCH /api/contacts/5': () => ({ ...bo, connector: true, updated_at: '2026-11-12T00:00:00.000000+00:00' }) })
  page()
  await user.click(await screen.findByRole('button', { name: 'Key connector', pressed: false }))
  expect(await screen.findByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Key connector', pressed: true })).toBeInTheDocument()
  expect(calls.find((c) => c.key === 'PATCH /api/contacts/5')!.body).toEqual({ connector: true, updated_at: bo.updated_at })
})

test('a conflict on the star shows their version', async () => {
  const user = userEvent.setup()
  const theirs = { ...bo, connector: true, role: 'CTO', updated_at: '2026-11-12T00:00:00.000000+00:00' }
  stubs(bo, {
    'PATCH /api/contacts/5': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  page()
  await user.click(await screen.findByRole('button', { name: 'Key connector', pressed: false }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByText(/CTO at/)).toBeInTheDocument()
})

test('shows the postal address and what they introduced', async () => {
  stubs({ ...bo, postal_address: '1 Example Street\nPorto' }, {
    'GET /api/contacts/5/introduced': () => ({
      orgs: [{ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'active', value_estimate: 4000 }],
      client_value: 4000,
    }),
  })
  page()
  expect(await screen.findByText(/1 Example Street/)).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(screen.getByText('Clients worth €4,000')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd web && npx vitest run src/components/ContactForm.test.tsx src/components/QuickLog.test.tsx src/pages/ContactPage.test.tsx)`
Expected: FAIL (type errors on `orgId={null}`, missing Key connector, no Introduced section).

- [ ] **Step 3: Make the organisation optional in `web/src/api/types.ts`**

In `Contact`, replace:

```ts
export interface Contact {
  id: number
  org_id: number
  org_name: string
  org_slug: string
```

with:

```ts
export interface Contact {
  id: number
  /** Null for someone with no organisation, as are org_name and org_slug. */
  org_id: number | null
  org_name: string | null
  org_slug: string | null
```

In `Interaction`, replace:

```ts
export interface Interaction {
  id: number
  org_id: number
```

with:

```ts
export interface Interaction {
  id: number
  /** Null for a log with a person who has no organisation. */
  org_id: number | null
```

In `ContactFields`, replace:

```ts
  is_primary: boolean
  relationship: string | null
}
export type ContactInput = Pick<ContactFields, 'name'> & Partial<ContactFields>
export type ContactPatch = Partial<ContactFields> & { updated_at: string }
```

with:

```ts
  is_primary: boolean
  relationship: string | null
  connector: boolean
  postal_address: string | null
}
export type ContactInput = Pick<ContactFields, 'name'> & Partial<ContactFields>
/** `org_id` moves the person to another organisation, or null for none. */
export type ContactPatch = Partial<ContactFields> & { org_id?: number | null; updated_at: string }
```

- [ ] **Step 4: Rewrite `web/src/components/ContactForm.tsx`**

```tsx
import { Alert, Button, Dropdown, Field, Modal, SegmentedControl, type DropdownOption } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, ContactFields, ContactPatch } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { ConfirmDelete } from './ConfirmDelete'

export interface ContactFormState {
  name: string
  role: string
  email: string
  phone: string
  linkedin_url: string
  notes: string
  is_primary: boolean
  relationship: string
  connector: boolean
  postal_address: string
  /** The organisation as a Dropdown value: its id, or '' for none. Used only where the form offers the choice. */
  org_id: string
}

export interface ContactDefaults {
  /** The organisation a new person starts at. */
  orgId?: number | null
  /** Whether a new person starts as a key connector. */
  connector?: boolean
}

export function contactForm(c?: Contact, defaults: ContactDefaults = {}): ContactFormState {
  const orgId = c ? c.org_id : defaults.orgId ?? null
  return {
    name: text(c?.name),
    role: text(c?.role),
    email: text(c?.email),
    phone: text(c?.phone),
    linkedin_url: text(c?.linkedin_url),
    notes: text(c?.notes),
    is_primary: c?.is_primary ?? false,
    relationship: text(c?.relationship),
    connector: c?.connector ?? defaults.connector ?? false,
    postal_address: text(c?.postal_address),
    org_id: orgId === null ? '' : String(orgId),
  }
}

export function contactBody(f: ContactFormState): ContactFields {
  return {
    name: f.name.trim(),
    role: orNull(f.role),
    email: orNull(f.email),
    phone: orNull(f.phone),
    linkedin_url: orNull(f.linkedin_url),
    notes: orNull(f.notes),
    is_primary: f.is_primary,
    relationship: f.relationship || null,
    connector: f.connector,
    postal_address: orNull(f.postal_address),
  }
}

/** The organisation dropdown. It loads the organisations only once the form is open with the choice on. */
function OrgChoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const list = useApi(() => api.orgs({ sort: 'name' }), [])
  if (list.error) return <Alert tone="error">{list.error.message}</Alert>
  const options: DropdownOption[] = [
    { value: '', label: 'No organisation' },
    ...(list.data ?? []).map((o) => ({ value: String(o.id), label: o.name, group: `${label(o.kind)}s` })),
  ]
  return (
    <div className="tenon-field">
      <span className="tenon-field__label">Organisation</span>
      <Dropdown aria-label="Organisation" value={value} onChange={onChange} options={options} disabled={!list.data} />
    </div>
  )
}

interface Props {
  open: boolean
  /** The organisation a new person joins; null for someone on their own. */
  orgId: number | null
  /** Offer the organisation as a choice: on a person's page, and on People. */
  chooseOrg?: boolean
  /** A new person starts as a key connector: on People. */
  connectorDefault?: boolean
  /** Left out to add a new person. */
  contact?: Contact
  onClose: () => void
  onSaved: (c: Contact) => void
  onDeleted?: () => void
}

export function ContactForm({ open, orgId, chooseOrg = false, connectorDefault = false, contact, onClose, onSaved, onDeleted }: Props) {
  const { meta } = useSession()
  const defaults: ContactDefaults = { orgId, connector: connectorDefault }
  const [base, setBase] = useState(contact)
  const [form, setForm] = useState(() => contactForm(contact, defaults))
  const [error, setError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBase(contact)
    setForm(contactForm(contact, { orgId, connector: connectorDefault }))
    setError(undefined)
    setNameError(undefined)
  }, [open, contact, orgId, connectorDefault])

  // Only someone at an organisation can be the one to talk to.
  const hasOrg = (chooseOrg || orgId === null) ? form.org_id !== '' : true

  const set = (k: 'name' | 'role' | 'email' | 'phone' | 'linkedin_url' | 'notes' | 'postal_address') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (busy) return
    if (form.name.trim() === '') {
      setNameError('Name is required')
      return
    }
    setNameError(undefined)
    setBusy(true)
    setError(undefined)
    try {
      const body = contactBody(form)
      if (!hasOrg) body.is_primary = false
      const org = form.org_id === '' ? null : Number(form.org_id)
      let saved: Contact
      if (base) {
        const patch: ContactPatch = { ...changed<ContactFields>(base, body), updated_at: base.updated_at }
        if (chooseOrg && org !== base.org_id) patch.org_id = org
        // updated_at alone means nothing changed: send nothing.
        saved = Object.keys(patch).length === 1 ? base : await api.patchContact(base.id, patch)
      } else if (orgId !== null && !chooseOrg) {
        saved = await api.createContact(orgId, body)
      } else {
        saved = await api.createPerson({ ...body, org_id: org })
      }
      onSaved(saved)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Contact
        setBase(current)
        setForm(contactForm(current))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base || busy) return
    setBusy(true)
    try {
      await api.deleteContact(base.id)
      onDeleted?.()
    } catch (e) {
      setError(saveErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={base ? `Edit ${base.name}` : 'Add a person'}
      size="md"
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="person" onConfirm={() => void remove()} />}
          <span className="tn-custom-grow" />
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="contact-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="contact-form" className="tn-stack" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required error={nameError} value={form.name} onChange={set('name')} autoFocus />
        <Field label="Role" value={form.role} onChange={set('role')} />
        {open && chooseOrg && <OrgChoice value={form.org_id} onChange={(org_id) => setForm((f) => ({ ...f, org_id }))} />}
        <Field label="Email" type="email" value={form.email} onChange={set('email')} />
        <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
        <Field label="LinkedIn" type="url" value={form.linkedin_url} onChange={set('linkedin_url')} />
        <div className="tenon-field">
          <span className="tenon-field__label">Relationship</span>
          <SegmentedControl
            aria-label="Relationship"
            value={form.relationship}
            onChange={(relationship) => setForm((f) => ({ ...f, relationship }))}
            options={[{ value: '', label: 'Not sure' }, ...meta.relationships.map((r) => ({ value: r, label: label(r) }))]}
          />
        </div>
        <div className="tenon-field">
          <label className="tenon-field__label tn-custom-check">
            <input
              type="checkbox"
              checked={form.connector}
              onChange={(e) => setForm((f) => ({ ...f, connector: e.target.checked }))}
            />
            Key connector
          </label>
        </div>
        {hasOrg && (
          <div className="tenon-field">
            <label className="tenon-field__label tn-custom-check">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              />
              Who to talk to
            </label>
          </div>
        )}
        <Field label="Postal address" multiline rows={3} value={form.postal_address} onChange={set('postal_address')} />
        <Field label="Notes" multiline rows={3} value={form.notes} onChange={set('notes')} />
      </form>
    </Modal>
  )
}
```

- [ ] **Step 5: QuickLog logs against a person, and summarises only for an organisation**

In `web/src/components/QuickLog.tsx`, replace:

```tsx
interface Props {
  open: boolean
  orgId: number
```

with:

```tsx
interface Props {
  open: boolean
  /** The organisation the log is for; null for a person who has none. */
  orgId: number | null
  /** Log against this person (from their page): the log goes to them, and to their organisation if they have one. */
  personId?: number
```

replace:

```tsx
export function QuickLog({ open, orgId, contacts, initial, preselect, onClose, onSaved }: Props) {
```

with:

```tsx
export function QuickLog({ open, orgId, personId, contacts, initial, preselect, onClose, onSaved }: Props) {
```

replace:

```tsx
  async function summarise() {
    if (summarising || !paste.trim()) return
```

with:

```tsx
  async function summarise() {
    if (summarising || !paste.trim() || orgId === null) return
```

replace:

```tsx
      } else {
        await api.createInteraction(orgId, body)
      }
```

with:

```tsx
      } else if (personId !== undefined) {
        await api.logForPerson(personId, body)
      } else if (orgId !== null) {
        await api.createInteraction(orgId, body)
      }
```

and replace:

```tsx
        {!base && meta.ai && (
```

with:

```tsx
        {!base && meta.ai && orgId !== null && (
```

- [ ] **Step 6: Create `web/src/components/IntroducedSection.tsx`**

```tsx
import { Alert, ColumnEmpty } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import type { Introduced } from '../api/types'
import { money } from '../lib/format'
import { useApi } from '../lib/useApi'
import { Section } from '../pages/org/Section'
import { Loading } from './Loading'
import { StatusTag } from './StatusTag'

interface Props {
  /** Loads what this person or partner brought in. */
  load: () => Promise<Introduced>
  /** Names whose list this is, such as `contact:5`: a new subject loads again. */
  subject: string
}

/** The organisations a person or a partner brought in, and what the clients among them are worth. */
export function IntroducedSection({ load, subject }: Props) {
  const introduced = useApi(load, [subject])
  const data = introduced.data
  return (
    <Section id="introduced" title="Introduced" count={data?.orgs.length}>
      {introduced.error ? (
        <Alert tone="error">{introduced.error.message}</Alert>
      ) : !data ? (
        <Loading />
      ) : data.orgs.length === 0 ? (
        <ColumnEmpty>Nobody brought in yet.</ColumnEmpty>
      ) : (
        <>
          <ul className="tn-custom-rows">
            {data.orgs.map((o) => (
              <li key={o.id} className="tn-cluster">
                <Link to={`/o/${o.slug}`}>{o.name}</Link>
                <StatusTag status={o.status} />
                {o.value_estimate != null && <span className="tn-custom-faint">{money(o.value_estimate)}</span>}
              </li>
            ))}
          </ul>
          {data.client_value > 0 && <p className="tenon-caption">Clients worth {money(data.client_value)}</p>}
        </>
      )}
    </Section>
  )
}
```

- [ ] **Step 7: Rewrite `web/src/pages/ContactPage.tsx`**

```tsx
import { Alert, Button, Column, ColumnEmpty, LinkButton, Tag, ToggleChip } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact } from '../api/types'
import { ContactForm } from '../components/ContactForm'
import { InteractionEntry } from '../components/InteractionEntry'
import { IntroducedSection } from '../components/IntroducedSection'
import { Loading } from '../components/Loading'
import { QuickLog } from '../components/QuickLog'
import { ResearchSection } from '../components/ResearchSection'
import { Star } from '../components/Star'
import { useSession } from '../app/session'
import { relationshipTone } from '../lib/colour'
import { label, safeHref } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'

export function ContactPage() {
  const id = Number(useParams().id)
  const valid = Number.isInteger(id) && id > 0
  const contact = useApi(() => (valid ? api.contact(id) : Promise.reject(new Error('Person not found'))), [id])
  if (contact.error) return <Alert tone="error" title="Could not open this person">{contact.error.message}</Alert>
  if (!contact.data) return <Loading />
  return <ContactView key={contact.data.id} c={contact.data} setContact={contact.setData} />
}

function ContactView({ c, setContact }: { c: Contact; setContact: (c: Contact) => void }) {
  const navigate = useNavigate()
  const { meta } = useSession()
  const history = useApi(() => api.contactInteractions(c.id), [c.id])
  // Someone with no organisation logs alone: the only person to tick is them.
  const people = useApi(() => (c.org_id === null ? Promise.resolve([c]) : api.contacts(c.org_id)), [c.org_id])
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()

  async function toggleConnector() {
    if (busy) return
    setBusy(true)
    setNotice(undefined)
    try {
      setContact(await api.patchContact(c.id, { connector: !c.connector, updated_at: c.updated_at }))
    } catch (e) {
      setNotice(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) setContact(e.current as Contact)
    } finally {
      setBusy(false)
    }
  }

  const linkedin = safeHref(c.linkedin_url)
  const names = new Map((people.data ?? []).map((p) => [p.id, p.name]))
  const details: [string, ReactNode][] = (
    [
      ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
      ['Phone', c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>],
      ['LinkedIn', c.linkedin_url && (linkedin ? <a href={linkedin} target="_blank" rel="noreferrer">Profile</a> : c.linkedin_url)],
      ['Relationship', c.relationship && <Tag tone={relationshipTone(c.relationship)}>{label(c.relationship)}</Tag>],
      ['Talk to', c.is_primary && 'Yes, the one to talk to'],
      ['Postal address', c.postal_address && <span className="tn-custom-address">{c.postal_address}</span>],
    ] as [string, ReactNode][]
  ).filter(([, v]) => v)

  return (
    <div className="tn-stack">
      <header className="tn-stack">
        <div className="tn-toolbar">
          <div className="tn-cluster tn-custom-title">
            <h1 className="tenon-heading-3">{c.name}</h1>
            {c.connector && <Star />}
          </div>
          <div className="tn-cluster">
            <ToggleChip pressed={c.connector} disabled={busy} onClick={() => void toggleConnector()}>Key connector</ToggleChip>
            <Button variant="primary" size="sm" onClick={() => setLogging(true)}>Log</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            {meta.ai && c.org_id !== null && <LinkButton variant="ghost" size="sm" href="#research">Research</LinkButton>}
            {c.phone && <LinkButton variant="ghost" size="sm" href={`tel:${c.phone}`}>Call</LinkButton>}
            {c.email && <LinkButton variant="ghost" size="sm" href={`mailto:${c.email}`}>Email</LinkButton>}
          </div>
        </div>
        <p className="tenon-caption tn-custom-faint">
          {c.org_slug ? (
            <>
              {c.role && `${c.role} at `}
              <Link to={`/o/${c.org_slug}`}>{c.org_name}</Link>
            </>
          ) : (
            [c.role, 'No organisation'].filter(Boolean).join(' · ')
          )}
        </p>
        {notice && <Alert tone="error">{notice}</Alert>}
      </header>

      <div className="tn-grid tn-custom-split">
        <div className="tn-col-8 tn-stack">
          <Column titleAs="h2" title={`With ${c.name}`}>
            {history.error ? (
              <Alert tone="error">{history.error.message}</Alert>
            ) : !history.data ? (
              <Loading />
            ) : history.data.length === 0 ? (
              <ColumnEmpty boxed>Nothing logged with {c.name} yet.</ColumnEmpty>
            ) : (
              <ol className="tn-custom-rows">
                {history.data.map((i) => (
                  <li key={i.id}>
                    <InteractionEntry
                      type={i.type} at={i.happened_at} by={i.author_email} summary={i.summary}
                      next_step={i.next_step} next_step_due={i.next_step_due}
                      people={i.contact_ids.filter((p) => p !== c.id).map((p) => names.get(p)).filter((n): n is string => !!n)}
                    />
                  </li>
                ))}
              </ol>
            )}
          </Column>
          {/* Research needs the organisation: the server refuses a person who has none. */}
          {c.org_id !== null && <ResearchSection subject={{ kind: 'contact', id: c.id }} orgId={c.org_id} people={people} />}
        </div>
        <div className="tn-col-4 tn-stack">
          <Column titleAs="h2" title="Details">
            <dl className="tn-custom-facts">
              {details.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
            </dl>
            {c.notes && <p className="tenon-body tn-custom-body">{c.notes}</p>}
          </Column>
          <IntroducedSection load={() => api.contactIntroduced(c.id)} subject={`contact:${c.id}`} />
        </div>
      </div>

      <ContactForm
        open={editing}
        orgId={c.org_id}
        chooseOrg
        contact={c}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false)
          setContact(saved)
          people.reload()
        }}
        onDeleted={() => navigate(c.org_slug ? `/o/${c.org_slug}` : '/people')}
      />
      <QuickLog
        open={logging}
        orgId={c.org_id}
        personId={c.id}
        contacts={people.data}
        preselect={[c.id]}
        onClose={() => setLogging(false)}
        onSaved={() => {
          setLogging(false)
          history.reload()
        }}
      />
    </div>
  )
}
```

Append to `web/src/styles.css`:

```css

/* A postal address keeps its lines. */
.tn-custom-address { white-space: pre-line; }
```

- [ ] **Step 8: Update the README's Contact and Interaction records**

In `README.md`, replace the Contact bullet:

```
- **Contact** (`/api/orgs/{id}/contacts`, `/api/contacts/{id}`): `id`,
  `org_id`, `org_name`, `org_slug`, `name`, `role`, `email`, `phone`,
  `linkedin_url`, `notes`, `is_primary` (bool), `relationship` (or null),
  `created_at`, `updated_at`, `updated_by`. The list and the single contact
  return the same fields.
```

with:

```
- **Contact** (`/api/orgs/{id}/contacts`, `/api/contacts/{id}`): `id`,
  `org_id`, `org_name`, `org_slug` (all three null for someone with no
  organisation), `name`, `role`, `email`, `phone`, `linkedin_url`, `notes`,
  `is_primary` (bool; only someone at an organisation can be the one to talk
  to), `relationship` (or null), `connector` (bool: a key connector),
  `postal_address`, `created_at`, `updated_at`, `updated_by`. The list and the
  single contact return the same fields. `POST /api/contacts` adds a person
  with an optional `org_id`; a PATCH may carry `org_id` to move them to
  another organisation or, with null, to none, and a move clears
  `is_primary` unless the same save sets it.
```

Replace the Interaction bullet:

```
- **Interaction** (`/api/orgs/{id}/interactions`, `/api/interactions/{id}`):
  `id`, `org_id`, `type`, `happened_at`, `summary`, `next_step`,
  `next_step_due`, `contact_ids`, `author_email`, `created_at`, `updated_at`,
  `updated_by`.
```

with:

```
- **Interaction** (`/api/orgs/{id}/interactions`, `/api/interactions/{id}`):
  `id`, `org_id`, `type`, `happened_at`, `summary`, `next_step`,
  `next_step_due`, `contact_ids`, `author_email`, `created_at`, `updated_at`,
  `updated_by`. `POST /api/contacts/{id}/interactions` logs against a person:
  they are added to `contact_ids`, and `org_id` is their organisation, or null
  when they have none. A log with no organisation needs at least one person
  (422 otherwise), and goes when the last of its people is deleted.
```

- [ ] **Step 9: Run the web checks**

Run: `(cd web && npm run check && npm test)`
Expected: PASS.

- [ ] **Step 10: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add web/src README.md
git commit -m "Web: people without an organisation, the Key connector star and what they introduced"
```

---

## Task 10: People tab and the Thanks checklist

**Files:**
- Create: `web/src/pages/PeoplePage.tsx`, `web/src/pages/PeoplePage.test.tsx`
- Create: `web/src/pages/people/ReachButtons.tsx`
- Create: `web/src/pages/people/ThanksView.tsx`, `web/src/pages/people/ThanksView.test.tsx`
- Modify: `web/src/lib/format.ts` (add `shortDay`), `web/src/lib/format.test.ts`
- Modify: `web/src/app/Layout.tsx` (NAV), `web/src/app/App.tsx`, `web/src/app/Layout.test.tsx`
- Modify: `web/src/styles.css` (append)

- [ ] **Step 1: Write the failing tests**

In `web/src/lib/format.test.ts`, replace the import:

```ts
import {
  ago, day, fromLocalInput, initials, label, money, moneyShort, person, REASON_TEXT, statusLine,
  toLocalInput, todayIso, safeHref, usd,
} from './format'
```

with:

```ts
import {
  ago, day, fromLocalInput, initials, label, money, moneyShort, person, REASON_TEXT, shortDay, statusLine,
  toLocalInput, todayIso, safeHref, usd,
} from './format'
```

and append at the end of the file:

```ts

test('shortDay is the day and month, for when someone was last in touch', () => {
  expect(shortDay('2026-10-12T10:00:00.000000+00:00')).toMatch(/^1[12] Oct$/) // the day in the browser's zone
  expect(shortDay('2026-10-12')).toBe('12 Oct')
  expect(shortDay(null)).toBe('')
  expect(shortDay('nonsense')).toBe('')
})
```

Append to `web/src/app/Layout.test.tsx`:

```tsx

test('People is a tab', () => {
  app()
  expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/people')
})
```

Create `web/src/pages/PeoplePage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { person } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { matchesPerson, PeoplePage } from './PeoplePage'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

const marta = person({
  id: 8, name: 'Marta', connector: true, org_id: null, org_name: null, org_slug: null,
  email: 'marta@example.com', phone: '+351 000 000 000', linkedin_url: 'linkedin.com/in/marta',
  last_contact: '2026-10-12', introduced_count: 2,
})
const zoe = person({ id: 9, name: 'Zoe', role: 'CTO' })

const phone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))

test('matchesPerson looks at the name, the role and the organisation', () => {
  expect(matchesPerson(zoe, 'cto')).toBe(true)
  expect(matchesPerson(zoe, 'acme')).toBe(true)
  expect(matchesPerson(marta, 'acme')).toBe(false)
  expect(matchesPerson(marta, '')).toBe(true)
})

test('Connectors by default, Everyone shows the rest', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/people': () => [marta, zoe] })
  renderApp(<><PeoplePage /><Where /></>, '/people')
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.queryByRole('link', { name: 'Zoe' })).toBeNull()
  expect(screen.getByRole('button', { name: /^Connectors/ })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: /^Everyone/ }))
  expect(screen.getByRole('link', { name: 'Zoe' })).toHaveAttribute('href', '/c/9')
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('at /people?who=everyone')).toBeInTheDocument()
})

test('a row has the star, last touched, introduced, and reach buttons only where there is a value', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/people': () => [marta, zoe] })
  renderApp(<PeoplePage />, '/people')
  expect(await screen.findByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByText('12 Oct')).toBeInTheDocument()
  expect(screen.getByText('Introduced 2')).toBeInTheDocument()
  expect(screen.getByText('No organisation')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Email Marta' })).toHaveAttribute('href', 'mailto:marta@example.com')
  expect(screen.getByRole('link', { name: 'Call Marta' })).toHaveAttribute('href', 'tel:+351 000 000 000')
  expect(screen.getByRole('link', { name: 'Marta on LinkedIn' })).toHaveAttribute('href', 'https://linkedin.com/in/marta')
  await user.click(screen.getByRole('button', { name: /^Everyone/ }))
  expect(screen.queryByRole('link', { name: 'Email Zoe' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Call Zoe' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Zoe on LinkedIn' })).toBeNull()
})

test('the find box narrows the list', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/people': () => [marta, zoe] })
  renderApp(<PeoplePage />, '/people?who=everyone')
  await screen.findByRole('link', { name: 'Zoe' })
  await user.type(screen.getByRole('searchbox', { name: 'Find people' }), 'cto')
  expect(screen.queryByRole('link', { name: 'Marta' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Zoe' })).toBeInTheDocument()
})

test('on a phone, people are cards with their reach buttons', async () => {
  phone()
  stubFetch({ 'GET /api/people': () => [marta] })
  const { container } = renderApp(<PeoplePage />, '/people')
  expect(await screen.findByRole('link', { name: 'Marta' })).toBeInTheDocument()
  expect(container.querySelector('table')).toBeNull()
  expect(container.querySelector('.tenon-card')).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Email Marta' })).toBeInTheDocument()
})

test('New person adds someone on their own with the star on, and the list loads again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/people': () => [],
    'GET /api/orgs?sort=name': () => [],
    'POST /api/contacts': () => marta,
  })
  renderApp(<PeoplePage />, '/people')
  expect(await screen.findByText(/No key connectors yet/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New person' }))
  await user.type(screen.getByLabelText(/^Name/), 'Marta')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/people')).toHaveLength(2))
  expect(calls.find((c) => c.key === 'POST /api/contacts')!.body).toMatchObject({ name: 'Marta', connector: true, org_id: null })
})

test('Thanks is a view of the same page', async () => {
  const user = userEvent.setup()
  const year = new Date().getFullYear()
  const calls = stubFetch({ 'GET /api/people': () => [marta], [`GET /api/thanks?year=${year}`]: () => [] })
  renderApp(<><PeoplePage /><Where /></>, '/people')
  await screen.findByRole('link', { name: 'Marta' })
  await user.click(screen.getByRole('radio', { name: 'Thanks' }))
  expect(await screen.findByText('at /people?view=thanks')).toBeInTheDocument()
  await waitFor(() => expect(calls.some((c) => c.key === `GET /api/thanks?year=${year}`)).toBe(true))
})
```

Create `web/src/pages/people/ThanksView.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { ThanksPut } from '../../api/types'
import { todayIso } from '../../lib/format'
import { contact, thanks } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { ThanksView, years } from './ThanksView'

const Y = new Date().getFullYear()
const bea = contact({ id: 9, name: 'Bea', connector: true })
const marta = contact({ id: 8, name: 'Marta', connector: true, org_id: null, org_name: null, org_slug: null,
  postal_address: '1 Example Street\nPorto' })
const beaSent = thanks({ id: 1, contact_id: 9, year: Y, what: 'Port wine', sent_on: `${Y}-12-10` })
const list = () => [{ contact: bea, thanks: beaSent }, { contact: marta, thanks: null }]

test('years offers this one and the two before', () => {
  expect(years(new Date(2026, 5, 1))).toEqual([2026, 2025, 2024])
})

test('each connector with their address, and how many are done', async () => {
  stubFetch({ [`GET /api/thanks?year=${Y}`]: list })
  renderApp(<ThanksView />)
  expect(await screen.findByText('1 of 2 sent')).toBeInTheDocument()
  expect(screen.getByLabelText('Sent to Bea')).toBeChecked()
  expect(screen.getByLabelText('Sent to Marta')).not.toBeChecked()
  expect(screen.getByLabelText('What for Bea')).toHaveValue('Port wine')
  expect(screen.getByText(/1 Example Street/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
})

test('ticking Sent creates the row with today, and the count follows', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/8/${Y}`]: (b) => thanks({ id: 2, contact_id: 8, year: Y, sent_on: (b as ThanksPut).sent_on ?? null }),
  })
  renderApp(<ThanksView />)
  await user.click(await screen.findByLabelText('Sent to Marta'))
  expect(await screen.findByText('2 of 2 sent')).toBeInTheDocument()
  expect(calls.find((c) => c.key.startsWith('PUT'))!.body).toEqual({ sent_on: todayIso(), updated_at: null })
})

test('what is saved on leaving the field, only when it changed, with the row’s updated_at', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/9/${Y}`]: () => ({ ...beaSent, what: 'Port wine and cheese', updated_at: '2026-12-11T00:00:00.000000+00:00' }),
  })
  renderApp(<ThanksView />)
  await user.type(await screen.findByLabelText('What for Bea'), ' and cheese')
  await user.tab()
  await waitFor(() => expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(1))
  expect(calls.find((c) => c.key.startsWith('PUT'))!.body).toEqual({ what: 'Port wine and cheese', updated_at: beaSent.updated_at })
  await user.click(screen.getByLabelText('Note for Bea'))
  await user.tab()
  expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(1)
})

test('a stale save shows their version', async () => {
  const user = userEvent.setup()
  const theirs = { ...beaSent, what: 'Cheese', updated_at: '2026-12-11T00:00:00.000000+00:00' }
  stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/9/${Y}`]: () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  renderApp(<ThanksView />)
  await user.type(await screen.findByLabelText('What for Bea'), '!')
  await user.tab()
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByLabelText('What for Bea')).toHaveValue('Cheese')
})

test('another year loads that year', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ [`GET /api/thanks?year=${Y}`]: list, [`GET /api/thanks?year=${Y - 1}`]: () => [] })
  renderApp(<ThanksView />)
  await screen.findByText('1 of 2 sent')
  await user.click(screen.getByRole('button', { name: 'Year' }))
  await user.click(screen.getByRole('menuitemradio', { name: String(Y - 1) }))
  expect(await screen.findByText(/No key connectors yet/)).toBeInTheDocument()
  expect(calls.map((c) => c.key)).toContain(`GET /api/thanks?year=${Y - 1}`)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd web && npx vitest run src/lib/format.test.ts src/app/Layout.test.tsx src/pages/PeoplePage.test.tsx src/pages/people/ThanksView.test.tsx)`
Expected: FAIL (no `shortDay`, no People tab, no pages).

- [ ] **Step 3: Add `shortDay` to `web/src/lib/format.ts`**

After the `day` function, add:

```ts
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** A day without its year, `12 Oct`, for when someone was last in touch. Empty when there is none. */
export function shortDay(value: string | null | undefined): string {
  if (!value) return ''
  const d = parse(value)
  return Number.isNaN(d.getTime()) ? '' : SHORT_DAY.format(d)
}
```

- [ ] **Step 4: Create `web/src/pages/people/ReachButtons.tsx`**

```tsx
import { LinkButton } from '@tiagopedras/tenon'
import type { Contact } from '../../api/types'
import { safeHref } from '../../lib/format'

/** One tap to reach someone: Email, Call and LinkedIn, each only when there is something to reach them on. */
export function ReachButtons({ c }: { c: Pick<Contact, 'name' | 'email' | 'phone' | 'linkedin_url'> }) {
  const linkedin = safeHref(c.linkedin_url)
  if (!c.email && !c.phone && !linkedin) return null
  return (
    <span className="tn-custom-reach">
      {c.email && (
        <LinkButton size="sm" variant="secondary" href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}>Email</LinkButton>
      )}
      {c.phone && (
        <LinkButton size="sm" variant="secondary" href={`tel:${c.phone}`} aria-label={`Call ${c.name}`}>Call</LinkButton>
      )}
      {linkedin && (
        <LinkButton size="sm" variant="secondary" href={linkedin} target="_blank" rel="noreferrer" aria-label={`${c.name} on LinkedIn`}>
          LinkedIn
        </LinkButton>
      )}
    </span>
  )
}
```

- [ ] **Step 5: Create `web/src/pages/people/ThanksView.tsx`**

```tsx
import { Alert, ColumnEmpty, Dropdown, Input } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Thanks, ThanksPut, ThanksRow } from '../../api/types'
import { Loading } from '../../components/Loading'
import { todayIso } from '../../lib/format'
import { orNull, saveErrorText } from '../../lib/forms'
import { useApi } from '../../lib/useApi'

/** The years the checklist offers: this one and the two before. */
export function years(now: Date = new Date()): number[] {
  const y = now.getFullYear()
  return [y, y - 1, y - 2]
}

interface LineProps {
  year: number
  row: ThanksRow
  onSaved: (t: Thanks | null) => void
}

/** One connector's line: who and where to send it, what, whether it went, and a note. Each change saves on its own. */
function ThanksLine({ year, row, onSaved }: LineProps) {
  const c = row.contact
  const t = row.thanks
  const [what, setWhat] = useState(t?.what ?? '')
  const [note, setNote] = useState(t?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save(change: Omit<ThanksPut, 'updated_at'>) {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      onSaved(await api.putThanks(c.id, year, { ...change, updated_at: t?.updated_at ?? null }))
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409) {
        const current = (e.current ?? null) as Thanks | null
        onSaved(current)
        setWhat(current?.what ?? '')
        setNote(current?.note ?? '')
      }
    } finally {
      setBusy(false)
    }
  }

  /** A text field saves when it loses focus, and only when it changed. */
  function leave(k: 'what' | 'note', value: string) {
    const next = orNull(value)
    if (next === (t?.[k] ?? null)) return
    void save(k === 'what' ? { what: next } : { note: next })
  }

  return (
    <li className="tn-custom-thanks-line">
      <div className="tn-stack">
        <div className="tn-cluster">
          <Link to={`/c/${c.id}`}>{c.name}</Link>
          {c.org_name && <span className="tn-custom-faint">· {c.org_name}</span>}
        </div>
        <div className="tenon-caption tn-custom-faint tn-custom-address">{c.postal_address ?? 'No postal address yet'}</div>
      </div>
      <Input aria-label={`What for ${c.name}`} placeholder="What" value={what}
        onChange={(e) => setWhat(e.target.value)} onBlur={() => leave('what', what)} />
      <label className="tn-custom-check">
        <input type="checkbox" aria-label={`Sent to ${c.name}`} checked={!!t?.sent_on} disabled={busy}
          onChange={(e) => void save({ sent_on: e.target.checked ? todayIso() : null })} />
        Sent
      </label>
      <Input aria-label={`Note for ${c.name}`} placeholder="Note" value={note}
        onChange={(e) => setNote(e.target.value)} onBlur={() => leave('note', note)} />
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  )
}

/** The year-end checklist: every key connector, what they get, and whether it has gone. */
export function ThanksView() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const list = useApi(() => api.thanks(year), [year])
  const rows = list.data ?? []
  const sent = rows.filter((r) => r.thanks?.sent_on).length
  const replace = (contactId: number, t: Thanks | null) =>
    list.setData((prev) => (prev ?? []).map((r) => (r.contact.id === contactId ? { ...r, thanks: t } : r)))

  return (
    <div className="tn-stack">
      <div className="tn-toolbar">
        <Dropdown className="tn-custom-filter" aria-label="Year" value={String(year)} onChange={(v) => setYear(Number(v))}
          options={years().map((y) => ({ value: String(y), label: String(y) }))} />
        {list.data && rows.length > 0 && <span className="tenon-caption">{sent} of {rows.length} sent</span>}
      </div>
      {list.error ? (
        <Alert tone="error">{list.error.message}</Alert>
      ) : !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <ColumnEmpty>No key connectors yet. Star someone on their page to add them here.</ColumnEmpty>
      ) : (
        <ul className="tn-custom-rows">
          {rows.map((r) => (
            <ThanksLine key={`${year}:${r.contact.id}`} year={year} row={r} onSaved={(t) => replace(r.contact.id, t)} />
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Create `web/src/pages/PeoplePage.tsx`**

```tsx
import { Alert, Button, Card, ColumnEmpty, Input, SegmentedControl } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Person } from '../api/types'
import { ContactForm } from '../components/ContactForm'
import { FilterChips } from '../components/FilterChips'
import { Loading } from '../components/Loading'
import { Star } from '../components/Star'
import { shortDay } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { ReachButtons } from './people/ReachButtons'
import { ThanksView } from './people/ThanksView'

type Who = 'connectors' | 'everyone'
type View = 'people' | 'thanks'

/** True when the person's name, role or organisation contains `needle`, ignoring case. An empty needle matches all. */
export function matchesPerson(p: Person, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  return !n || [p.name, p.role, p.org_name].some((v) => v?.toLowerCase().includes(n))
}

const introduced = (n: number) => (n > 0 ? `Introduced ${n}` : '')

function Name({ p }: { p: Person }) {
  return (
    <span className="tn-cluster">
      {p.connector && <Star />}
      <Link to={`/c/${p.id}`}>{p.name}</Link>
    </span>
  )
}

function OrgName({ p }: { p: Person }) {
  return p.org_slug ? <Link to={`/o/${p.org_slug}`}>{p.org_name}</Link> : <span className="tn-custom-faint">No organisation</span>
}

export function PeoplePage() {
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'thanks' ? 'thanks' : 'people'
  const who: Who = params.get('who') === 'everyone' ? 'everyone' : 'connectors'
  const [find, setFind] = useState('')
  const [adding, setAdding] = useState(false)
  const people = useApi(() => api.people(), [])

  // The view and the filter live in the address, replaced in place so Back leaves the page.
  const put = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const found = (people.data ?? []).filter((p) => matchesPerson(p, find))
  const connectors = found.filter((p) => p.connector)
  const rows = who === 'connectors' ? connectors : found
  const empty = find.trim()
    ? 'Nobody matches this filter.'
    : who === 'connectors'
      ? 'No key connectors yet. Star someone on their page, or add a person.'
      : 'No one yet.'

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">People</h1>
      <div className="tn-custom-filterbar">
        <SegmentedControl<View>
          aria-label="View"
          value={view}
          onChange={(v) => put('view', v === 'thanks' ? 'thanks' : '')}
          options={[{ value: 'people', label: 'People' }, { value: 'thanks', label: 'Thanks' }]}
        />
        <div className="tn-custom-filterbar-end">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>New person</Button>
        </div>
      </div>
      {view === 'thanks' ? (
        <ThanksView />
      ) : (
        <>
          <div className="tn-custom-filterbar">
            <FilterChips<Who>
              label="Who"
              value={who}
              onChange={(v) => put('who', v === 'everyone' ? 'everyone' : '')}
              chips={[
                { value: 'connectors', label: 'Connectors', count: connectors.length },
                { value: 'everyone', label: 'Everyone', count: found.length },
              ]}
            />
            <div className="tn-custom-filterbar-end">
              <Input type="search" className="tn-custom-find" aria-label="Find people" placeholder="Find people…"
                value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
          </div>
          {people.error ? (
            <Alert tone="error">{people.error.message}</Alert>
          ) : !people.data ? (
            <Loading />
          ) : rows.length === 0 ? (
            <ColumnEmpty>{empty}</ColumnEmpty>
          ) : phone ? (
            <div className="tn-stack">
              {rows.map((p) => (
                <Card
                  key={p.id}
                  titleAs="h3"
                  title={<Name p={p} />}
                  summary={<span className="tn-custom-muted">{p.role && `${p.role} · `}<OrgName p={p} /></span>}
                  meta={
                    <span className="tenon-caption tn-custom-faint">
                      {[p.last_contact ? `Last touched ${shortDay(p.last_contact)}` : 'Not logged yet', introduced(p.introduced_count)]
                        .filter(Boolean).join(' · ')}
                    </span>
                  }
                  footer={<ReachButtons c={p} />}
                />
              ))}
            </div>
          ) : (
            <div className="tn-table-wrap">
              <table className="tn-custom-table">
                <caption>{rows.length === 1 ? '1 person' : `${rows.length} people`}</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col">Organisation</th>
                    <th scope="col">Last touched</th>
                    <th scope="col">Introduced</th>
                    <th scope="col">Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td><Name p={p} /></td>
                      <td>{p.role}</td>
                      <td><OrgName p={p} /></td>
                      <td>{shortDay(p.last_contact)}</td>
                      <td>{introduced(p.introduced_count)}</td>
                      <td><ReachButtons c={p} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <ContactForm
        open={adding}
        orgId={null}
        chooseOrg
        connectorDefault
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false)
          people.reload()
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Add the tab and the route**

In `web/src/app/Layout.tsx`, replace:

```tsx
  { to: '/partners', label: 'Partners', end: false },
]
```

with:

```tsx
  { to: '/partners', label: 'Partners', end: false },
  { to: '/people', label: 'People', end: false },
]
```

In `web/src/app/App.tsx`, replace:

```tsx
import { PartnersPage } from '../pages/PartnersPage'
```

with:

```tsx
import { PartnersPage } from '../pages/PartnersPage'
import { PeoplePage } from '../pages/PeoplePage'
```

and replace:

```tsx
          <Route path="partners" element={<PartnersPage />} />
```

with:

```tsx
          <Route path="partners" element={<PartnersPage />} />
          <Route path="people" element={<PeoplePage />} />
```

- [ ] **Step 8: Styles for the reach buttons and the checklist**

Append to `web/src/styles.css`:

```css

/* People: the reach buttons, and the Thanks checklist's lines. On a phone each button and each field takes the
   full width, so they are easy to tap. */
.tn-custom-reach { display: flex; flex-wrap: wrap; gap: var(--tenon-dimension-050); }
.tn-custom-thanks-line {
  display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) auto minmax(0, 2fr);
  align-items: center; gap: var(--tenon-dimension-100);
}
.tn-custom-thanks-line > .tenon-alert { grid-column: 1 / -1; }
@media (max-width: 767px) {
  .tn-custom-reach > * { flex: 1 1 100%; justify-content: center; }
  .tn-custom-thanks-line { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Step 9: Run the web checks**

Run: `(cd web && npm run check && npm test)`
Expected: PASS.

- [ ] **Step 10: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add web/src
git commit -m "Web: a People tab with key connectors first, reach buttons and the Thanks checklist"
```

---

## Task 11: Organisation page: introduced by, a partner's Introduced section, the delete note

**Files:**
- Create: `web/src/pages/org/IntroducedBy.tsx`
- Modify: `web/src/pages/org/OrgDetail.tsx`
- Modify: `web/src/pages/org/PeopleSection.tsx`
- Modify: `web/src/components/ConfirmDelete.tsx` (rewrite), `web/src/components/OrgForm.tsx:147`
- Tests: `web/src/pages/OrgPage.test.tsx`, `web/src/components/OrgForm.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

In `web/src/pages/OrgPage.test.tsx`, replace the fixtures import:

```tsx
import { AT, contact, interaction, org, research } from '../test/fixtures'
```

with:

```tsx
import { AT, contact, interaction, org, person, research } from '../test/fixtures'
```

and append:

```tsx

test('introduced by: nobody yet, then Change picks a person and sends only what changed', async () => {
  const user = userEvent.setup()
  const marta = person({ id: 8, name: 'Marta', org_id: null, org_name: null, org_slug: null, connector: true })
  const northwind = org({ id: 10, slug: 'northwind', name: 'Northwind', kind: 'partner', status: 'active' })
  const calls = stubs({
    'GET /api/people': () => [marta],
    'GET /api/orgs?kind=partner&sort=name': () => [northwind],
    'PATCH /api/orgs/1': () => ({
      ...acme, introduced_by_contact_id: 8, introduced_by: { type: 'contact', id: 8, name: 'Marta' },
      updated_at: '2026-11-12T00:00:00.000000+00:00',
    }),
  })
  page()
  expect(await screen.findByText('Nobody yet')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Change' }))
  await user.click(await screen.findByRole('button', { name: 'Introduced by' }))
  expect(screen.getByRole('menuitemradio', { name: 'Northwind' })).toBeInTheDocument()
  await user.click(screen.getByRole('menuitemradio', { name: 'Marta' }))
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(calls.find((c) => c.key === 'PATCH /api/orgs/1')!.body).toEqual({ updated_at: acme.updated_at, introduced_by_contact_id: 8 })
})

test('introduced by a partner links to the partner, and a lead has no Introduced section', async () => {
  const calls = stubs({
    'GET /api/orgs/by-slug/acme': () => ({
      ...acme, introduced_by_org_id: 10, introduced_by: { type: 'partner', id: 10, name: 'Northwind', slug: 'northwind' },
    }),
  })
  page()
  expect(await screen.findByRole('link', { name: 'Northwind' })).toHaveAttribute('href', '/o/northwind')
  expect(screen.queryByRole('heading', { name: /^Introduced$|^Introduced \d/ })).toBeNull()
  expect(calls.some((c) => c.key.endsWith('/introduced'))).toBe(false)
})

test('a partner lists what it introduced and what those clients are worth', async () => {
  const northwind = org({ id: 10, slug: 'northwind', name: 'Northwind', kind: 'partner', status: 'active' })
  stubFetch({
    'GET /api/orgs/by-slug/northwind': () => northwind,
    'GET /api/orgs/10/contacts': () => [contact({ id: 8, name: 'Marta', org_id: 10, connector: true })],
    'GET /api/orgs/10/timeline': () => [],
    'GET /api/orgs/10/research': () => [],
    'GET /api/orgs/10/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
    'GET /api/orgs/10/introduced': () => ({
      orgs: [{ id: 1, name: 'Acme', slug: 'acme', kind: 'client', status: 'active', value_estimate: 4000 }],
      client_value: 4000,
    }),
  })
  renderApp(<Routes><Route path="/o/:slug" element={<OrgPage />} /></Routes>, '/o/northwind')
  expect(await screen.findByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Clients worth €4,000')).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Prospect', 'Active', 'Past'])
})
```

Append to `web/src/components/OrgForm.test.tsx`:

```tsx

test('the second click on Delete says the people are kept', async () => {
  const user = userEvent.setup()
  stubFetch({})
  renderApp(<OrgForm open org={org()} onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} />)
  expect(screen.queryByText(/people are kept/)).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByText('Its people are kept, without an organisation.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd web && npx vitest run src/pages/OrgPage.test.tsx src/components/OrgForm.test.tsx)`
Expected: FAIL (no "Nobody yet", no Introduced section, no note).

- [ ] **Step 3: Create `web/src/pages/org/IntroducedBy.tsx`**

```tsx
import { Alert, Button, Dropdown, type DropdownOption } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Org, OrgPatch } from '../../api/types'
import { Loading } from '../../components/Loading'
import { saveErrorText } from '../../lib/forms'
import { useApi } from '../../lib/useApi'

type Introducer = Pick<Org, 'introduced_by_contact_id' | 'introduced_by_org_id'>

/** The picker's value for who introduced an organisation: `c:<id>` for a person, `o:<id>` for a partner, '' for nobody. */
export function introducerValue(org: Introducer): string {
  if (org.introduced_by_contact_id != null) return `c:${org.introduced_by_contact_id}`
  if (org.introduced_by_org_id != null) return `o:${org.introduced_by_org_id}`
  return ''
}

/** The two fields a picker value stands for. */
export function introducerFields(value: string): Introducer {
  return {
    introduced_by_contact_id: value.startsWith('c:') ? Number(value.slice(2)) : null,
    introduced_by_org_id: value.startsWith('o:') ? Number(value.slice(2)) : null,
  }
}

/** The picker over people and partners. It loads them only once Change is pressed. */
function Choice({ org, busy, onPick }: { org: Org; busy: boolean; onPick: (value: string) => void }) {
  const lists = useApi(() => Promise.all([api.people(), api.orgs({ kind: 'partner', sort: 'name' })]), [])
  if (lists.error) return <Alert tone="error">{lists.error.message}</Alert>
  if (!lists.data) return <Loading />
  const [people, partners] = lists.data
  const options: DropdownOption[] = [
    { value: '', label: 'Nobody' },
    ...people.map((p) => ({ value: `c:${p.id}`, label: p.name, group: 'People' })),
    ...partners.filter((p) => p.id !== org.id).map((p) => ({ value: `o:${p.id}`, label: p.name, group: 'Partners' })),
  ]
  return <Dropdown aria-label="Introduced by" value={introducerValue(org)} onChange={onPick} disabled={busy} options={options} />
}

/** Who brought the organisation in, as a link, and a picker to change it. A pick saves at once. */
export function IntroducedBy({ org, setOrg }: { org: Org; setOrg: (o: Org) => void }) {
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const by = org.introduced_by

  async function pick(value: string) {
    if (busy) return
    if (value === introducerValue(org)) {
      setChoosing(false)
      return
    }
    const next = introducerFields(value)
    // Only the fields that change are sent.
    const body: OrgPatch = { updated_at: org.updated_at }
    if (next.introduced_by_contact_id !== org.introduced_by_contact_id) body.introduced_by_contact_id = next.introduced_by_contact_id
    if (next.introduced_by_org_id !== org.introduced_by_org_id) body.introduced_by_org_id = next.introduced_by_org_id
    setBusy(true)
    setError(undefined)
    try {
      setOrg(await api.patchOrg(org.id, body))
      setChoosing(false)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) setOrg(e.current as Org)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tn-stack">
      <div className="tn-cluster">
        <span className="tenon-caption tn-custom-faint">Introduced by</span>
        {by ? (
          <Link to={by.type === 'contact' ? `/c/${by.id}` : `/o/${by.slug ?? ''}`}>{by.name}</Link>
        ) : (
          <span className="tn-custom-faint">Nobody yet</span>
        )}
        {!choosing && <Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>Change</Button>}
      </div>
      {choosing && <Choice org={org} busy={busy} onPick={(v) => void pick(v)} />}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  )
}
```

- [ ] **Step 4: Put it in the overview, and the partner's Introduced section beside People**

In `web/src/pages/org/OrgDetail.tsx`, replace:

```tsx
import { NextStep } from '../../components/OrgCard'
```

with:

```tsx
import { IntroducedSection } from '../../components/IntroducedSection'
import { NextStep } from '../../components/OrgCard'
```

replace:

```tsx
import { FrameContext, Section, type Frame } from './Section'
```

with:

```tsx
import { IntroducedBy } from './IntroducedBy'
import { FrameContext, Section, type Frame } from './Section'
```

replace:

```tsx
        {facts(org).map(([k, v]) => (
          <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
        ))}
      </dl>
    </Section>
  )
```

with:

```tsx
        {facts(org).map(([k, v]) => (
          <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
        ))}
      </dl>
      <IntroducedBy org={org} setOrg={setOrg} />
    </Section>
  )

  // What a partner brought in. Leads and clients have no such list, and do not ask for one.
  const introduced = org.kind === 'partner'
    ? <IntroducedSection load={() => api.orgIntroduced(org.id)} subject={`org:${org.id}`} />
    : null
```

replace:

```tsx
        onDeleted={() => (frame === 'drawer' && onDeleted ? onDeleted() : navigate('/list'))}
```

with:

```tsx
        onDeleted={() => (frame === 'drawer' && onDeleted ? onDeleted() : navigate(org.kind === 'partner' ? '/partners' : '/list'))}
```

replace (the drawer frame):

```tsx
          <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
          <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} limit={5} moreHref={`/o/${org.slug}`} />
```

with:

```tsx
          <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
          {introduced}
          <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} limit={5} moreHref={`/o/${org.slug}`} />
```

and replace (the page frame):

```tsx
            <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
            {meta.bench && <WorkSection orgId={org.id} slug={org.slug} />}
```

with:

```tsx
            <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
            {introduced}
            {meta.bench && <WorkSection orgId={org.id} slug={org.slug} />}
```

- [ ] **Step 5: Star connectors in the People section**

In `web/src/pages/org/PeopleSection.tsx`, replace:

```tsx
import { Loading } from '../../components/Loading'
```

with:

```tsx
import { Loading } from '../../components/Loading'
import { Star } from '../../components/Star'
```

and replace:

```tsx
                  <Link to={`/c/${c.id}`}>{c.name}</Link>
                  {c.is_primary && <Tag tone="accent">Talk to</Tag>}
```

with:

```tsx
                  {c.connector && <Star />}
                  <Link to={`/c/${c.id}`}>{c.name}</Link>
                  {c.is_primary && <Tag tone="accent">Talk to</Tag>}
```

- [ ] **Step 6: The delete confirmation says what is kept**

Rewrite `web/src/components/ConfirmDelete.tsx`:

```tsx
import { Button } from '@tiagopedras/tenon'
import { useState } from 'react'

/** Two clicks to delete: the first asks, the second deletes. No browser dialog. `note`, shown with the second
 * button, says what deleting keeps or takes with it. */
export function ConfirmDelete({ what, note, onConfirm }: { what: string; note?: string; onConfirm: () => void }) {
  const [asked, setAsked] = useState(false)
  return asked ? (
    <>
      {note && <span className="tenon-caption">{note}</span>}
      <Button variant="destructive" size="sm" onClick={onConfirm}>Delete this {what}</Button>
    </>
  ) : (
    <Button variant="danger" size="sm" onClick={() => setAsked(true)}>Delete</Button>
  )
}
```

In `web/src/components/OrgForm.tsx`, replace:

```tsx
          {base && onDeleted && <ConfirmDelete what="organisation" onConfirm={() => void remove()} />}
```

with:

```tsx
          {base && onDeleted && (
            <ConfirmDelete what="organisation" note="Its people are kept, without an organisation." onConfirm={() => void remove()} />
          )}
```

- [ ] **Step 7: Run the web checks**

Run: `(cd web && npm run check && npm test)`
Expected: PASS.

- [ ] **Step 8: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add web/src
git commit -m "Web: who introduced an organisation, what a partner brought in, and a clearer delete"
```

---

## Task 12: Home and search

**Files:**
- Modify: `web/src/api/types.ts` (`SearchHit`, `Reason`, `AttentionItem`)
- Modify: `web/src/lib/format.ts:1-13`, `web/src/lib/colour.ts:73-78`
- Modify: `web/src/pages/HomePage.tsx`
- Modify: `web/src/pages/SearchPage.tsx` (rewrite)
- Tests: `web/src/lib/colour.test.ts:67-69`, `web/src/lib/format.test.ts`, `web/src/pages/HomePage.test.tsx`, `web/src/pages/SearchPage.test.tsx`
- Modify: `README.md` (Feed items)

- [ ] **Step 1: Write the failing tests**

In `web/src/lib/colour.test.ts`, replace:

```ts
  test('a missed next step is urgent, and going quiet or stuck is a warning', () => {
    expect(REASON_TONE).toEqual({ overdue: 'urgent', quiet: 'warning', stuck: 'warning' })
  })
```

with:

```ts
  test('a missed next step is urgent, and going quiet or stuck is a warning', () => {
    expect(REASON_TONE).toEqual({ overdue: 'urgent', quiet: 'warning', stuck: 'warning', quiet_connector: 'warning' })
  })
```

Append to `web/src/lib/format.test.ts`:

```ts

test('a quiet connector reads as 90 days without contact', () => {
  expect(REASON_TEXT.quiet_connector).toBe('No contact in 90 days')
})
```

Append to `web/src/pages/HomePage.test.tsx`:

```tsx

test('a quiet connector is listed after the organisations, with a link to the person', async () => {
  stubFetch({
    'GET /api/orgs': () => [],
    'GET /api/attention': () => [
      { org: org({ next_step: 'Send the deck', next_step_due: '2000-01-01' }), reasons: ['overdue'] },
      { contact: contact({ id: 8, name: 'Marta', connector: true, org_id: null, org_name: null, org_slug: null }), reasons: ['quiet_connector'] },
    ],
    'GET /api/activity?limit=30': () => [],
  })
  renderApp(<HomePage />)
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.getByText('No contact in 90 days')).toHaveClass('tenon-tag--warning')
  expect(screen.getByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByText('1 with a missed next step')).toBeInTheDocument()
})
```

and change that file's fixtures import from:

```tsx
import { activity, org } from '../test/fixtures'
```

to:

```tsx
import { activity, contact, org } from '../test/fixtures'
```

In `web/src/pages/SearchPage.test.tsx`, replace the `hit` helper:

```tsx
const hit = (o: Partial<SearchHit>): SearchHit => ({
  kind: 'org', id: 1, org_id: 1, org_name: 'Acme', org_slug: 'acme', org_status: 'lead', title: 'Acme', snippet: '\u0002Acme\u0003 studio', contact_id: null, ...o,
})
```

with:

```tsx
const hit = (o: Partial<SearchHit>): SearchHit => ({
  kind: 'org', id: 1, org_id: 1, org_name: 'Acme', org_slug: 'acme', org_status: 'lead', title: 'Acme', snippet: '\u0002Acme\u0003 studio',
  contact_id: null, connector: false, ...o,
})
const ON_THEIR_OWN = { org_id: null, org_name: null, org_slug: null, org_status: null }
```

and append:

```tsx

test('a log with no organisation links to its person', () => {
  expect(hitLink(hit({ kind: 'interaction', id: 7, ...ON_THEIR_OWN, contact_id: 8 }))).toBe('/c/8')
})

test('a person with no organisation shows no organisation or status, and a connector shows the star', async () => {
  stubFetch({
    'GET /api/search?q=marta': () => [hit({ kind: 'contact', id: 8, title: 'Marta', snippet: '\u0002Marta\u0003', connector: true, ...ON_THEIR_OWN })],
  })
  const { container } = renderApp(<SearchPage />, '/search?q=marta')
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.getByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.queryByText(/·/)).toBeNull()
  expect(container.querySelector('.tenon-tag')).toBeNull()
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd web && npx vitest run src/lib src/pages/HomePage.test.tsx src/pages/SearchPage.test.tsx)`
Expected: FAIL (type errors on the new fields, missing reason text and tone).

- [ ] **Step 3: Update the shapes in `web/src/api/types.ts`**

Replace the `SearchHit` interface:

```ts
export interface SearchHit {
  kind: 'org' | 'contact' | 'interaction' | 'research'
  id: number
  org_id: number
  org_name: string
  org_slug: string
  /** The organisation's current status, which sets the stage colour the hit shows. */
  org_status: string
  title: string
  snippet: string
  /** The person a research brief is about; null for every other hit. */
  contact_id: number | null
}
```

with:

```ts
export interface SearchHit {
  kind: 'org' | 'contact' | 'interaction' | 'research'
  id: number
  /** Null for a person or a log with no organisation, as are org_name, org_slug and org_status. */
  org_id: number | null
  org_name: string | null
  org_slug: string | null
  /** The organisation's current status, which sets the stage colour the hit shows. */
  org_status: string | null
  title: string
  snippet: string
  /** The person a research brief is about, or the first person on a log with no organisation; null otherwise. */
  contact_id: number | null
  /** True for a person who is a key connector. */
  connector: boolean
}
```

Replace:

```ts
export type Reason = 'overdue' | 'quiet' | 'stuck'

export interface AttentionItem {
  org: Org
  reasons: Reason[]
}
```

with:

```ts
export type Reason = 'overdue' | 'quiet' | 'stuck'
export type PersonReason = 'quiet_connector'

export interface OrgAttention {
  org: Org
  reasons: Reason[]
}

/** A key connector with no log in 90 days. */
export interface PersonAttention {
  contact: Contact
  reasons: PersonReason[]
}

/** Organisations come first, then people. */
export type AttentionItem = OrgAttention | PersonAttention
```

- [ ] **Step 4: Text and tone for the new reason**

In `web/src/lib/format.ts`, replace:

```ts
import type { Reason } from '../api/types'
```

with:

```ts
import type { PersonReason, Reason } from '../api/types'
```

and replace:

```ts
export const REASON_TEXT: Record<Reason, string> = {
  overdue: 'Next step overdue',
  quiet: 'No contact in 14 days',
  stuck: 'Same stage for 30 days',
}
```

with:

```ts
export const REASON_TEXT: Record<Reason | PersonReason, string> = {
  overdue: 'Next step overdue',
  quiet: 'No contact in 14 days',
  stuck: 'Same stage for 30 days',
  quiet_connector: 'No contact in 90 days',
}
```

In `web/src/lib/colour.ts`, replace:

```ts
/** The attention reasons on Home. A missed next step is urgent; going quiet or stuck is a warning. */
export const REASON_TONE: Record<string, TagTone> = {
  overdue: 'urgent',
  quiet: 'warning',
  stuck: 'warning',
}
```

with:

```ts
/** The attention reasons on Home. A missed next step is urgent; going quiet or stuck, or a connector gone quiet, is a
 * warning. */
export const REASON_TONE: Record<string, TagTone> = {
  overdue: 'urgent',
  quiet: 'warning',
  stuck: 'warning',
  quiet_connector: 'warning',
}
```

- [ ] **Step 5: Home lists quiet connectors**

In `web/src/pages/HomePage.tsx`, replace:

```tsx
import { Alert, Column, ColumnEmpty, Stat, Tag } from '@tiagopedras/tenon'
```

with:

```tsx
import { Alert, Card, Column, ColumnEmpty, Stat, Tag } from '@tiagopedras/tenon'
```

replace:

```tsx
import { OrgDrawer } from '../components/OrgDrawer'
```

with:

```tsx
import { OrgDrawer } from '../components/OrgDrawer'
import { Star } from '../components/Star'
```

replace:

```tsx
  const overdue = attention.data?.filter((a) => a.reasons.includes('overdue')).length ?? 0
```

with:

```tsx
  const overdue = attention.data?.filter((a) => 'org' in a && a.reasons.includes('overdue')).length ?? 0
```

and replace:

```tsx
            attention.data.map((a) => (
              <OrgCard
                key={a.org.id}
                org={a.org}
                onOpen={(o) => drawer.open(o.slug)}
                footer={
                  <span className="tn-custom-chiprow">
                    {a.org.next_step_due && <DueDate due={a.org.next_step_due} />}
                    {a.reasons.map((r) => <Tag key={r} tone={REASON_TONE[r]}>{REASON_TEXT[r]}</Tag>)}
                  </span>
                }
              />
            ))
```

with:

```tsx
            attention.data.map((a) =>
              'org' in a ? (
                <OrgCard
                  key={`org${a.org.id}`}
                  org={a.org}
                  onOpen={(o) => drawer.open(o.slug)}
                  footer={
                    <span className="tn-custom-chiprow">
                      {a.org.next_step_due && <DueDate due={a.org.next_step_due} />}
                      {a.reasons.map((r) => <Tag key={r} tone={REASON_TONE[r]}>{REASON_TEXT[r]}</Tag>)}
                    </span>
                  }
                />
              ) : (
                <Card
                  key={`contact${a.contact.id}`}
                  titleAs="h3"
                  title={<span className="tn-cluster"><Star /><Link to={`/c/${a.contact.id}`}>{a.contact.name}</Link></span>}
                  summary={a.contact.org_name ? <span className="tn-custom-muted">{a.contact.org_name}</span> : undefined}
                  footer={
                    <span className="tn-custom-chiprow">
                      {a.reasons.map((r) => <Tag key={r} tone={REASON_TONE[r]}>{REASON_TEXT[r]}</Tag>)}
                    </span>
                  }
                />
              ),
            )
```

- [ ] **Step 6: Rewrite `web/src/pages/SearchPage.tsx`**

```tsx
import { Alert, Column, ColumnEmpty } from '@tiagopedras/tenon'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { SearchHit } from '../api/types'
import { Loading } from '../components/Loading'
import { OrgDrawer } from '../components/OrgDrawer'
import { Star } from '../components/Star'
import { StatusTag } from '../components/StatusTag'
import { openInPlace } from '../lib/openInPlace'
import { useApi } from '../lib/useApi'
import { useOrgDrawer } from '../lib/useOrgDrawer'

const GROUPS: { kind: SearchHit['kind']; title: string }[] = [
  { kind: 'org', title: 'Organisations' },
  { kind: 'contact', title: 'Contacts' },
  { kind: 'interaction', title: 'Interactions' },
  { kind: 'research', title: 'Research' },
]

export function hitLink(h: SearchHit): string {
  if (h.kind === 'contact') return `/c/${h.id}`
  // A log with no organisation lives on its person's page.
  if (h.kind === 'interaction') return h.org_slug ? `/o/${h.org_slug}#i-${h.id}` : `/c/${h.contact_id}`
  if (h.kind === 'research') return h.contact_id ? `/c/${h.contact_id}#research` : `/o/${h.org_slug}#research`
  return `/o/${h.org_slug}`
}

/** The API wraps each match in \u0002 and \u0003, which never occur in typed text. */
export function Snippet({ text }: { text: string }) {
  return (
    <span className="tn-custom-faint">
      {text.split(/(\u0002[^\u0003]*\u0003)/).map((part, i) =>
        part.startsWith('\u0002') && part.endsWith('\u0003') ? <mark key={i} className="tn-custom-mark">{part.slice(1, -1)}</mark> : part,
      )}
    </span>
  )
}

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const hits = useApi(() => (q ? api.search(q) : Promise.resolve([] as SearchHit[])), [q], { keep: true })
  const drawer = useOrgDrawer()

  if (!q) return <ColumnEmpty>Type in the search box to find organisations, people and notes.</ColumnEmpty>
  if (hits.error) return <Alert tone="error">{hits.error.message}</Alert>
  if (!hits.data) return <Loading />
  if (hits.data.length === 0) return <ColumnEmpty>No matches for “{q}”.</ColumnEmpty>

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Search</h1>
      {GROUPS.map((g) => {
        const list = hits.data!.filter((h) => h.kind === g.kind)
        if (list.length === 0) return null
        return (
          <Column key={g.kind} titleAs="h2" title={g.title}>
            <ul className="tn-custom-rows">
              {list.map((h) => {
                const slug = h.org_slug
                return (
                  <li key={`${h.kind}${h.id}`}>
                    <div className="tn-cluster">
                      {h.kind === 'org' && slug ? (
                        <Link to={hitLink(h)} data-org-open={slug} onClick={(e) => openInPlace(e, () => drawer.open(slug))}>{h.title}</Link>
                      ) : (
                        <Link to={hitLink(h)}>{h.title}</Link>
                      )}
                      {h.connector && <Star />}
                      {h.kind !== 'org' && h.org_name && <span className="tn-custom-faint">· {h.org_name}</span>}
                      {h.org_status && <StatusTag status={h.org_status} />}
                    </div>
                    <div><Snippet text={h.snippet} /></div>
                  </li>
                )
              })}
            </ul>
          </Column>
        )
      })}
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={() => hits.reload()} onDeleted={() => hits.reload()} />
    </div>
  )
}
```

- [ ] **Step 7: Update the README's feed items**

In `README.md`, replace:

```
- **Search** (`/api/search?q=`): `kind` (`org`, `contact`, `interaction` or
  `research`), `id`, `org_id`, `org_name`, `org_slug`, `org_status` (the organisation's current status), `title`, `snippet`
  (each match wrapped in the control characters `\u0002` and `\u0003`), and
  `contact_id`: the person a research brief is about, null otherwise.
```

with:

```
- **Search** (`/api/search?q=`): `kind` (`org`, `contact`, `interaction` or
  `research`), `id`, `org_id`, `org_name`, `org_slug`, `org_status` (the
  organisation's current status; all four null for a person or a log with no
  organisation), `title`, `snippet` (each match wrapped in the control
  characters `\u0002` and `\u0003`), `contact_id` (the person a research brief
  is about, or the first person on a log with no organisation; null
  otherwise) and `connector` (true for a person who is a key connector).
  Partners are found like any organisation.
```

and replace:

```
- **Needs attention** (`/api/attention`): `{org, reasons}`, where `org` is an
  organisation and `reasons` is a list of `overdue`, `quiet` and `stuck`.
```

with:

```
- **Needs attention** (`/api/attention`): first `{org, reasons}`, where `org`
  is an organisation and `reasons` is a list of `overdue`, `quiet` and
  `stuck`; then `{contact, reasons: ["quiet_connector"]}` for each key
  connector with no log in 90 days (counted from when they were added if they
  have none), A to Z. Activity lists only logs that have an organisation.
```

- [ ] **Step 8: Run the web checks**

Run: `(cd web && npm run check && npm test)`
Expected: PASS.

- [ ] **Step 9: Run both suites and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test)
git add web/src README.md
git commit -m "Web: quiet connectors on Home, and search hits with no organisation"
```

---

## Task 13: End to end, and the docs that point here

**Files:**
- Create: `web/e2e/people.spec.ts`
- Modify: `CLAUDE.md` ("Read before changing anything" and "Where the work stands")

- [ ] **Step 1: Write the end-to-end flow**

Create `web/e2e/people.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { newOrg, unique } from './helpers'

test('a connector without a company introduces a lead, and their gift is ticked in Thanks', async ({ page, request }) => {
  const name = unique('Marta Connector')

  // Add them on People: no organisation, the star on by default.
  await page.goto('/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Name/).fill(name)
  await expect(dialog.getByLabel('Key connector')).toBeChecked()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name })).toBeVisible()

  // Mark them as having introduced a lead.
  const lead = await newOrg(request, unique('Introduced Lead'))
  await page.goto(`/o/${lead.slug}`)
  await page.getByRole('button', { name: 'Change' }).click()
  await page.getByRole('button', { name: 'Introduced by' }).click()
  await page.getByRole('menuitemradio', { name }).click()

  // The lead shows on their page.
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByRole('link', { name: lead.name })).toBeVisible()

  // Tick their gift.
  await page.goto('/people?view=thanks')
  const sent = page.getByLabel(`Sent to ${name}`)
  await sent.click() // the box is ticked once the save comes back
  await expect(sent).toBeChecked()
  const year = new Date().getFullYear()
  const rows: { contact: { name: string }; thanks: { sent_on: string | null } | null }[] =
    await (await request.get(`/api/thanks?year=${year}`)).json()
  expect(rows.find((r) => r.contact.name === name)?.thanks?.sent_on).toBeTruthy()
})
```

- [ ] **Step 2: Run it**

Run: `(cd web && npm run e2e)`
Expected: PASS on both the phone and desktop projects, with the existing flows still passing.

- [ ] **Step 3: Point `CLAUDE.md` at this plan**

In `CLAUDE.md`, replace:

```
- Plan 6, UI consistency with Bench: `docs/superpowers/plans/2026-11-18-binder-6-ui-consistency.md`; follow-up: `docs/superpowers/plans/2026-11-18-binder-6b-pipeline-list.md`
```

with:

```
- Plan 6, UI consistency with Bench: `docs/superpowers/plans/2026-11-18-binder-6-ui-consistency.md`; follow-up: `docs/superpowers/plans/2026-11-18-binder-6b-pipeline-list.md`
- Plan 7, partners and people: spec `docs/superpowers/specs/2026-11-24-binder-7-partners-people-design.md`, plan `docs/superpowers/plans/2026-11-24-binder-7-partners-people.md`
```

replace:

```
There are six plans, each one spec → plan → build → review:
```

with:

```
There are seven plans, each one spec → plan → build → review:
```

and after the item that starts `6. UI consistency with Bench`, add:

```
7. Partners and people: partners as an organisation kind, contacts without
   an organisation, key connectors with a People tab, who introduced a lead,
   year-end thanks, and quiet connectors on Home
   (`docs/superpowers/plans/2026-11-24-binder-7-partners-people.md`): in
   review on `feature/binder-7-partners-people`.
```

- [ ] **Step 4: Run every suite and commit**

```bash
.venv/bin/pytest -q && (cd web && npm run check && npm test) && (cd web && npm run e2e)
git add web/e2e/people.spec.ts CLAUDE.md
git commit -m "End to end: a connector introduces a lead and gets their thanks; plan 7 in CLAUDE.md"
```

The controller opens the PR. Its description should say the migration rebuilds three tables (snapshot rollback covers it, as for every migration), that there are no new settings, and that deleting an organisation now keeps its people.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Migration 006 rebuilds `organisations`, `contacts`, `interactions`; indexes, one-primary rule and every search trigger recreated; `foreign_key_check` passes | 1 |
| `kind` CHECK gains `partner`; `introduced_by_contact_id` / `introduced_by_org_id` with SET NULL and the one-of-two CHECK | 1 |
| Contact `org_id` nullable (SET NULL), `connector`, `postal_address`, no primary without an organisation | 1, 3 |
| Interaction `org_id` nullable; organisation-or-person rule enforced in the write | 1, 4 |
| `thanks` table, `UNIQUE (contact_id, year)` | 1, 5 |
| Search: contact rows with null `org_id`; partners found like any organisation | 1, 4 |
| `KINDS` + `PARTNER_STATUSES`, `initial_status("partner")`, partner never changes kind, `/api/meta` | 2 |
| Repo checks `introduced_by_org_id` is a partner and not itself | 2 |
| `GET /api/orgs?kind=partner`; POST/PATCH accept `kind: partner` and the introduced-by fields | 2 |
| `GET /api/orgs/{id}` adds `introduced_by` | 2 (on every organisation read) |
| `GET /api/orgs/{id}/introduced` and `GET /api/contacts/{id}/introduced`, with the clients' total | 2, 3 |
| `GET /api/people?connector=1&q=` with last interaction and introduced count, connectors first | 3 |
| `POST /api/contacts`; `PATCH /api/contacts/{id}` with `org_id`, `connector`, `postal_address` | 3 |
| Deleting an organisation keeps its people | 1, 3; web note in 11 |
| `POST /api/contacts/{id}/interactions` | 4 |
| `GET /api/thanks?year=`, `PUT` and `DELETE /api/thanks/{contact_id}/{year}` | 5 |
| `GET /api/attention` lists quiet connectors (`quiet_connector`), 89 vs 91 days tested | 6 |
| `types.ts` and README change together | 7, 9, 12 |
| Header tabs Home, Pipeline, List, Partners, People | 8, 10 |
| Pipeline and List show leads and clients only; List chips All, Leads, Clients | 8 |
| Partners page: rows with status, owner, people (starred), clients and leads introduced, clients' value; drawer and page; New partner | 8 |
| People page: Connectors (default) / Everyone chips, search box, star, role, organisation link, last touched, introduced count, Email / Call / LinkedIn only when present, New person with the star on | 10 |
| Thanks view: year (default this year), postal address, what, Sent (today), note, how many done | 10 |
| Contact page: Key connector toggle, organisation editable and clearable, postal address, Introduced section, Log without an organisation | 9 |
| Organisation page and drawer: Introduced by with a picker and a link; partner's Introduced section; delete says people are kept | 11 |
| Home: quiet connectors, "No contact in 90 days", linking to the person | 12 |
| Search: people without an organisation and partners in their groups; connector star | 4, 12 |
| Phone: People as stacked cards, reach buttons full width | 10 |
| Tests: migration, repo/API, web (Vitest), end to end (Playwright) | 1–6, 7–12, 13 |
| Deploy: no new settings; migration under the snapshot rollback | 1, PR note in 13 |

## Decisions this plan makes where the spec is open

- **Where the introduced-by picker lives.** In the overview (page and drawer), as a "Change" button that opens a Dropdown over people and partners and saves at once, sending only the fields that change. It is not in the New/Edit organisation form, so OrgForm stays as it is and loads nothing extra. The API still accepts both fields on create.
- **Thanks writes.** `PUT` changes only the fields it is given (`what`, `sent_on`, `note`). Its stale check uses the row's `updated_at`, or null when there is no row yet; anything else is a 409 whose `current` is the row as it is now (or null). Any contact may have a row, but `GET` lists connectors only. The frontend offers this year and the two before; the API's default year uses `BINDER_TZ`.
- **Research on someone with no organisation.** Refused with 422 (a research row needs its organisation); the contact page hides Research for them.
- **Logs with no organisation.** Their other people only need to exist; a log made through a person who has an organisation follows the existing rule (everyone on it belongs to that organisation). Clearing every person off such a log is a 422, and deleting the last person on it deletes the log.
- **Moving a person.** A move clears `is_primary` unless the same save sets it; moving in as the one to talk to replaces the old one. `PATCH` to a missing organisation is a 422; `POST /api/contacts` with a missing one is a 404, like the organisation-scoped route.
- **Deleting an organisation.** The repo first sets its people's `org_id` to null and `is_primary` to 0 (with `updated_at`/`updated_by`), because the new CHECK would otherwise refuse the delete; so the delete route now passes who is signed in. The organisation's own log, research and Bench links still go with it.
- **Search hits with no organisation.** `org_id`, `org_name`, `org_slug` and `org_status` are null; an interaction hit carries the first person on the log as `contact_id` and links to their page. `connector` is on every hit.
- **Needs attention order.** Organisations first, as today, then quiet connectors A to Z. A connector never logged counts from when they were added. The figure strip's "missed next step" counts organisations only.
- **Recent activity.** Unchanged: it lists only logs that have an organisation. A log with no organisation shows on the person's page and in search.
- **Partners list figures.** Counted in the browser from one `GET /api/orgs` (each organisation's `introduced_by_org_id`) and one `GET /api/people`; no new route. People and Partners filter locally, like List; `/api/people` still takes `connector` and `q` as the spec says.
- **Introduced response shape.** `{orgs: [{id, name, slug, kind, status, value_estimate}], client_value}`: `id` is added for list keys.
- **Partner status colours.** No new colour: `prospect` is neutral; `active` and `past` keep their client colours.
- **Web task order.** The contact-page task (9) comes before People and Thanks (10), because People's New person and its tests need a contact's organisation to be nullable first.

## Self-review

- Spec coverage: every row above points at a task; no requirement is left without one.
- Placeholders: none. Every code step has the code; every replace quotes the text it replaces, checked against the files on `docs/binder-7-partners-people` (or against the code an earlier task writes).
- Names used across tasks match: `orgs.introduced`, `orgs.INTRODUCED_BY`, `contacts.LAST_TOUCH`, `contacts.connectors`, `contacts.people`, `interactions.create_for_contact`, `thanks.for_year` / `put` / `delete`; on the web `api.people`, `api.createPerson`, `api.orgIntroduced`, `api.contactIntroduced`, `api.logForPerson`, `api.thanks`, `api.putThanks`, `api.deleteThanks`, `Person`, `Introduced`, `Thanks`, `ThanksRow`, `ThanksPut`, `PersonInput`, `OrgAttention`, `PersonAttention`, `Star`, `IntroducedSection`, `IntroducedBy`, `ReachButtons`, `ThanksView`, `shortDay`.
- Dry run: Tasks 1 to 6 were applied to a scratch copy of the branch and `pytest` passed (354 passed); Tasks 7 to 12 were applied in order, and after each one `tsc --noEmit` and Vitest passed (289 tests at the end); Task 13's Playwright flow passed on the phone and desktop projects with the existing flows.
