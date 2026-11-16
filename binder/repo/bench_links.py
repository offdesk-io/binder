"""The Bench task cache. A refresh replaces one board's rows in one write."""

import sqlite3
from typing import Any, Dict, List

from ..db import now


def _out(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    d["done"] = bool(d["done"])
    d["cancelled"] = bool(d["cancelled"])
    return d


def replace(conn: sqlite3.Connection, board: str, links: List[Dict[str, Any]]) -> Dict[str, int]:
    """Replaces the board's cache with `links`. Slugs that match no organisation are skipped."""
    at = now()
    linked = unknown = 0
    conn.execute("BEGIN IMMEDIATE")
    try:
        slugs = {r["slug"]: r["id"] for r in conn.execute("SELECT id, slug FROM organisations")}
        conn.execute("DELETE FROM bench_links WHERE board = ?", (board,))
        seen = set()
        for l in links:
            org_id = slugs.get(l["slug"])
            if org_id is None:
                unknown += 1
                continue
            if l["task_key"] in seen:  # two tasks with one key: keep the first, as Bench's lookup does
                continue
            seen.add(l["task_key"])
            conn.execute(
                "INSERT INTO bench_links(org_id, board, task_key, title, state, done, cancelled, done_on, due, "
                "assignee, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (org_id, board, l["task_key"], l["title"], l["state"], int(l["done"]), int(l["cancelled"]),
                 l["done_on"], l["due"], l["assignee"], at))
            linked += 1
        conn.execute("INSERT INTO bench_sync(board, fetched_at, error) VALUES (?,?,NULL) "
                     "ON CONFLICT(board) DO UPDATE SET fetched_at = excluded.fetched_at, error = NULL", (board, at))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return {"linked": linked, "unknown": unknown}


def record_error(conn: sqlite3.Connection, board: str, error: str) -> None:
    """Keeps the cache and its fetched_at; only the error changes."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("INSERT INTO bench_sync(board, fetched_at, error) VALUES (?,NULL,?) "
                     "ON CONFLICT(board) DO UPDATE SET error = excluded.error", (board, error))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def sync_state(conn: sqlite3.Connection, board: str) -> Dict[str, Any]:
    r = conn.execute("SELECT fetched_at, error FROM bench_sync WHERE board = ?", (board,)).fetchone()
    return {"fetched_at": r["fetched_at"], "error": r["error"]} if r else {"fetched_at": None, "error": None}


def list_for_org(conn: sqlite3.Connection, org_id: int) -> List[Dict[str, Any]]:
    """Open tasks first (in board order), then finished and cancelled ones, newest day first."""
    rows = conn.execute(
        "SELECT task_key, board, title, state, done, cancelled, done_on, due, assignee, fetched_at FROM bench_links "
        "WHERE org_id = ? ORDER BY (done OR cancelled), CASE WHEN done OR cancelled THEN done_on END DESC, id",
        (org_id,))
    return [_out(r) for r in rows]
