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
