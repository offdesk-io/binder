"""What Binder holds about one person, found by email: every contact with that
email (on any organisation), the interactions that name one of them and the
research briefs about them. Export returns it all. Erasure removes the
contacts' personal fields, the text of those interactions, the thanks kept for
them, their research briefs (and those briefs' search rows), and any event for
the core still kept that names them; it writes one line to `erasures` saying
when, by whom and how much, never what. It runs with `secure_delete` on, and
the search index is optimised afterwards, so the erased text does not linger
in the file's free pages or old index segments."""

import json
import sqlite3
from typing import Any, Dict, List

from ..db import now
from . import contacts as contacts_repo, row

ERASED_NAME = "Erased"
# Personal fields of a contact, cleared on erasure. `name` is required, so it becomes ERASED_NAME.
PERSONAL = ("role", "email", "phone", "linkedin_url", "postal_address", "relationship")


def _contact_ids(conn: sqlite3.Connection, email: str) -> List[int]:
    return [r[0] for r in conn.execute(
        "SELECT id FROM contacts WHERE lower(trim(email)) = ? ORDER BY id", (email,))]


def _interaction_ids(conn: sqlite3.Connection, contact_ids: List[int]) -> List[int]:
    if not contact_ids:
        return []
    return [r[0] for r in conn.execute(
        "SELECT DISTINCT interaction_id FROM interaction_contacts WHERE contact_id IN (%s) ORDER BY interaction_id"
        % ",".join("?" * len(contact_ids)), contact_ids)]


def export(conn: sqlite3.Connection, email: str) -> Dict[str, Any]:
    cids = _contact_ids(conn, email)
    contacts = []
    for cid in cids:
        c = contacts_repo.get(conn, cid)
        c["thanks"] = [row(r) for r in conn.execute("SELECT * FROM thanks WHERE contact_id = ? ORDER BY year", (cid,))]
        contacts.append(c)
    interactions = []
    for iid in _interaction_ids(conn, cids):
        i = row(conn.execute("SELECT * FROM interactions WHERE id = ?", (iid,)).fetchone())
        i["contact_ids"] = [r[0] for r in conn.execute(
            "SELECT contact_id FROM interaction_contacts WHERE interaction_id = ? ORDER BY contact_id", (iid,))]
        interactions.append(i)
    research = []
    if cids:
        for r in conn.execute("SELECT * FROM research WHERE contact_id IN (%s) ORDER BY id" % ",".join("?" * len(cids)),
                              cids):
            d = row(r)
            for k in ("brief", "sources"):
                if d[k]:
                    try:
                        d[k] = json.loads(d[k])
                    except ValueError:
                        pass
            research.append(d)
    return {"email": email, "contacts": contacts, "interactions": interactions, "research": research}


def erase(conn: sqlite3.Connection, email: str, by: str) -> Dict[str, int]:
    at = now()
    day = at[:10]
    conn.execute("PRAGMA secure_delete = ON")  # deleted and overwritten text is zeroed in the file, not left behind
    conn.execute("BEGIN IMMEDIATE")
    try:
        cids = _contact_ids(conn, email)
        iids = _interaction_ids(conn, cids)
        briefs = 0
        if cids:
            marks = ",".join("?" * len(cids))
            # Events for the core that name one of them (a referrer named after the person), sent or not.
            names = [r[0] for r in conn.execute("SELECT name FROM contacts WHERE id IN (%s)" % marks, cids)]
            for text in [json.dumps(n, ensure_ascii=False) for n in names] + [json.dumps(email)]:
                conn.execute("DELETE FROM hook_queue WHERE instr(body, ?) > 0", (text,))
            # Their research briefs; the delete trigger removes the briefs' search rows.
            briefs = conn.execute("DELETE FROM research WHERE contact_id IN (%s)" % marks, cids).rowcount
            conn.execute(
                "UPDATE contacts SET name = ?, %s, notes = ?, connector = 0, updated_at = ?, updated_by = ? "
                "WHERE id IN (%s)" % (", ".join("%s = NULL" % f for f in PERSONAL), marks),
                [ERASED_NAME, "Personal details erased on %s." % day, at, by] + cids)
            conn.execute("UPDATE thanks SET what = NULL, note = NULL, updated_at = ?, updated_by = ? "
                         "WHERE contact_id IN (%s)" % marks, [at, by] + cids)
        if iids:
            conn.execute(
                "UPDATE interactions SET summary = ?, next_step = NULL, next_step_due = NULL, updated_at = ?, "
                "updated_by = ? WHERE id IN (%s)" % ",".join("?" * len(iids)),
                ["Erased on %s at the person's request." % day, at, by] + iids)
        if cids:
            conn.execute("INSERT INTO erasures(at, by, contacts, interactions, what) VALUES (?,?,?,?,?)",
                         (at, by, len(cids), len(iids),
                          "Personal fields of %d contact(s), the text of %d interaction(s) and %d research brief(s); "
                          "contact ids %s" % (len(cids), len(iids), briefs, ", ".join(str(c) for c in cids))))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    if cids:
        # Merge the search index's segments, so the old text is not kept in an older one.
        conn.execute("INSERT INTO search(search) VALUES ('optimize')")
    return {"contacts": len(cids), "interactions": len(iids), "research": briefs}
