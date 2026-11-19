"""One-off import of a merge sheet (CSV) of leads and clients into Binder.

    python -m scripts.import_from_sheet apply merge-plan.csv --by import@local

One row per organisation. Columns: slug, name, kind, status, website, sector, size, location,
owner_email, source, value_estimate, tags (semicolon list), summary, next_step, next_step_due,
last_contact (a date), contacts (semicolon list of "name|role|email|phone|linkedin"), notes,
sources, conflicts. The sheet holds real names and stays out of git.

Running it twice adds nothing twice, the same rule as import_from_bench: an organisation that
already exists (by slug) is left as it is, a contact whose name is already on it is skipped, and
the note is added only once. A correction made in Binder therefore survives a re-apply."""

import argparse
import csv
import os
import re
import sqlite3
import sys
from typing import Any, Dict, List

from binder import statuses
from binder.config import load_settings
from binder.db import connect, migrate
from binder.errors import NotFound
from binder.repo import contacts, interactions, orgs

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CONTACT_PARTS = ("name", "role", "email", "phone", "linkedin_url")


class SheetError(Exception):
    pass


def read_sheet(path: str) -> List[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return [{k: (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]


def parse_contacts(cell: str) -> List[Dict[str, Any]]:
    out = []
    for chunk in filter(None, (c.strip() for c in cell.split(";"))):
        parts = [p.strip() or None for p in chunk.split("|")]
        parts += [None] * (len(CONTACT_PARTS) - len(parts))
        c = dict(zip(CONTACT_PARTS, parts))
        if c["name"]:
            out.append({k: v for k, v in c.items() if v})
    return out


def _marker(slug: str) -> str:
    return "From the import sheet (%s)" % slug


def _note(r: Dict[str, str]) -> str:
    body = [_marker(r["slug"]) + ":"]
    for label, key in (("Notes", "notes"), ("Conflicts between sources", "conflicts"), ("Sources", "sources")):
        if r.get(key):
            body.append("%s: %s" % (label, r[key]))
    return "\n\n".join(body)


def check_rows(rows: List[Dict[str, str]]) -> None:
    seen = set()
    for r in rows:
        who = r.get("slug") or r.get("name") or "a row"
        if not r.get("name") or not r.get("slug"):
            raise SheetError("%s: name and slug are required." % who)
        if r["slug"] in seen:
            raise SheetError("%s: the slug appears twice." % who)
        seen.add(r["slug"])
        allowed = statuses.LEAD_STATUSES if r.get("kind") == "lead" else statuses.CLIENT_STATUSES
        if r.get("kind") not in statuses.KINDS or r.get("status") not in allowed:
            raise SheetError("%s: %r is not a %s status." % (who, r.get("status"), r.get("kind")))
        if r.get("owner_email") and not EMAIL_RE.match(r["owner_email"]):
            raise SheetError("%s: owner_email %r is not an email address." % (who, r["owner_email"]))
        for key in ("last_contact", "next_step_due"):
            if r.get(key) and not DATE_RE.match(r[key]):
                raise SheetError("%s: %s must be YYYY-MM-DD." % (who, key))
        if r.get("value_estimate"):
            try:
                float(r["value_estimate"])
            except ValueError:
                raise SheetError("%s: value_estimate must be a number." % who)


def apply_rows(conn: sqlite3.Connection, rows: List[Dict[str, str]], by: str) -> Dict[str, int]:
    """Creates organisations, contacts and one note each. Returns what was added."""
    check_rows(rows)
    added = {"organisations": 0, "contacts": 0, "notes": 0}
    for r in rows:
        try:
            org = orgs.get_by_slug(conn, r["slug"])
        except NotFound:
            data: Dict[str, Any] = {"name": r["name"], "slug": r["slug"], "kind": r["kind"],
                                    "tags": [t.strip() for t in r.get("tags", "").split(";") if t.strip()]}
            for f in ("website", "sector", "size", "location", "owner_email", "source", "summary",
                      "next_step", "next_step_due"):
                if r.get(f):
                    data[f] = r[f]
            if r.get("value_estimate"):
                data["value_estimate"] = float(r["value_estimate"])
            org = orgs.create(conn, data, by)
            if r["status"] != org["status"]:
                org = orgs.update(conn, org["id"], {"status": r["status"], "updated_at": org["updated_at"]}, by)
            added["organisations"] += 1
        have = {c["name"].lower() for c in contacts.list_for_org(conn, org["id"])}
        for c in parse_contacts(r.get("contacts", "")):
            if c["name"].lower() not in have:
                contacts.create(conn, org["id"], c, by)
                have.add(c["name"].lower())
                added["contacts"] += 1
        marker = _marker(r["slug"])
        if (r.get("notes") or r.get("conflicts") or r.get("sources") or r.get("last_contact")) and not any(
                marker in i["summary"] for i in interactions.list_for_org(conn, org["id"])):
            data = {"type": "note", "summary": _note(r)}
            if r.get("last_contact"):
                data["happened_at"] = r["last_contact"] + "T12:00:00+00:00"
            interactions.create(conn, org["id"], data, by)
            added["notes"] += 1
    return added


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    ap = sub.add_parser("apply")
    ap.add_argument("sheet")
    ap.add_argument("--by", required=True, help="recorded as the author, e.g. import@local")
    args = p.parse_args(argv)
    if not EMAIL_RE.match(args.by):
        print("--by must look like an email address, not %r." % args.by)
        return 2
    settings = load_settings(os.environ)
    try:
        rows = read_sheet(args.sheet)
        conn = connect(settings.db_path)
        migrate(conn, settings.db_path)
        added = apply_rows(conn, rows, args.by)
    except SheetError as e:
        print(e)
        return 2
    print("Added %(organisations)d organisations, %(contacts)d contacts and %(notes)d notes." % added)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
