from binder.db import connect, migrate
from binder.repo import bench_links, interactions, orgs, timeline

LINK = {"slug": "acme-studio", "task_key": "aa0002", "title": "Acme Studio follow-up", "bucket": "Leads",
        "state": "Doing", "done": False, "cancelled": False, "done_on": None, "due": None,
        "assignee": "ana@example.com"}


def db(tmp_path):
    conn = connect(str(tmp_path / "t.db"))
    migrate(conn)
    return conn


def test_replace_caches_links_for_known_slugs_only(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    ghost = dict(LINK, slug="no-such-org", task_key="bb0003")
    assert bench_links.replace(conn, "work", [LINK, ghost]) == {"linked": 1, "unknown": 1}
    rows = bench_links.list_for_org(conn, acme["id"])
    assert [(r["task_key"], r["state"], r["done"]) for r in rows] == [("aa0002", "Doing", False)]
    state = bench_links.sync_state(conn, "work")
    assert state["error"] is None and state["fetched_at"]


def test_replace_drops_links_that_are_gone(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    bench_links.replace(conn, "work", [LINK])
    bench_links.replace(conn, "work", [])
    assert bench_links.list_for_org(conn, acme["id"]) == []


def test_an_error_keeps_the_cache(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    bench_links.replace(conn, "work", [LINK])
    before = bench_links.sync_state(conn, "work")["fetched_at"]
    bench_links.record_error(conn, "work", "Bench answered 401.")
    state = bench_links.sync_state(conn, "work")
    assert (state["fetched_at"], state["error"]) == (before, "Bench answered 401.")
    assert len(bench_links.list_for_org(conn, acme["id"])) == 1


def test_open_tasks_come_before_done_ones(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    done = dict(LINK, task_key="bb0001", title="Kickoff deck", state="Done", done=True, done_on="2026-11-01")
    bench_links.replace(conn, "work", [done, LINK])
    assert [r["task_key"] for r in bench_links.list_for_org(conn, acme["id"])] == ["aa0002", "bb0001"]


def test_deleting_the_org_drops_its_links(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    bench_links.replace(conn, "work", [LINK])
    orgs.delete(conn, acme["id"])
    assert conn.execute("SELECT count(*) FROM bench_links").fetchone()[0] == 0


def test_never_synced_has_no_state(tmp_path):
    assert bench_links.sync_state(db(tmp_path), "work") == {"fetched_at": None, "error": None}


def test_a_cancelled_task_is_cached_as_cancelled_and_listed_with_the_done_ones(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    cancelled = dict(LINK, task_key="bb0005", title="Dropped pitch", state="Cancelled", done=False,
                     cancelled=True, done_on="2026-10-25")
    done = dict(LINK, task_key="bb0001", title="Kickoff deck", state="Done", done=True, done_on="2026-11-01")
    bench_links.replace(conn, "work", [cancelled, done, LINK])
    rows = bench_links.list_for_org(conn, acme["id"])
    assert [(r["task_key"], r["cancelled"], r["done"]) for r in rows] == [
        ("aa0002", False, False), ("bb0001", False, True), ("bb0005", True, False)]


def test_the_timeline_breaks_ties_on_the_number_not_its_text(tmp_path):
    conn = db(tmp_path)
    acme = orgs.create(conn, {"name": "Acme Studio"}, "ana@example.com")
    at = "2026-11-01T10:00:00.000000+00:00"
    for n in range(1, 11):
        interactions.create(conn, acme["id"], {"type": "note", "summary": "note %d" % n, "happened_at": at},
                            "ana@example.com")
    ids = [i["id"] for i in timeline.for_org(conn, acme["id"]) if i["kind"] == "interaction"]
    assert ids == sorted(ids, reverse=True)
    assert ids[:2] == [10, 9]
