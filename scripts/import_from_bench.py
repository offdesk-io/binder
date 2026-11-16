"""One-off import of the Bench board's Leads bucket into Binder.

    python -m scripts.import_from_bench plan [--out import-plan.csv]
    python -m scripts.import_from_bench apply import-plan.csv --by you@example.com [--links import-links.json]

`plan` reads the board (BINDER_BENCH_TOKEN or BINDER_BENCH_FILE, with
BINDER_BENCH_CORE) and writes one row per Leads task for you to edit: give two
rows the same slug to merge them, clear a slug to skip a task, and correct the
status, name and owner. `apply` writes into BINDER_DB and creates
import-links.json (task key -> slug). Binder never writes todo.md: ask the PA
to add [lead:: <slug>] to each task in that file, through pa_save.
"""

import argparse
import csv
import json
import os
import re
import sqlite3
import sys
from typing import Any, Dict, List, Optional

from binder import bench, statuses
from binder.config import load_settings
from binder.db import connect, migrate
from binder.errors import NotFound
from binder.repo import interactions, orgs

BUCKET = "Leads"
COLUMNS = ["task_key", "title", "name", "slug", "status", "owner", "note"]
STATUS_BY_STATE = {"Backlog": "lead", "To do": "lead", "Doing": "in_conversation", "Reviewing": "proposal_sent"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class PlanError(Exception):
    pass


def _note(t: Dict[str, Any]) -> str:
    lines = list(t["notes"])
    lines += ["- [%s] %s" % ("x" if s["done"] else " ", s["title"]) for s in t["steps"]]
    return "\n".join(lines)


def plan_rows(tasks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    rows = []
    for t in tasks:
        status = "parked" if t["done"] else STATUS_BY_STATE.get(t["state"], "lead")
        owner = t["assignee"] if t["assignee"] and "@" in t["assignee"] else ""
        rows.append({"task_key": t["task_key"], "title": t["title"], "name": t["title"],
                     "slug": t["lead"] or orgs.slugify(t["title"]), "status": status, "owner": owner,
                     "note": _note(t)})
    return rows


def write_plan(path: str, rows: List[Dict[str, str]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)


def read_plan(path: str) -> List[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: (r.get(k) or "") for k in COLUMNS} for r in csv.DictReader(f)]


def _marker(row: Dict[str, str]) -> str:
    return 'From the Bench task "%s" (%s)' % (row["title"], row["task_key"])


def _email(value: str, what: str) -> str:
    v = (value or "").strip().lower()
    if not EMAIL_RE.match(v):
        raise PlanError("%s must be an email address, not %r." % (what, value))
    return v


def _owner_of(value: str, task_key: str) -> Optional[str]:
    """The owner email for a row, or None when it is blank."""
    return _email(value, "Owner of %s" % task_key) if (value or "").strip() else None


def apply_rows(conn: sqlite3.Connection, rows: List[Dict[str, str]], by: str) -> Dict[str, str]:
    """Creates the organisations and their notes. Returns task key -> slug for the rows applied.

    Each row is checked before anything is written. A note is skipped when one from the same task
    (its key in brackets) already exists, so a second apply adds nothing twice. An organisation that
    already exists is never changed here: on a second apply, a status that differs from the plan is
    left as it is, and only the notes are added. That is deliberate, so a correction made in Binder
    survives a re-apply."""
    owners: Dict[str, Optional[str]] = {}
    for r in rows:
        if r["slug"] and r["status"] not in statuses.LEAD_STATUSES:
            raise PlanError("Row %s: %r is not a lead status (%s)." % (r["task_key"], r["status"],
                                                                     ", ".join(statuses.LEAD_STATUSES)))
        owners[r["task_key"]] = _owner_of(r["owner"], r["task_key"])
    links: Dict[str, str] = {}
    for r in rows:
        slug = orgs.slugify(r["slug"]) if r["slug"] else ""
        if not slug:
            continue
        try:
            org = orgs.get_by_slug(conn, slug)
        except NotFound:  # the first row with this slug creates it
            org = orgs.create(conn, {"name": r["name"] or r["title"], "slug": slug,
                                     "owner_email": owners[r["task_key"]]}, by)
            if r["status"] != org["status"]:
                org = orgs.update(conn, org["id"], {"status": r["status"], "updated_at": org["updated_at"]}, by)
        key = "(%s)" % r["task_key"]
        if not any(key in i["summary"] for i in interactions.list_for_org(conn, org["id"])):
            body = _marker(r) + (":\n\n" + r["note"] if r["note"] else ".")
            interactions.create(conn, org["id"], {"type": "note", "summary": body}, by)
        links[r["task_key"]] = org["slug"]
    return links


def write_links(path: str, board: str, links: Dict[str, str]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"board": board, "links": links}, f, indent=2, sort_keys=True)
        f.write("\n")


def _print_table(rows: List[Dict[str, str]]) -> None:
    for r in rows:
        print("%-10s  %-40s  %-28s  %-16s  %s" % (r["task_key"][:10], r["title"][:40], r["slug"][:28],
                                                   r["status"], r["owner"]))


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("plan")
    pl.add_argument("--out", default="import-plan.csv")
    ap = sub.add_parser("apply")
    ap.add_argument("plan_file")
    ap.add_argument("--by", required=True, help="your email, recorded as the author")
    ap.add_argument("--links", default="import-links.json")
    args = p.parse_args(argv)
    settings = load_settings(os.environ)
    if args.cmd == "plan":
        reader = bench.from_settings(settings)
        if reader is None:
            print("Bench is off: set BINDER_BENCH_TOKEN (or BINDER_BENCH_FILE) and BINDER_BENCH_CORE.")
            return 2
        try:
            text = reader["source"].fetch()
        except bench.BenchError as e:
            print(e)
            return 2
        rows = plan_rows(bench.bucket_tasks(reader["todo"], text, BUCKET))
        write_plan(args.out, rows)
        _print_table(rows)
        print("\n%d tasks. Edit %s, then run: apply %s --by <your email>" % (len(rows), args.out, args.out))
        return 0
    try:
        by = _email(args.by, "--by")
        rows = read_plan(args.plan_file)
        conn = connect(settings.db_path)
        migrate(conn, settings.db_path)
        links = apply_rows(conn, rows, by)
    except PlanError as e:
        print(e)
        return 2
    write_links(args.links, settings.bench_board, links)
    print("%d tasks linked to %d organisations. Ask the PA to add [lead:: <slug>] to each task in %s."
          % (len(links), len(set(links.values())), args.links))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
