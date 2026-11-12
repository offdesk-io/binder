import sqlite3
from typing import Any, Dict, List

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import RELATIONSHIPS
from . import orgs, row

FIELDS = ("name", "role", "email", "phone", "linkedin_url", "notes", "is_primary", "relationship")
SELECT = ("SELECT c.*, o.name AS org_name, o.slug AS org_slug FROM contacts c "
          "JOIN organisations o ON o.id = c.org_id ")


def _out(r) -> Dict[str, Any]:
    d = row(r)
    d["is_primary"] = bool(d["is_primary"])
    return d


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


def _clear_primary(conn, org_id: int, keep: int) -> None:
    conn.execute("UPDATE contacts SET is_primary = 0 WHERE org_id = ? AND id != ?", (org_id, keep))


def create(conn: sqlite3.Connection, org_id: int, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    _check(data)
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN IMMEDIATE")
    try:
        orgs.get(conn, org_id)  # checked under the write lock, so the org cannot vanish before the insert
        if data.get("is_primary"):
            _clear_primary(conn, org_id, 0)  # before the insert: a unique index allows one primary
        cur = conn.execute(
            "INSERT INTO contacts(org_id, created_at, updated_at, updated_by, %s) VALUES (?,?,?,?,%s)"
            % (", ".join(cols), ", ".join("?" * len(cols))),
            [org_id, at, at, by] + [int(data[c]) if c == "is_primary" else data[c] for c in cols])
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
        sets = {k: (int(v) if k == "is_primary" else v) for k, v in patch.items() if k in FIELDS}
        sets["updated_at"], sets["updated_by"] = now(), by
        if patch.get("is_primary"):
            _clear_primary(conn, current["org_id"], contact_id)  # before the update, see create()
        conn.execute("UPDATE contacts SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [contact_id])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, contact_id)


def delete(conn: sqlite3.Connection, contact_id: int) -> None:
    if conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,)).rowcount == 0:
        raise NotFound("No contact %d" % contact_id)
