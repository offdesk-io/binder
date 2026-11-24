"""Full-text search over organisations, contacts, interactions and research briefs.
Each word becomes a quoted prefix term, so user input can never be read as FTS5 syntax."""

import sqlite3
from typing import Any, Dict, List


def _match(q: str) -> str:
    terms = ["".join(ch for ch in t if ch.isprintable() and ch != '"') for t in q.split()]
    return " ".join('"%s"*' % t for t in terms if t)


def query(conn: sqlite3.Connection, q: str, limit: int = 50) -> List[Dict[str, Any]]:
    """A person or a log with no organisation has null org_id, org_name,
    org_slug and org_status. `contact_id` is the person a research brief is
    about, or the first person on a log with no organisation. `connector` is
    true for a person who is a key connector."""
    match = _match(q or "")
    if not match:
        return []
    rows = conn.execute(
        "SELECT s.kind, s.ref_id AS id, s.org_id, s.title, o.name AS org_name, o.slug AS org_slug, "
        "o.status AS org_status, "
        "CASE WHEN s.kind = 'research' THEN r.contact_id "
        "     WHEN s.kind = 'interaction' AND s.org_id IS NULL THEN "
        "       (SELECT min(ic.contact_id) FROM interaction_contacts ic WHERE ic.interaction_id = s.ref_id) "
        "END AS contact_id, "
        "coalesce(c.connector, 0) AS connector, "
        "snippet(search, 4, char(2), char(3), '…', 12) AS snippet "
        "FROM search s LEFT JOIN organisations o ON o.id = s.org_id "
        "LEFT JOIN research r ON s.kind = 'research' AND r.id = s.ref_id "
        "LEFT JOIN contacts c ON s.kind = 'contact' AND c.id = s.ref_id "
        "WHERE search MATCH ? ORDER BY rank LIMIT ?", (match, limit))
    return [dict(r, id=int(r["id"]), org_id=None if r["org_id"] is None else int(r["org_id"]),
                 connector=bool(r["connector"])) for r in rows]
