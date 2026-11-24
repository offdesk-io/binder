import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import INTERACTION_TYPES as TYPES
from . import orgs, row

FIELDS = ("type", "summary", "happened_at", "next_step", "next_step_due")
NEEDS_SOMEONE = "A log needs an organisation or at least one person"


def _with_contacts(conn, d: Dict[str, Any]) -> Dict[str, Any]:
    d["contact_ids"] = [r[0] for r in conn.execute(
        "SELECT contact_id FROM interaction_contacts WHERE interaction_id = ? ORDER BY contact_id", (d["id"],))]
    return d


def _check(conn, org_id: Optional[int], data: Dict[str, Any]) -> None:
    if "type" in data and data["type"] not in TYPES:
        raise Invalid("type must be one of %s" % ", ".join(TYPES))
    ids = data.get("contact_ids") or []
    if not ids:
        return
    marks = ",".join("?" * len(ids))
    if org_id is None:
        # A log with no organisation is about its people, wherever they are now.
        found = conn.execute("SELECT count(*) FROM contacts WHERE id IN (%s)" % marks, list(ids)).fetchone()[0]
        if found != len(set(ids)):
            raise Invalid("Every person on the log must be in Binder")
        return
    found = conn.execute("SELECT count(*) FROM contacts WHERE org_id = ? AND id IN (%s)" % marks,
                         [org_id] + list(ids)).fetchone()[0]
    if found != len(set(ids)):
        raise Invalid("Every contact must belong to this organisation")


def _set_contacts(conn, interaction_id: int, ids: List[int]) -> None:
    conn.execute("DELETE FROM interaction_contacts WHERE interaction_id = ?", (interaction_id,))
    conn.executemany("INSERT INTO interaction_contacts VALUES (?, ?)", [(interaction_id, c) for c in set(ids)])


def get(conn: sqlite3.Connection, interaction_id: int) -> Dict[str, Any]:
    d = row(conn.execute("SELECT * FROM interactions WHERE id = ?", (interaction_id,)).fetchone())
    if d is None:
        raise NotFound("No interaction %d" % interaction_id)
    return _with_contacts(conn, d)


def list_for_org(conn: sqlite3.Connection, org_id: int, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    orgs.get(conn, org_id)
    sql = "SELECT * FROM interactions WHERE org_id = ? ORDER BY happened_at DESC, id DESC"
    args: List[Any] = [org_id]
    if limit:
        sql += " LIMIT ?"
        args.append(limit)
    return [_with_contacts(conn, row(r)) for r in conn.execute(sql, args)]


def list_for_contact(conn: sqlite3.Connection, contact_id: int) -> List[Dict[str, Any]]:
    if conn.execute("SELECT id FROM contacts WHERE id = ?", (contact_id,)).fetchone() is None:
        raise NotFound("No contact %d" % contact_id)
    return [_with_contacts(conn, row(r)) for r in conn.execute(
        "SELECT i.* FROM interactions i JOIN interaction_contacts ic ON ic.interaction_id = i.id "
        "WHERE ic.contact_id = ? ORDER BY i.happened_at DESC, i.id DESC", (contact_id,))]


def _insert(conn: sqlite3.Connection, org_id: Optional[int], data: Dict[str, Any], by: str, at: str) -> int:
    """Inside the caller's write transaction, so the checks and the insert see the same rows."""
    if org_id is not None:
        orgs.get(conn, org_id)
    elif not data.get("contact_ids"):
        raise Invalid(NEEDS_SOMEONE)
    _check(conn, org_id, data)  # contact ownership is checked under the write lock
    cols = [f for f in FIELDS if f in data]
    cur = conn.execute(
        "INSERT INTO interactions(org_id, author_email, created_at, updated_at, updated_by, %s) "
        "VALUES (?,?,?,?,?,%s)" % (", ".join(cols), ", ".join("?" * len(cols))),
        [org_id, by, at, at, by] + [data[c] for c in cols])
    _set_contacts(conn, cur.lastrowid, data.get("contact_ids") or [])
    return cur.lastrowid


def create(conn: sqlite3.Connection, org_id: Optional[int], data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """A log for `org_id`, or, when it is None, about the people in `contact_ids` alone."""
    at = now()
    data["happened_at"] = data.get("happened_at") or at
    conn.execute("BEGIN IMMEDIATE")
    try:
        new_id = _insert(conn, org_id, data, by, at)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, new_id)


def create_for_contact(conn: sqlite3.Connection, contact_id: int, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """A log against one person: they are on it, and it belongs to their organisation if they have one."""
    at = now()
    data["happened_at"] = data.get("happened_at") or at
    conn.execute("BEGIN IMMEDIATE")
    try:
        r = conn.execute("SELECT org_id FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if r is None:
            raise NotFound("No contact %d" % contact_id)
        data["contact_ids"] = sorted(set(data.get("contact_ids") or []) | {contact_id})
        new_id = _insert(conn, r["org_id"], data, by, at)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, new_id)


def update(conn: sqlite3.Connection, interaction_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, interaction_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        _check(conn, current["org_id"], patch)
        if current["org_id"] is None and patch.get("contact_ids") == []:
            raise Invalid(NEEDS_SOMEONE)
        sets = {k: v for k, v in patch.items() if k in FIELDS}
        sets["updated_at"], sets["updated_by"] = now(), by
        conn.execute("UPDATE interactions SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [interaction_id])
        if patch.get("contact_ids") is not None:
            _set_contacts(conn, interaction_id, patch["contact_ids"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, interaction_id)


def delete(conn: sqlite3.Connection, interaction_id: int) -> None:
    if conn.execute("DELETE FROM interactions WHERE id = ?", (interaction_id,)).rowcount == 0:
        raise NotFound("No interaction %d" % interaction_id)
