"""One organisation's history, newest first: interactions, status changes and
finished Bench tasks. Items have the same keys as feeds.activity's: `kind`,
`id`, `at` and `by_email`. A Bench item's id is its task key."""

import sqlite3
from typing import Any, Callable, Dict, List, Optional

from . import bench_links, interactions, orgs


def for_org(conn: sqlite3.Connection, org_id: int,
            task_url: Optional[Callable[[str, str], str]] = None) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for i in interactions.list_for_org(conn, org_id):
        item = dict(i, kind="interaction", at=i["happened_at"])
        item["by_email"] = item.pop("author_email")
        items.append(item)
    for h in orgs.status_history(conn, org_id):
        items.append(dict(h, kind="status"))
    if task_url is not None:  # open Bench tasks show only in the Work section
        for t in bench_links.list_for_org(conn, org_id):
            if t["done"] and t["done_on"]:
                items.append({"kind": "bench", "id": t["task_key"], "title": t["title"],
                              "at": t["done_on"] + "T00:00:00.000000+00:00", "by_email": t["assignee"],
                              "url": task_url(t["board"], t["task_key"])})
    items.sort(key=lambda x: (x["at"], str(x["id"])), reverse=True)
    return items
