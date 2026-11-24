"""Full-text search over organisations, contacts, interactions and research briefs,
of every kind of organisation: each hit carries its organisation's kind.
Each word becomes a quoted prefix term, so user input can never be read as FTS5 syntax."""

import sqlite3
from typing import Any, Dict, List


def _match(q: str) -> str:
    terms = ["".join(ch for ch in t if ch.isprintable() and ch != '"') for t in q.split()]
    return " ".join('"%s"*' % t for t in terms if t)


def query(conn: sqlite3.Connection, q: str, limit: int = 50) -> List[Dict[str, Any]]:
    match = _match(q or "")
    if not match:
        return []
    rows = conn.execute(
        "SELECT s.kind, s.ref_id AS id, s.org_id, s.title, o.name AS org_name, o.slug AS org_slug, o.status AS org_status, o.kind AS org_kind, "
        "r.contact_id, snippet(search, 4, char(2), char(3), '…', 12) AS snippet "
        "FROM search s JOIN organisations o ON o.id = s.org_id "
        "LEFT JOIN research r ON s.kind = 'research' AND r.id = s.ref_id "
        "WHERE search MATCH ? ORDER BY rank LIMIT ?", (match, limit))
    return [dict(r, id=int(r["id"]), org_id=int(r["org_id"])) for r in rows]
