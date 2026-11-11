"""One organisation's history, newest first: interactions and status changes.
Plan 4 adds Bench tasks to the same list."""

import sqlite3
from typing import Any, Dict, List

from . import interactions, orgs


def for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for i in interactions.list_for_org(conn, org_id):
        items.append(dict(i, kind="interaction", at=i["happened_at"]))
    for h in orgs.status_history(conn, org_id):
        items.append(dict(h, kind="status"))
    items.sort(key=lambda x: (x["at"], x["id"]), reverse=True)
    return items
