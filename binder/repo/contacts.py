import sqlite3
from typing import Any, Dict, List

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import RELATIONSHIPS
from . import orgs, row

FIELDS = ("name", "role", "email", "phone", "linkedin_url", "notes", "is_primary", "relationship",
          "connector", "postal_address")
FLAGS = ("is_primary", "connector")  # stored as 0 or 1, read as booleans
# A referrer's own person: the contact its organisation tracks in person_contact_id.
IS_REFERRER = "(o.kind = 'referrer' AND o.person_contact_id = c.id)"
SELECT = ("SELECT c.*, o.name AS org_name, o.slug AS org_slug, %s AS is_referrer FROM contacts c "
          "JOIN organisations o ON o.id = c.org_id " % IS_REFERRER)


def _out(r) -> Dict[str, Any]:
    d = row(r)
    for k in FLAGS + ("is_referrer",):
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


def _keep_referrer_primary(conn, contact: Dict[str, Any]) -> None:
    """A referrer's primary contact is the person it is: another can take over
    as primary, but it cannot be unset or deleted on its own."""
    if contact["is_primary"] and conn.execute(
            "SELECT 1 FROM organisations WHERE id = ? AND kind = 'referrer'", (contact["org_id"],)).fetchone():
        raise Invalid("This is the referrer's own contact: make someone else primary first")


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
        if patch.get("is_primary") is False:
            _keep_referrer_primary(conn, current)
        sets = {k: _value(k, v) for k, v in patch.items() if k in FIELDS}
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
    conn.execute("BEGIN IMMEDIATE")
    try:
        _keep_referrer_primary(conn, get(conn, contact_id))
        conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
