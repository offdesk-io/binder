"""Research briefs, append only: each run adds a row. A row starts `running`
and ends `done`, with a brief and its sources, or `failed`, with the reason in
`error`. Nothing here writes to an organisation or its contacts, so a failed
or odd run cannot change them."""

import json
import sqlite3
from typing import Any, Dict, List, Optional

from ..db import now
from ..errors import Conflict, NotFound
from ..pricing import cost_usd
from . import contacts, interactions, orgs, row

INTERRUPTED = "Stopped when the server restarted. Run it again."
ORG_FACTS = ("name", "website", "sector", "description", "size", "location", "kind", "status", "source", "tags",
             "summary", "next_step")
PERSON_FACTS = ("id", "name", "role", "relationship", "is_primary", "notes")


def _out(r: sqlite3.Row) -> Dict[str, Any]:
    d = row(r)
    d["brief"] = json.loads(d["brief"]) if d["brief"] else None
    d["sources"] = json.loads(d["sources"]) if d["sources"] else []
    d["cost_usd"] = cost_usd(d["model"], d["input_tokens"], d["output_tokens"], d["web_searches"])
    return d


def get(conn: sqlite3.Connection, research_id: int) -> Dict[str, Any]:
    r = conn.execute("SELECT * FROM research WHERE id = ?", (research_id,)).fetchone()
    if r is None:
        raise NotFound("No research %d" % research_id)
    return _out(r)


def list_for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    """The organisation's own briefs, newest first. People's briefs are listed on their page."""
    orgs.get(conn, org_id)
    return [_out(r) for r in conn.execute(
        "SELECT * FROM research WHERE org_id = ? AND contact_id IS NULL ORDER BY run_at DESC, id DESC", (org_id,))]


def list_for_contact(conn: sqlite3.Connection, contact_id: int) -> List[Dict[str, Any]]:
    contacts.get(conn, contact_id)
    return [_out(r) for r in conn.execute(
        "SELECT * FROM research WHERE contact_id = ? ORDER BY run_at DESC, id DESC", (contact_id,))]


def _running(conn: sqlite3.Connection, org_id: int, contact_id: Optional[int]) -> Optional[sqlite3.Row]:
    if contact_id is None:
        return conn.execute("SELECT * FROM research WHERE org_id = ? AND contact_id IS NULL AND status = 'running'",
                            (org_id,)).fetchone()
    return conn.execute("SELECT * FROM research WHERE contact_id = ? AND status = 'running'",
                        (contact_id,)).fetchone()


def start(conn: sqlite3.Connection, by: str, org_id: Optional[int] = None,
          contact_id: Optional[int] = None) -> Dict[str, Any]:
    """A new running row: an organisation's brief, or a person's when contact_id is given."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        if contact_id is not None:
            org_id = contacts.get(conn, contact_id)["org_id"]
        else:
            orgs.get(conn, org_id)
        busy = _running(conn, org_id, contact_id)
        if busy is not None:
            raise Conflict(_out(busy), "Research is already running")
        cur = conn.execute(
            "INSERT INTO research(org_id, contact_id, status, run_at, author_email) VALUES (?, ?, 'running', ?, ?)",
            (org_id, contact_id, now(), by))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return get(conn, cur.lastrowid)


def _previous(conn: sqlite3.Connection, r: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if r["contact_id"] is None:
        found = conn.execute(
            "SELECT brief FROM research WHERE org_id = ? AND contact_id IS NULL AND status = 'done' AND id != ? "
            "ORDER BY run_at DESC, id DESC LIMIT 1", (r["org_id"], r["id"])).fetchone()
    else:
        found = conn.execute(
            "SELECT brief FROM research WHERE contact_id = ? AND status = 'done' AND id != ? "
            "ORDER BY run_at DESC, id DESC LIMIT 1", (r["contact_id"], r["id"])).fetchone()
    return json.loads(found[0]) if found else None


def subject(conn: sqlite3.Connection, research_id: int) -> Dict[str, Any]:
    """What a run is told: the organisation's facts, its people, the last 20
    interactions (a person's own, for their brief) and the previous brief."""
    r = get(conn, research_id)
    org = orgs.get(conn, r["org_id"])
    if r["contact_id"] is None:
        history = interactions.list_for_org(conn, r["org_id"], limit=20)
    else:
        history = interactions.list_for_contact(conn, r["contact_id"])[:20]
    out: Dict[str, Any] = {
        "organisation": {k: org[k] for k in ORG_FACTS},
        "contacts": [{k: c[k] for k in PERSON_FACTS} for c in contacts.list_for_org(conn, r["org_id"])],
        "interactions": [{k: i[k] for k in ("type", "happened_at", "summary", "next_step")} for i in history],
        "previous_brief": _previous(conn, r),
    }
    if r["contact_id"] is not None:
        c = contacts.get(conn, r["contact_id"])
        out["person"] = {k: c[k] for k in PERSON_FACTS}
    return out


def _usage(usage: Any) -> Dict[str, Any]:
    if usage is None:
        return {}
    return {"model": usage.model, "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
            "web_searches": usage.web_searches}


def _end(conn: sqlite3.Connection, research_id: int, sets: Dict[str, Any]) -> None:
    """Ends a run that is still running. A run that already ended stays as it was."""
    sets["finished_at"] = now()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("UPDATE research SET %s WHERE id = ? AND status = 'running'"
                     % ", ".join("%s = ?" % k for k in sets), list(sets.values()) + [research_id])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _checked_people(conn: sqlite3.Connection, org_id: int, brief: Dict[str, Any]) -> Dict[str, Any]:
    """The model's contact_id is kept only when it is one of this organisation's contacts; anything else becomes null."""
    known = {r[0] for r in conn.execute("SELECT id FROM contacts WHERE org_id = ?", (org_id,))}
    people = []
    for p in brief.get("people", []):
        cid = p.get("contact_id")
        ok = isinstance(cid, int) and not isinstance(cid, bool) and cid in known
        people.append(dict(p, contact_id=cid if ok else None))
    return dict(brief, people=people)


def finish(conn: sqlite3.Connection, research_id: int, brief: Dict[str, Any], sources: List[Dict[str, str]],
           usage: Any) -> None:
    org_id = conn.execute("SELECT org_id FROM research WHERE id = ?", (research_id,)).fetchone()[0]
    brief = _checked_people(conn, org_id, brief)
    _end(conn, research_id, dict(_usage(usage), status="done", brief=json.dumps(brief, ensure_ascii=False),
                                 sources=json.dumps(sources, ensure_ascii=False)))


def fail(conn: sqlite3.Connection, research_id: int, error: str, usage: Any = None) -> None:
    _end(conn, research_id, dict(_usage(usage), status="failed", error=error))


def fail_interrupted(conn: sqlite3.Connection) -> int:
    """At startup: a run still marked running was cut off by a restart."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        n = conn.execute("UPDATE research SET status = 'failed', error = ?, finished_at = ? WHERE status = 'running'",
                         (INTERRUPTED, now())).rowcount
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return n
