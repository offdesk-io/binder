import sqlite3

import pytest

from ledger.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate

LATEST = max(int(f.name[:3]) for f in REAL_MIGRATIONS.glob("*.sql"))
NEXT = "%03d" % (LATEST + 1)


def tables(conn):
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table')")}


def test_migrate_creates_schema_and_sets_version(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == LATEST
    assert {"organisations", "contacts", "interactions", "interaction_contacts",
            "status_history", "search"} <= tables(conn)


def test_migrate_is_idempotent(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == LATEST


def test_backup_taken_before_migrating_existing_db(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)  # fresh database: latest version, no backup
    assert not (tmp_path / "backups").exists()
    _fake_migrations(tmp_path, monkeypatch, {NEXT + "_add.sql": "CREATE TABLE added(x);"})
    migrate(conn, path)
    assert len(list((tmp_path / "backups").glob("l-v%d-*.db" % LATEST))) == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == LATEST + 1


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
    for f in REAL_MIGRATIONS.glob("*.sql"):
        (mig / f.name).write_text(f.read_text())
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
    _fake_migrations(tmp_path, monkeypatch, {NEXT + "_rebuild.sql": rebuild})
    migrate(conn, path)
    assert conn.execute("SELECT count(*) FROM contacts").fetchone()[0] == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == LATEST + 1
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_migration_leaving_dangling_rows_is_rejected(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                 " VALUES ('a','A','lead','new','t','t','u')")
    conn.execute("INSERT INTO contacts(org_id,name,created_at,updated_at,updated_by)"
                 " VALUES (1,'C','t','t','u')")
    _fake_migrations(tmp_path, monkeypatch, {NEXT + "_bad.sql": "DELETE FROM organisations;"})
    with pytest.raises(sqlite3.IntegrityError):
        migrate(conn, path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] == LATEST
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
            assert c.execute("PRAGMA user_version").fetchone()[0] == LATEST
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


def _open_and_migrate(path):
    c = connect(path)
    migrate(c, path)
    assert c.execute("PRAGMA user_version").fetchone()[0] == LATEST
    assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    c.close()


def test_four_processes_open_a_fresh_file_at_once(tmp_path):
    import multiprocessing
    path = str(tmp_path / "l.db")
    ctx = multiprocessing.get_context("spawn")
    procs = [ctx.Process(target=_open_and_migrate, args=(path,)) for _ in range(4)]
    for p in procs:
        p.start()
    for p in procs:
        p.join(60)
    assert [p.exitcode for p in procs] == [0, 0, 0, 0]


def test_connect_leaves_journal_mode_to_migrate(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
    migrate(conn, path)
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_two_primary_contacts_cannot_coexist_even_via_sql(tmp_path):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    migrate(conn, path)
    conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                 " VALUES ('a','A','lead','lead','t','t','u')")
    ins = ("INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by)"
           " VALUES (1,'%s',%d,'t','t','u')")
    conn.execute(ins % ("C1", 1))
    conn.execute(ins % ("C2", 0))
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(ins % ("C3", 1))
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE contacts SET is_primary = 1 WHERE name = 'C2'")
