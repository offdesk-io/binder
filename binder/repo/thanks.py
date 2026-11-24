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
