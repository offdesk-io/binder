"""Full-text search over organisations, contacts and interactions (and
research, from plan 3). Each word becomes a quoted prefix term, so user
input can never be read as FTS5 syntax."""

import sqlite3
from typing import Any, Dict, List


def _match(q: str) -> str:
    terms = [t.replace('"', "") for t in q.split()]
    return " ".join('"%s"*' % t for t in terms if t)


def query(conn: sqlite3.Connection, q: str, limit: int = 50) -> List[Dict[str, Any]]:
    match = _match(q or "")
    if not match:
        return []
    rows = conn.execute(
        "SELECT s.kind, s.ref_id, s.org_id, s.title, o.name AS org_name, o.slug AS org_slug, "
        "snippet(search, 4, '[', ']', '…', 12) AS snippet "
        "FROM search s JOIN organisations o ON o.id = s.org_id "
        "WHERE search MATCH ? ORDER BY rank LIMIT ?", (match, limit))
    return [dict(r, ref_id=int(r["ref_id"]), org_id=int(r["org_id"])) for r in rows]
