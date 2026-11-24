import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import RELATIONSHIPS
from . import like, orgs, row

FIELDS = ("name", "role", "email", "phone", "linkedin_url", "notes", "is_primary", "relationship",
          "connector", "postal_address")
FLAGS = ("is_primary", "connector")  # stored as 0 or 1, read as booleans
SELECT = ("SELECT c.*, o.name AS org_name, o.slug AS org_slug FROM contacts c "
          "LEFT JOIN organisations o ON o.id = c.org_id ")
# When someone was last on a log, through the people each log was with.
LAST_TOUCH = ("(SELECT max(i.happened_at) FROM interactions i JOIN interaction_contacts ic "
              "ON ic.interaction_id = i.id WHERE ic.contact_id = c.id)")
INTRODUCED_COUNT = "(SELECT count(*) FROM organisations x WHERE x.introduced_by_contact_id = c.id)"
NO_ORG_PRIMARY = "Only someone at an organisation can be the one to talk to"


def _out(r) -> Dict[str, Any]:
    d = row(r)
    for k in FLAGS:
        d[k] = bool(d[k])
    return d


def _value(k: str, v: Any) -> Any:
    return int(v) if k in FLAGS else v


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


def connectors(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Every key connector, A to Z."""
    return [_out(r) for r in conn.execute(SELECT + "WHERE c.connector = 1 ORDER BY c.name COLLATE NOCASE")]


def people(conn: sqlite3.Connection, connector: bool = False, q: Optional[str] = None) -> List[Dict[str, Any]]:
    """Everyone, with or without an organisation: connectors first, then A to Z.
    Each carries `last_contact` (their newest log) and `introduced_count`."""
    where, args = [], []  # type: List[str], List[Any]
    if connector:
        where.append("c.connector = 1")
    if q:
        where.append("(c.name LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')")
        args += [like(q), like(q)]
    sql = ("SELECT c.*, o.name AS org_name, o.slug AS org_slug, %s AS last_contact, %s AS introduced_count "
           "FROM contacts c LEFT JOIN organisations o ON o.id = c.org_id %s "
           "ORDER BY c.connector DESC, c.name COLLATE NOCASE") % (
        LAST_TOUCH, INTRODUCED_COUNT, ("WHERE " + " AND ".join(where)) if where else "")
    return [_out(r) for r in conn.execute(sql, args)]


def _clear_primary(conn, org_id: int, keep: int) -> None:
    conn.execute("UPDATE contacts SET is_primary = 0 WHERE org_id = ? AND id != ?", (org_id, keep))


def create(conn: sqlite3.Connection, org_id: Optional[int], data: Dict[str, Any], by: str) -> Dict[str, Any]:
    """A person at `org_id`, or on their own when it is None."""
    _check(data)
    if org_id is None and data.get("is_primary"):
        raise Invalid(NO_ORG_PRIMARY)
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN IMMEDIATE")
    try:
        if org_id is not None:
            orgs.get(conn, org_id)  # checked under the write lock, so the org cannot vanish before the insert
            if data.get("is_primary"):
                _clear_primary(conn, org_id, 0)  # before the insert: a unique index allows one primary
        cur = conn.execute(
            "INSERT INTO contacts(org_id, created_at, updated_at, updated_by, %s) VALUES (?,?,?,?,%s)"
            % (", ".join(cols), ", ".join("?" * len(cols))),
            [org_id, at, at, by] + [_value(c, data[c]) for c in cols])
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
        sets = {k: _value(k, v) for k, v in patch.items() if k in FIELDS}
        org_id = current["org_id"]
        if "org_id" in patch and patch["org_id"] != org_id:
            org_id = patch["org_id"]
            if org_id is not None and conn.execute(
                    "SELECT 1 FROM organisations WHERE id = ?", (org_id,)).fetchone() is None:
                raise Invalid("No organisation %d" % org_id)
            sets["org_id"] = org_id
            # Being the one to talk to belongs to the old organisation, unless this save says otherwise.
            sets.setdefault("is_primary", 0)
        if sets.get("is_primary", int(current["is_primary"])) and org_id is None:
            raise Invalid(NO_ORG_PRIMARY)
        if sets.get("is_primary"):
            _clear_primary(conn, org_id, contact_id)  # before the update, see create()
        sets["updated_at"], sets["updated_by"] = now(), by
        conn.execute("UPDATE contacts SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [contact_id])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, contact_id)


def delete(conn: sqlite3.Connection, contact_id: int, by: str) -> None:
    conn.execute("BEGIN IMMEDIATE")
    try:
        # A log with no organisation is held by its people: one left with nobody goes with its last person.
        conn.execute(
            "DELETE FROM interactions WHERE org_id IS NULL "
            "AND id IN (SELECT interaction_id FROM interaction_contacts WHERE contact_id = ?) "
            "AND NOT EXISTS (SELECT 1 FROM interaction_contacts ic "
            "                WHERE ic.interaction_id = interactions.id AND ic.contact_id != ?)",
            (contact_id, contact_id))
        # Say so on the organisations they introduced, so an open form sees a change.
        conn.execute("UPDATE organisations SET introduced_by_contact_id = NULL, updated_at = ?, updated_by = ? "
                     "WHERE introduced_by_contact_id = ?", (now(), by, contact_id))
        if conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,)).rowcount == 0:
            raise NotFound("No contact %d" % contact_id)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
