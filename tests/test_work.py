from binder.bench import BenchError, FileSource, load_todo
from tests.conftest import FIXTURE_BOARD, WRITE, run_now


class Broken:
    def fetch(self):
        raise BenchError("Bench answered 401.")


def reader(bench_core, source=None):
    return {"source": source or FileSource(str(FIXTURE_BOARD)), "todo": load_todo(bench_core),
            "board": "work", "url": "https://bench.example.com"}


def make(make_client, bench, run_job=run_now):
    c = make_client(bench=bench, run_job=run_job)
    c.headers.update(WRITE)
    return c


def test_meta_says_whether_bench_is_on(make_client, bench_core):
    assert make(make_client, None).get("/api/meta").json()["bench"] is False
    assert make(make_client, reader(bench_core)).get("/api/meta").json()["bench"] is True


def test_work_lists_the_linked_tasks_with_links(make_client, bench_core):
    c = make(make_client, reader(bench_core))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    first = c.get("/api/orgs/%d/work" % org["id"]).json()  # the cache is empty, so this starts a refresh
    work = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert work["error"] is None and work["fetched_at"]
    assert [t["task_key"] for t in work["tasks"]] == ["aa0002", "acme-site", "bb0001"]
    assert work["tasks"][0]["url"] == "https://bench.example.com/#!board=work!task=aa0002"
    assert first["tasks"] == [] or first["tasks"] == work["tasks"]


def test_work_shows_the_last_error_and_keeps_the_cache(make_client, bench_core):
    good = reader(bench_core)
    c = make(make_client, good)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    good["source"] = Broken()
    c.app.state.bench_refresher.refresh()  # force a refresh now, as the timer would
    work = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert work["error"] == "Bench answered 401."
    assert len(work["tasks"]) == 3


def test_work_is_404_with_bench_off(make_client):
    c = make(make_client, None)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    r = c.get("/api/orgs/%d/work" % org["id"])
    assert r.status_code == 404


def test_finished_tasks_join_the_timeline(make_client, bench_core):
    c = make(make_client, reader(bench_core))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    items = c.get("/api/orgs/%d/timeline" % org["id"]).json()
    bench = [i for i in items if i["kind"] == "bench"]
    assert [(b["title"], b["at"]) for b in bench] == [("Acme Studio kickoff deck", "2026-11-01T00:00:00.000000+00:00")]
    assert bench[0]["url"].endswith("task=bb0001")


def test_a_fresh_cache_does_not_refresh_again(make_client, bench_core):
    calls = []
    c = make(make_client, reader(bench_core), run_job=lambda job: (calls.append(1), job()))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    c.get("/api/orgs/%d/work" % org["id"])
    assert len(calls) == 1


def test_while_bench_is_down_page_opens_retry_at_most_once_a_minute(make_client, bench_core):
    calls = []
    c = make(make_client, reader(bench_core, Broken()), run_job=lambda job: (calls.append(1), job()))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    for _ in range(3):
        work = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert work["error"] == "Bench answered 401." and work["fetched_at"] is None
    assert len(calls) == 1
