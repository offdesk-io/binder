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
