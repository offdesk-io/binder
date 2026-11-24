import json
import re
import sqlite3
import unicodedata
from typing import Any, Dict, List, Optional, Sequence

from ..db import now
from ..errors import Conflict, Invalid, NotFound
from ..statuses import INTRODUCER_KINDS, SECTORS, check_transition, initial_status
from . import row

FIELDS = ("name", "website", "sector", "description", "size", "location", "owner_email", "source",
          "value_estimate", "tags", "summary", "next_step", "next_step_due", "introduced_by_id")
# A referrer is a person: these fields live on its primary contact, and these are refused on the record.
PERSON_FIELDS = ("email", "phone", "linkedin_url")
NOT_FOR_REFERRERS = ("website", "size", "sector")

LAST_CONTACT = "(SELECT max(happened_at) FROM interactions i WHERE i.org_id = o.id)"
# The partner or referrer who introduced this record, and the leads and clients
# a partner or referrer introduced (always empty for a lead or client), as JSON.
INTRODUCED_BY = ("(SELECT json_object('id', b.id, 'slug', b.slug, 'name', b.name, 'kind', b.kind) "
                 "FROM organisations b WHERE b.id = o.introduced_by_id)")
INTRODUCED = ("(SELECT json_group_array(json_object('id', x.id, 'slug', x.slug, 'name', x.name, 'kind', x.kind, "
              "'status', x.status)) FROM organisations x WHERE x.introduced_by_id = o.id)")
# When the record was last moved to `won`, so the Pipeline can show won clients.
WON_AT = "(SELECT max(at) FROM status_history h WHERE h.org_id = o.id AND h.to_status = 'won')"
# A referrer's own contact details, from its primary contact. Null for every other kind.
PERSON = ("(SELECT json_object('contact_id', c.id, 'email', c.email, 'phone', c.phone, 'linkedin_url', "
          "c.linkedin_url) FROM contacts c WHERE o.kind = 'referrer' AND c.org_id = o.id AND c.is_primary = 1)")
COLUMNS = "o.*, %s AS last_contact, %s AS won_at, %s AS introduced_by, %s AS introduced, %s AS person" % (
    LAST_CONTACT, WON_AT, INTRODUCED_BY, INTRODUCED, PERSON)


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
        d["introduced_by"] = json.loads(d["introduced_by"]) if d["introduced_by"] else None
        d["introduced"] = sorted(json.loads(d["introduced"]), key=lambda x: (x["name"].lower(), x["id"]))
        d["person"] = json.loads(d["person"]) if d["person"] else None
        d.pop("person_contact_id", None)  # bookkeeping for renames, not part of the record
    return d


def _history(conn, org_id: int, frm: Optional[str], to: str, by: str, at: str) -> None:
    conn.execute("INSERT INTO status_history(org_id, from_status, to_status, at, by_email) VALUES (?,?,?,?,?)",
                 (org_id, frm, to, at, by))


def _check_introducer(conn, kind: str, introducer_id: Optional[int], org_id: Optional[int] = None) -> None:
    """Only a lead or client has an introducer, and it is a partner or referrer other than itself."""
    if introducer_id is None:
        return
    if kind in INTRODUCER_KINDS:
        raise Invalid("A %s is not introduced by anyone: only leads and clients are" % kind)
    if introducer_id == org_id:
        raise Invalid("An organisation cannot introduce itself")
    r = conn.execute("SELECT kind FROM organisations WHERE id = ?", (introducer_id,)).fetchone()
    if r is None:
        raise Invalid("No organisation %d to have introduced this one" % introducer_id)
    if r["kind"] not in INTRODUCER_KINDS:
        raise Invalid("Organisation %d is a %s: only a partner or referrer introduces" % (introducer_id, r["kind"]))


def _check_fields(kind: str, data: Dict[str, Any], person: Optional[Dict[str, Any]],
                  owners: Optional[Sequence[str]]) -> None:
    """`data` holds only the fields being written. `owners` is None for scripts,
    which may write any owner; the API passes the BINDER_OWNERS emails."""
    if data.get("sector") not in (None,) + SECTORS:
        raise Invalid("sector must be one of %s, or null" % ", ".join(SECTORS))
    if kind == "referrer":
        refused = [f for f in NOT_FOR_REFERRERS if data.get(f) is not None]
        if refused:
            raise Invalid("A referrer is a person and has no %s" % " or ".join(refused))
    elif person:  # an empty `person` is the same as none
        raise Invalid("Only a referrer has person fields")
    owner = data.get("owner_email")
    if owners is not None and owner is not None and owner not in owners:
        raise Invalid("Handled by must be one of the team (%s), or nobody" % (", ".join(owners) or "none set"))


def _person(conn, org_id: int, name: str, person: Dict[str, Any], rename: bool, by: str, at: str) -> None:
    """A referrer has a contact of its own, tracked in `person_contact_id`: the one made for it, or the primary
    when it became a referrer. With none tracked, the primary is adopted, or one is made, named after it and
    primary. `rename` carries a new record name over to the tracked contact only. The person fields sent are
    written to the primary contact, which is what `person` reads."""
    own = conn.execute("SELECT person_contact_id FROM organisations WHERE id = ?", (org_id,)).fetchone()[0]
    primary = conn.execute("SELECT id FROM contacts WHERE org_id = ? AND is_primary = 1", (org_id,)).fetchone()
    fields = {k: v for k, v in person.items() if k in PERSON_FIELDS}
    if primary is None:
        made = dict(fields, name=name)
        cols = list(made)
        cur = conn.execute("INSERT INTO contacts(org_id, is_primary, created_at, updated_at, updated_by, %s) "
                           "VALUES (?,1,?,?,?,%s)" % (", ".join(cols), ", ".join("?" * len(cols))),
                           [org_id, at, at, by] + [made[c] for c in cols])
        conn.execute("UPDATE organisations SET person_contact_id = ? WHERE id = ?", (cur.lastrowid, org_id))
        return
    if own is None:
        conn.execute("UPDATE organisations SET person_contact_id = ? WHERE id = ?", (primary["id"], org_id))
        own = primary["id"]
    if rename:
        conn.execute("UPDATE contacts SET name = ?, updated_at = ?, updated_by = ? WHERE id = ?", (name, at, by, own))
    if fields:
        fields["updated_at"], fields["updated_by"] = at, by
        conn.execute("UPDATE contacts SET %s WHERE id = ?" % ", ".join("%s = ?" % k for k in fields),
                     list(fields.values()) + [primary["id"]])


def get(conn: sqlite3.Connection, org_id: int) -> Dict[str, Any]:
    d = _out(conn.execute("SELECT %s FROM organisations o WHERE o.id = ?" % COLUMNS, (org_id,)).fetchone())
    if d is None:
        raise NotFound("No organisation %d" % org_id)
    return d


def get_by_slug(conn: sqlite3.Connection, slug: str) -> Dict[str, Any]:
    r = conn.execute("SELECT id FROM organisations WHERE slug = ?", (slug,)).fetchone()
    if r is None:
        raise NotFound("No organisation %r" % slug)
    return get(conn, r["id"])


def create(conn: sqlite3.Connection, data: Dict[str, Any], by: str,
           owners: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    """A record with no owner is handled by whoever creates it, when they are
    one of `owners` (or always, for a script); `owner_email: None` is nobody. A referrer gets its primary
    contact, with any `person` fields, in the same transaction."""
    kind = data.pop("kind", "lead") or "lead"
    status = initial_status(kind)
    person = data.pop("person", None) or {}
    if data.get("introduced_by_id") is None:
        data.pop("introduced_by_id", None)
    requested_slug = data.pop("slug", None)
    # Not sent means the creator, when they are on the list; an explicit null means nobody.
    if "owner_email" not in data:
        data["owner_email"] = by if owners is None or by in owners else None
    _check_fields(kind, data, person, owners)
    data["tags"] = json.dumps(data.get("tags") or [])
    at = now()
    cols = [f for f in FIELDS if f in data]
    conn.execute("BEGIN IMMEDIATE")  # slug lookup and insert under one write lock
    try:
        _check_introducer(conn, kind, data.get("introduced_by_id"))
        slug = _unique_slug(conn, slugify(requested_slug or data["name"]))
        cur = conn.execute(
            "INSERT INTO organisations(slug, kind, status, created_at, updated_at, updated_by, %s) "
            "VALUES (?,?,?,?,?,?,%s)" % (", ".join(cols), ", ".join("?" * len(cols))),
            [slug, kind, status, at, at, by] + [data[c] for c in cols])
        _history(conn, cur.lastrowid, None, status, by, at)
        if kind == "referrer":
            _person(conn, cur.lastrowid, data["name"], person, False, by, at)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, cur.lastrowid)


def update(conn: sqlite3.Connection, org_id: int, patch: Dict[str, Any], by: str,
           owners: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    """A PATCH may change the kind, to fix a record filed as the wrong one. The
    record then takes the new kind's first status, or `status` from the same
    PATCH checked against the new kind, and history records the move like any
    status change. A partner or referrer has no introducer, so becoming one
    clears it; a partner or referrer that becomes a lead or client no longer
    introduces anyone, so the records it introduced lose their link.

    A record that is or becomes a referrer keeps one primary contact: made,
    named after it, if it has none, renamed with it, and holding the `person`
    fields. A record that stops being a referrer keeps its contacts."""
    expected = patch.pop("updated_at")
    person = patch.pop("person", None) or {}
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = get(conn, org_id)
        if current["updated_at"] != expected:
            raise Conflict(current)
        at = now()
        sets: Dict[str, Any] = {k: v for k, v in patch.items() if k in FIELDS}
        if "tags" in sets:
            sets["tags"] = json.dumps(sets["tags"] or [])
        kind, status = current["kind"], current["status"]
        new_kind = patch.get("kind")
        kind_changed = bool(new_kind) and new_kind != kind
        if kind_changed:
            kind, status = new_kind, initial_status(new_kind)
        new_status = patch.get("status")
        if new_status and (kind_changed or new_status != current["status"]):
            kind, status = check_transition(kind, new_status)
        if kind_changed or status != current["status"]:
            sets["kind"], sets["status"] = kind, status
            _history(conn, org_id, current["status"], new_status or status, by, at)
        if kind in INTRODUCER_KINDS and "introduced_by_id" not in sets and current["introduced_by_id"] is not None:
            sets["introduced_by_id"] = None
        if "introduced_by_id" in sets or kind_changed:
            _check_introducer(conn, kind, sets.get("introduced_by_id", current["introduced_by_id"]), org_id)
        if kind_changed and kind == "referrer":
            # A referrer is a person: it takes no website, size or sector, so any it had go. description stays, and
            # becomes where they work. One sent with a value is still refused below.
            for f in NOT_FOR_REFERRERS:
                sets.setdefault(f, None)
        if kind_changed and current["kind"] == "referrer" and kind != "referrer":
            sets["person_contact_id"] = None
        _check_fields(kind, sets, person, owners)
        if kind == "referrer":
            name = sets.get("name", current["name"])
            _person(conn, org_id, name, person, name != current["name"], by, at)
        if kind_changed and current["kind"] in INTRODUCER_KINDS and kind not in INTRODUCER_KINDS:
            conn.execute("UPDATE organisations SET introduced_by_id = NULL, updated_at = ?, updated_by = ? "
                         "WHERE introduced_by_id = ?", (at, by, org_id))
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
          won: Optional[bool] = None, sort: Optional[str] = None) -> List[Dict[str, Any]]:
    """`won` keeps only records that were ever moved to `won` (true) or never were
    (false). The default order is newest won first with `won`, else last updated."""
    where, args = [], []  # type: List[str], List[Any]
    if kind:
        where.append("o.kind = ?"); args.append(kind)
    if status:
        where.append("o.status = ?"); args.append(status)
    if owner:
        where.append("o.owner_email = ?"); args.append(owner.strip().lower())
    if tag:
        where.append("EXISTS (SELECT 1 FROM json_each(o.tags) WHERE value = ?)"); args.append(tag)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("o.name LIKE ? ESCAPE '\\'"); args.append("%" + escaped + "%")
    if won is not None:
        where.append("%s %s NULL" % (WON_AT, "IS NOT" if won else "IS"))
    sort = sort or ("won" if won else "updated")
    order = {"updated": "o.updated_at DESC", "name": "o.name COLLATE NOCASE",
             "last_contact": "last_contact IS NULL, last_contact DESC",
             "value": "o.value_estimate IS NULL, o.value_estimate DESC",
             "won": "won_at IS NULL, won_at DESC, o.name COLLATE NOCASE"}.get(sort, "o.updated_at DESC")
    sql = "SELECT %s FROM organisations o %s ORDER BY %s" % (
        COLUMNS, ("WHERE " + " AND ".join(where)) if where else "", order)
    return [_out(r) for r in conn.execute(sql, args)]


def status_history(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    get(conn, org_id)
    return [row(r) for r in conn.execute(
        "SELECT * FROM status_history WHERE org_id = ? ORDER BY at DESC, id DESC", (org_id,))]
