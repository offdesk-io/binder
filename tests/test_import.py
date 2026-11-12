import csv
import json

import pytest

from binder.db import connect, migrate
from binder.repo import interactions, orgs
from scripts import import_from_bench as imp
from tests.conftest import FIXTURE_BOARD


def tasks(bench_core):
    from binder.bench import bucket_tasks, load_todo
    return bucket_tasks(load_todo(bench_core), FIXTURE_BOARD.read_text(), "Leads")


def test_plan_proposes_one_org_per_task(bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    by_key = {r["task_key"]: r for r in rows}
    assert by_key["aa0002"] == {"task_key": "aa0002", "title": "Acme Studio follow-up",
                                "name": "Acme Studio follow-up", "slug": "acme-studio", "status": "in_conversation",
                                "owner": "ana@example.com", "note": "Wants a quote for the archive tool.\n- [ ] Send the quote"}
    assert by_key["aa0001"]["status"] == "parked"  # ticked
    assert by_key["aa0004"]["status"] == "lead" and by_key["aa0004"]["owner"] == ""  # [to:: Ben] is not an email
    assert by_key["aa0004"]["slug"] == "northwind-trading"  # no lead tag: slug from the title


def test_plan_file_round_trips(tmp_path, bench_core):
    path = tmp_path / "import-plan.csv"
    imp.write_plan(str(path), imp.plan_rows(tasks(bench_core)))
    assert imp.read_plan(str(path)) == imp.plan_rows(tasks(bench_core))


def apply(tmp_path, rows):
    conn = connect(str(tmp_path / "t.db"))
    migrate(conn)
    links = imp.apply_rows(conn, rows, by="ana@example.com")
    return conn, links


def test_apply_creates_orgs_merges_same_slug_and_skips_blank(tmp_path, bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    for r in rows:
        if r["task_key"] == "acme-site":
            r["slug"] = "acme-studio"  # the owner merges the second Acme task into the first
        if r["task_key"] == "aa0001":
            r["slug"] = ""  # and skips the old one
    conn, links = apply(tmp_path, rows)
    assert links == {"aa0002": "acme-studio", "aa0004": "northwind-trading", "acme-site": "acme-studio"}
    acme = orgs.get_by_slug(conn, "acme-studio")
    assert (acme["name"], acme["status"], acme["owner_email"]) == ("Acme Studio follow-up", "in_conversation",
                                                                  "ana@example.com")
    notes = interactions.list_for_org(conn, acme["id"])
    assert len(notes) == 2 and all(n["type"] == "note" for n in notes)
    assert any("From the Bench task \"Acme Studio follow-up\" (aa0002)" in n["summary"] for n in notes)
    assert orgs.get_by_slug(conn, "northwind-trading")["owner_email"] == "ana@example.com"  # the importer


def test_apply_twice_adds_nothing_twice(tmp_path, bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    conn, _ = apply(tmp_path, rows)
    imp.apply_rows(conn, rows, by="ana@example.com")
    acme = orgs.get_by_slug(conn, "acme-studio")
    assert len(interactions.list_for_org(conn, acme["id"])) == 2
    assert conn.execute("SELECT count(*) FROM organisations").fetchone()[0] == 3


def test_apply_refuses_an_unknown_status(tmp_path, bench_core):
    rows = imp.plan_rows(tasks(bench_core))
    rows[0]["status"] = "maybe"
    with pytest.raises(imp.PlanError, match="maybe"):
        apply(tmp_path, rows)


def test_links_file(tmp_path):
    path = tmp_path / "import-links.json"
    imp.write_links(str(path), "work", {"aa0002": "acme-studio"})
    assert json.loads(path.read_text()) == {"board": "work", "links": {"aa0002": "acme-studio"}}
