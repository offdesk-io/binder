"""Migration 009 adds the key connector star, a postal address and the thanks
table. A database at version 8 keeps every row and its search index."""

import sqlite3

import pytest

from binder.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate

T = "2026-11-01T10:00:00.000000+00:00"
TABLES = ("organisations", "contacts", "interactions", "interaction_contacts", "status_history")


def _v8(tmp_path, monkeypatch):
    mig = tmp_path / "migs8"
    mig.mkdir()
    for f in REAL_MIGRATIONS.glob("*.sql"):
        if int(f.name[:3]) <= 8:
            (mig / f.name).write_text(f.read_text())
    monkeypatch.setattr("binder.db.MIGRATIONS", mig)
    path = str(tmp_path / "v8.db")
    conn = connect(path)
    migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 8
    conn.execute("INSERT INTO organisations(slug,name,kind,status,tags,created_at,updated_at,updated_by)"
                 " VALUES ('acme','Acme','lead','lead','[]',?,?,'u')", (T, T))
    conn.execute("INSERT INTO organisations(slug,name,kind,status,tags,created_at,updated_at,updated_by)"
                 " VALUES ('rita','Rita Example','referrer','active','[]',?,?,'u')", (T, T))
    conn.execute("INSERT INTO contacts(org_id,name,role,is_primary,created_at,updated_at,updated_by)"
                 " VALUES (1,'Bo','Founder',1,?,?,'u')", (T, T))
    conn.execute("INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by)"
                 " VALUES (2,'Rita Example',1,?,?,'u')", (T, T))
    conn.execute("UPDATE organisations SET person_contact_id = 2, updated_at = ? WHERE id = 2", (T,))
    conn.execute("UPDATE organisations SET introduced_by_id = 2 WHERE id = 1")
    conn.execute("INSERT INTO interactions(org_id,type,happened_at,summary,author_email,created_at,updated_at,updated_by)"
                 " VALUES (1,'call',?,'Talked','u',?,?,'u')", (T, T, T))
    conn.execute("INSERT INTO interaction_contacts VALUES (1, 1)")
    return conn, path


def _snapshot(conn):
    out = {t: [tuple(r) for r in conn.execute("SELECT * FROM %s ORDER BY 1, 2" % t)] for t in TABLES}
    out["search"] = [tuple(r) for r in conn.execute("SELECT kind, ref_id, org_id, title, body FROM search ORDER BY 1, 2")]
    return out


def _to_latest(conn, path, monkeypatch):
    monkeypatch.setattr("binder.db.MIGRATIONS", REAL_MIGRATIONS)
    migrate(conn, path)


def test_a_v8_database_keeps_every_row(tmp_path, monkeypatch):
    conn, path = _v8(tmp_path, monkeypatch)
    before = _snapshot(conn)
    _to_latest(conn, path, monkeypatch)
    assert conn.execute("PRAGMA user_version").fetchone()[0] >= 9
    after = _snapshot(conn)
    # contacts gained two columns at the end, both empty
    assert [r[:-2] for r in after["contacts"]] == before["contacts"]
    assert [r[-2:] for r in after["contacts"]] == [(0, None), (0, None)]
    for t in ("organisations", "interactions", "interaction_contacts", "status_history", "search"):
        assert after[t] == before[t]
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_the_new_rules_hold(tmp_path, monkeypatch):
    conn, path = _v8(tmp_path, monkeypatch)
    _to_latest(conn, path, monkeypatch)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE contacts SET connector = 2 WHERE id = 1")
    ins = "INSERT INTO thanks(contact_id, year, created_at, updated_at, updated_by) VALUES (?, 2026, ?, ?, 'u')"
    conn.execute(ins, (1, T, T))
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(ins, (1, T, T))  # one row per person and year
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(ins, (99, T, T))  # no such person
    conn.execute("DELETE FROM contacts WHERE id = 1")
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_the_contact_search_triggers_still_work(tmp_path, monkeypatch):
    conn, path = _v8(tmp_path, monkeypatch)
    _to_latest(conn, path, monkeypatch)
    conn.execute("UPDATE contacts SET connector = 1, postal_address = '1 Example Street', role = 'Chef' WHERE id = 1")
    assert conn.execute("SELECT count(*) FROM search WHERE search MATCH 'chef'").fetchone()[0] == 1
    triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='contacts'")}
    assert triggers == {"contact_ai", "contact_au", "contact_ad"}
