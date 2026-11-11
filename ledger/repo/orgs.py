import json
import re
import sqlite3
import unicodedata
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, NotFound
from ..statuses import check_transition, initial_status
from . import row

FIELDS = ("name", "website", "sector", "size", "location", "owner_email", "source",
          "value_estimate", "tags", "summary", "next_step", "next_step_due")

LAST_CONTACT = "(SELECT max(happened_at) FROM interactions i WHERE i.org_id = o.id)"


def slugify(text: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-") or "org"


def _unique_slug(conn: sqlite3.Connection, base: str) -> str:
    slug, n = base, 1
    while conn.execute("SELECT 1 FROM organisations WHERE slug = ?", (slug,)).fetchone():
        n += 1
        slug = "%s-%d" % (base, n)
    return slug


def _out(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    d = row(r)
    if d is not None:
        d["tags"] = json.loads(d["tags"])
    return d


def _history(conn, org_id: int, frm: Optional[str], to: str, by: str, at: str) -> None:
    conn.execute("INSERT INTO status_history(org_id, from_status, to_status, at, by_email) VALUES (?,?,?,?,?)",
                 (org_id, frm, to, at, by))


def get(conn: sqlite3.Connection, org_id: int) -> Dict[str, Any]:
    d = _out(conn.execute("SELECT o.*, %s AS last_contact FROM organisations o WHERE o.id = ?" % LAST_CONTACT,
                          (org_id,)).fetchone())
    if d is None:
        raise NotFound("No organisation %d" % org_id)
    return d


def get_by_slug(conn: sqlite3.Connection, slug: str) -> Dict[str, Any]:
    r = conn.execute("SELECT id FROM organisations WHERE slug = ?", (slug,)).fetchone()
    if r is None:
        raise NotFound("No organisation %r" % slug)
    return get(conn, r["id"])


def create(conn: sqlite3.Connection, data: Dict[str, Any], by: str) -> Dict[str, Any]:
    kind = data.pop("kind", "lead") or "lead"
    status = initial_status(kind)
    requested_slug = data.pop("slug", None)
    data.setdefault("owner_email", None)
    if not data["owner_email"]:
        data["owner_email"] = by
    data["tags"] = json.dumps(data.get("tags") or [])
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN IMMEDIATE")  # slug lookup and insert under one write lock
    slug = _unique_slug(conn, slugify(requested_slug or data["name"]))
    cur = conn.execute(
        "INSERT INTO organisations(slug, kind, status, created_at, updated_at, updated_by, %s) VALUES (?,?,?,?,?,?,%s)"
        % (", ".join(cols), ", ".join("?" * len(cols))),
        [slug, kind, status, at, at, by] + [data[c] for c in cols])
    _history(conn, cur.lastrowid, None, status, by, at)
    conn.execute("COMMIT")
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, org_id: int, patch: Dict[str, Any], by: str) -> Dict[str, Any]:
    expected = patch.pop("updated_at")
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, org_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        at = now()
        sets: Dict[str, Any] = {k: v for k, v in patch.items() if k in FIELDS}
        if "tags" in sets:
            sets["tags"] = json.dumps(sets["tags"] or [])
        new_status = patch.get("status")
        if new_status and new_status != current["status"]:
            kind, stored = check_transition(current["kind"], current["status"], new_status)
            sets["kind"], sets["status"] = kind, stored
            _history(conn, org_id, current["status"], new_status, by, at)
        sets["updated_at"], sets["updated_by"] = at, by
        conn.execute("UPDATE organisations SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in sets),
                     list(sets.values()) + [org_id])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, org_id)


def delete(conn: sqlite3.Connection, org_id: int) -> None:
    if conn.execute("DELETE FROM organisations WHERE id = ?", (org_id,)).rowcount == 0:
        raise NotFound("No organisation %d" % org_id)


def list_(conn: sqlite3.Connection, kind: Optional[str] = None, status: Optional[str] = None,
          owner: Optional[str] = None, tag: Optional[str] = None, q: Optional[str] = None,
          sort: str = "updated") -> List[Dict[str, Any]]:
    where, args = [], []  # type: List[str], List[Any]
    if kind:
        where.append("o.kind = ?"); args.append(kind)
    if status:
        where.append("o.status = ?"); args.append(status)
    if owner:
        where.append("o.owner_email = ?"); args.append(owner)
    if tag:
        where.append("EXISTS (SELECT 1 FROM json_each(o.tags) WHERE value = ?)"); args.append(tag)
    if q:
        where.append("o.name LIKE ?"); args.append("%" + q + "%")
    order = {"updated": "o.updated_at DESC", "name": "o.name COLLATE NOCASE",
             "last_contact": "last_contact IS NULL, last_contact DESC",
             "value": "o.value_estimate IS NULL, o.value_estimate DESC"}.get(sort, "o.updated_at DESC")
    sql = "SELECT o.*, %s AS last_contact FROM organisations o %s ORDER BY %s" % (
        LAST_CONTACT, ("WHERE " + " AND ".join(where)) if where else "", order)
    return [_out(r) for r in conn.execute(sql, args)]


def status_history(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    get(conn, org_id)
    return [row(r) for r in conn.execute(
        "SELECT * FROM status_history WHERE org_id = ? ORDER BY at DESC, id DESC", (org_id,))]
