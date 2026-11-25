"""What Binder holds about one person, found by email: every contact with that
email (on any organisation) and the interactions that name one of them.
Export returns it all; erasure removes the contacts' personal fields, the text
of those interactions and the thanks kept for them, and writes one line to
`erasures` saying when, by whom and how much, never what."""

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
    return {"email": email, "contacts": contacts, "interactions": interactions}


def erase(conn: sqlite3.Connection, email: str, by: str) -> Dict[str, int]:
    at = now()
    day = at[:10]
    conn.execute("BEGIN IMMEDIATE")
    try:
        cids = _contact_ids(conn, email)
        iids = _interaction_ids(conn, cids)
        if cids:
            marks = ",".join("?" * len(cids))
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
                          "Personal fields of %d contact(s) and the text of %d interaction(s); contact ids %s"
                          % (len(cids), len(iids), ", ".join(str(c) for c in cids))))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return {"contacts": len(cids), "interactions": len(iids)}
