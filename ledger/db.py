"""SQLite access: one connection per request, numbered migrations at startup.

Migrations are `migrations/NNN_name.sql`, applied in order, each in its own
transaction together with `PRAGMA user_version = NNN`, so a failed one leaves
the database exactly as it was. Migration files must not contain BEGIN or
COMMIT: migrate() wraps them. Foreign keys are switched off while one runs (so
a table rebuild does not cascade-delete child rows) and `foreign_key_check`
must come back clean before it commits. A migration that rebuilds a table
(create new, copy, drop old, rename) loses that table's triggers and CHECKs
with the old one, for example the org_* search triggers, and must recreate
them. A file lock serialises concurrent
migrators. Before migrating a database that already has
a schema, a copy goes to `<db dir>/backups/<name>-v<version>-<stamp>.db`.
"""

import datetime
import fcntl
import os
import pathlib
import re
import sqlite3
from typing import Iterator, List, Optional, Tuple

from fastapi import Request

MIGRATIONS = pathlib.Path(__file__).parent / "migrations"


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="microseconds")


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _version(conn: sqlite3.Connection) -> int:
    return conn.execute("PRAGMA user_version").fetchone()[0]


def _backup(conn: sqlite3.Connection, path: str, version: int) -> None:
    db = pathlib.Path(path)
    folder = db.parent / "backups"
    folder.mkdir(exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = sqlite3.connect(str(folder / ("%s-v%d-%s.db" % (db.stem, version, stamp))))
    with dest:
        conn.backup(dest)
    dest.close()


_NAME = re.compile(r"^(\d{3})_.+\.sql$")


def _migration_files() -> List[Tuple[int, pathlib.Path]]:
    found = {}
    for f in MIGRATIONS.glob("*.sql"):
        m = _NAME.match(f.name)
        if not m:
            raise RuntimeError("migration file %r does not match NNN_name.sql" % f.name)
        number = int(m.group(1))
        if number in found:
            raise RuntimeError("two migrations numbered %03d: %s and %s" % (number, found[number].name, f.name))
        found[number] = f
    return sorted(found.items())


def _apply(conn: sqlite3.Connection, number: int, f: pathlib.Path) -> None:
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        try:
            conn.executescript("BEGIN;\n%s\nPRAGMA user_version = %d;" % (f.read_text(), number))
            if conn.execute("PRAGMA foreign_key_check").fetchall():
                raise sqlite3.IntegrityError("migration %s left rows that break a foreign key" % f.name)
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")


def _migrate_locked(conn: sqlite3.Connection, path: Optional[str]) -> None:
    files = _migration_files()
    current = _version(conn)
    newest = files[-1][0] if files else 0
    if current > newest:
        raise RuntimeError("database is newer than this code (version %d, code knows %d)" % (current, newest))
    pending = [(n, f) for n, f in files if n > current]
    if not pending:
        return
    if current > 0 and path and path != ":memory:" and os.path.exists(path):
        _backup(conn, path, current)
    for number, f in pending:
        _apply(conn, number, f)


def migrate(conn: sqlite3.Connection, path: Optional[str] = None) -> None:
    if conn.in_transaction:
        raise RuntimeError("migrate() must not be called inside a transaction")
    if not path or path == ":memory:":
        _migrate_locked(conn, path)
        return
    with open(path + ".migrate.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            # WAL is set once, under the lock, so processes opening a brand-new
            # file together do not fight over the journal mode.
            conn.execute("PRAGMA journal_mode=WAL")
            _migrate_locked(conn, path)  # version is read after the lock is held
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    conn = connect(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()
