"""Home screen feeds: what needs attention, and what happened lately.

All stored timestamps are UTC with microseconds (db.now()), so cutoffs are
built in the same shape and compared as text. `next_step_due` is a plain date.
"""

import datetime
import sqlite3
import zoneinfo
from typing import Any, Dict, List, Optional

from ..statuses import OPEN_LEAD_STATUSES
from . import contacts, orgs, row

QUIET_DAYS = 14
STUCK_DAYS = 30
CONNECTOR_DAYS = 90  # a key connector with no log for this long needs a word


def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _today(tz: str) -> str:
    return _now_utc().astimezone(zoneinfo.ZoneInfo(tz)).date().isoformat()


def _cutoff(today: str, days: int) -> str:
    day = datetime.date.fromisoformat(today) - datetime.timedelta(days=days)
    return day.isoformat() + "T00:00:00.000000+00:00"


def attention(conn: sqlite3.Connection, today: Optional[str] = None,
              tz: str = "Europe/Lisbon") -> List[Dict[str, Any]]:
    """Organisations first, as {org, reasons}, most reasons first and then by
    name; then key connectors with no log for CONNECTOR_DAYS (counted from
    when they were added if they have none), A to Z, as
    {contact, reasons: ["quiet_connector"]}. `today` (YYYY-MM-DD) is for
    tests; by default it is the date now in `tz`."""
    today = today or _today(tz)
    quiet_before = _cutoff(today, QUIET_DAYS)
    stuck_before = _cutoff(today, STUCK_DAYS)
    open_list = ",".join("'%s'" % s for s in OPEN_LEAD_STATUSES)
    rows = conn.execute(
        "SELECT o.id, "
        "  (o.next_step_due IS NOT NULL AND o.next_step_due < ?) AS overdue, "
        "  (o.kind = 'lead' AND o.status IN (%s) AND "
        "     coalesce((SELECT max(happened_at) FROM interactions i WHERE i.org_id = o.id), o.created_at) < ?) AS quiet, "
        "  (o.kind = 'lead' AND o.status IN (%s) AND "
        "     coalesce((SELECT max(at) FROM status_history h WHERE h.org_id = o.id), o.created_at) < ?) AS stuck "
        "FROM organisations o" % (open_list, open_list),
        (today, quiet_before, stuck_before)).fetchall()
    out = []
    for r in rows:
        reasons = [k for k in ("overdue", "quiet", "stuck") if r[k]]
        if reasons:
            out.append({"org": orgs.get(conn, r["id"]), "reasons": reasons})
    out.sort(key=lambda x: (-len(x["reasons"]), x["org"]["name"].lower()))
    quiet_since = _cutoff(today, CONNECTOR_DAYS)
    for r in conn.execute(
            "SELECT c.id FROM contacts c WHERE c.connector = 1 AND coalesce(%s, c.created_at) < ? "
            "ORDER BY c.name COLLATE NOCASE" % contacts.LAST_TOUCH, (quiet_since,)).fetchall():
        out.append({"contact": contacts.get(conn, r["id"]), "reasons": ["quiet_connector"]})
    return out


def activity(conn: sqlite3.Connection, limit: int = 30) -> List[Dict[str, Any]]:
    """Newest first. An item is identified by (kind, id): an interaction and a
    status change can share an id. Interaction items carry `type` and `summary`
    (their from_status/to_status are null); status items carry `from_status`
    and `to_status` (their type and summary are null)."""
    rows = conn.execute(
        "SELECT * FROM ("
        " SELECT 'interaction' AS kind, i.id, i.org_id, o.name AS org_name, o.slug AS org_slug, i.happened_at AS at, "
        "        i.type, i.summary, NULL AS from_status, NULL AS to_status, i.author_email AS by_email "
        " FROM interactions i JOIN organisations o ON o.id = i.org_id "
        " UNION ALL "
        " SELECT 'status', h.id, h.org_id, o.name, o.slug, h.at, NULL, NULL, h.from_status, h.to_status, h.by_email "
        " FROM status_history h JOIN organisations o ON o.id = h.org_id"
        ") ORDER BY at DESC, kind LIMIT ?", (limit,))
    return [row(r) for r in rows]
