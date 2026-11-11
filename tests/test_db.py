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


def _fake_migrations(tmp_path, monkeypatch, extra):
    mig = tmp_path / "migs"
    mig.mkdir()
    (mig / "001_init.sql").write_text((REAL_MIGRATIONS / "001_init.sql").read_text())
    for name, sql in extra.items():
        (mig / name).write_text(sql)
    monkeypatch.setattr("ledger.db.MIGRATIONS", mig)
    return mig


def test_table_rebuild_migration_keeps_child_rows(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                 " VALUES ('a','A','lead','new','t','t','u')")
    conn.execute("INSERT INTO contacts(org_id,name,created_at,updated_at,updated_by)"
                 " VALUES (1,'C','t','t','u')")
    rebuild = (
        "CREATE TABLE organisations_new (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE,"
        " name TEXT NOT NULL, website TEXT, sector TEXT, size TEXT, location TEXT, kind TEXT NOT NULL,"
        " status TEXT NOT NULL, owner_email TEXT, source TEXT, value_estimate REAL,"
        " tags TEXT NOT NULL DEFAULT '[]', summary TEXT, next_step TEXT, next_step_due TEXT,"
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);\n"
        "INSERT INTO organisations_new SELECT * FROM organisations;\n"
        "DROP TABLE organisations;\n"
        "ALTER TABLE organisations_new RENAME TO organisations;\n"
    )
    _fake_migrations(tmp_path, monkeypatch, {"002_rebuild.sql": rebuild})
    migrate(conn, path)
    assert conn.execute("SELECT count(*) FROM contacts").fetchone()[0] == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 2
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_migration_leaving_dangling_rows_is_rejected(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                 " VALUES ('a','A','lead','new','t','t','u')")
    conn.execute("INSERT INTO contacts(org_id,name,created_at,updated_at,updated_by)"
                 " VALUES (1,'C','t','t','u')")
    _fake_migrations(tmp_path, monkeypatch, {"002_bad.sql": "DELETE FROM organisations;"})
    with pytest.raises(sqlite3.IntegrityError):
        migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM organisations").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_concurrent_migrate_from_four_threads(tmp_path):
    import threading
    path = str(tmp_path / "l.db")
    errors = []

    def run():
        try:
            c = connect(path)
            migrate(c, path)
            assert c.execute("PRAGMA user_version").fetchone()[0] == 1
            c.close()
        except Exception as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=run) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []


def test_bad_migration_filename_refused(tmp_path, monkeypatch):
    _fake_migrations(tmp_path, monkeypatch, {"notes.sql": "SELECT 1;"})
    conn = connect(str(tmp_path / "l.db"))
    with pytest.raises(RuntimeError):
        migrate(conn, str(tmp_path / "l.db"))


def test_duplicate_migration_number_refused(tmp_path, monkeypatch):
    _fake_migrations(tmp_path, monkeypatch, {"001_other.sql": "SELECT 1;"})
    conn = connect(str(tmp_path / "l.db"))
    with pytest.raises(RuntimeError):
        migrate(conn, str(tmp_path / "l.db"))


def test_database_newer_than_code_refused(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    conn.execute("PRAGMA user_version = 5")
    with pytest.raises(RuntimeError, match="newer"):
        migrate(conn, path)


def test_migrate_refuses_open_transaction(tmp_path):
    conn = connect(str(tmp_path / "l.db"))
    conn.execute("BEGIN")
    with pytest.raises(RuntimeError):
        migrate(conn, str(tmp_path / "l.db"))


def test_contact_is_primary_must_be_0_or_1(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                 " VALUES ('a','A','lead','new','t','t','u')")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by)"
                     " VALUES (1,'C',2,'t','t','u')")


def test_interaction_contacts_contact_index_exists(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "interaction_contacts_contact" in names
