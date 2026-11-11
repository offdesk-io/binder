import sqlite3

import pytest

from ledger.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate


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
    monkeypatch.setattr("ledger.db.MIGRATIONS", mig)
    migrate(conn, path)
    assert len(list((tmp_path / "backups").glob("l-v1-*.db"))) == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 2


def test_failed_migration_rolls_back(tmp_path, monkeypatch):
    mig = tmp_path / "migs"
    mig.mkdir()
    (mig / "001_bad.sql").write_text("CREATE TABLE ok(x); CREATE TABLE ok(x);")
    monkeypatch.setattr("ledger.db.MIGRATIONS", mig)
    path = str(tmp_path / "l.db")
    conn = connect(path)
    with pytest.raises(sqlite3.OperationalError):
        migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 0
    assert "ok" not in tables(conn)


def test_foreign_keys_on(tmp_path):
    conn = connect(str(tmp_path / "l.db"))
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
