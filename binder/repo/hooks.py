"""The queue of events for the Offdesk core. `queue` runs inside the caller's
transaction, so an event exists exactly when its change was committed. The
rest is binder/hooks.py's: what is due, and how each try went."""

import json
import sqlite3
from typing import Any, Dict, List, Optional

from . import row


def queue(conn: sqlite3.Connection, event: str, data: Dict[str, Any], at: str) -> None:
    """Call with a transaction open. The body is what the core receives, as sent. Its `id` is the row's:
    an event may arrive twice (sent, then the answer lost), so the receiver drops a repeated id."""
    cur = conn.execute("INSERT INTO hook_queue(event, body, created_at, next_at) VALUES (?,'',?,?)",
                       (event, at, at))
    body = json.dumps(dict(data, id=cur.lastrowid, event=event, at=at), ensure_ascii=False, separators=(",", ":"))
    conn.execute("UPDATE hook_queue SET body = ? WHERE id = ?", (body, cur.lastrowid))


def due(conn: sqlite3.Connection, now: str, limit: int = 50) -> List[Dict[str, Any]]:
    return [row(r) for r in conn.execute(
        "SELECT * FROM hook_queue WHERE next_at IS NOT NULL AND next_at <= ? ORDER BY id LIMIT ?", (now, limit))]


def _write(conn: sqlite3.Connection, sql: str, args: tuple) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(sql, args)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def sent(conn: sqlite3.Connection, hook_id: int, at: str) -> None:
    _write(conn, "UPDATE hook_queue SET tries = tries + 1, sent_at = ?, next_at = NULL, error = NULL WHERE id = ?",
           (at, hook_id))


def failed(conn: sqlite3.Connection, hook_id: int, error: str, next_at: Optional[str]) -> None:
    """`next_at` None gives up on it."""
    _write(conn, "UPDATE hook_queue SET tries = tries + 1, error = ?, next_at = ? WHERE id = ?",
           (error, next_at, hook_id))


def forget(conn: sqlite3.Connection, before: str) -> None:
    """Drops events sent, or given up on, that were queued before `before`."""
    _write(conn, "DELETE FROM hook_queue WHERE next_at IS NULL AND created_at < ?", (before,))
