from binder import jobs
from binder.bench import BenchError, FileSource, load_todo
from binder.db import connect
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
    assert first == work  # under run_now the refresh has finished before the first answer


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


def test_refreshing_is_true_while_a_refresh_runs(make_client, bench_core):
    pending = []
    c = make(make_client, reader(bench_core), run_job=pending.append)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    first = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert first["refreshing"] is True and first["fetched_at"] is None
    pending.pop()()  # the background thread finishes
    done = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert done["refreshing"] is False and done["fetched_at"]


def test_an_old_read_triggers_a_refresh(make_client, bench_core):
    calls = []

    def counting(job):
        calls.append(1)
        job()

    c = make(make_client, reader(bench_core), run_job=counting)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    backdate(c)
    later = make(make_client, reader(bench_core), run_job=counting)  # a later process: no recent attempt
    later.get("/api/orgs/%d/work" % org["id"])
    assert len(calls) == 2


def test_the_throttle_holds_with_an_old_read(make_client, bench_core):
    calls = []

    def counting(job):
        calls.append(1)
        job()

    c = make(make_client, reader(bench_core), run_job=counting)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.get("/api/orgs/%d/work" % org["id"])
    backdate(c)
    later = make(make_client, reader(bench_core, Broken()), run_job=counting)
    for _ in range(3):
        work = later.get("/api/orgs/%d/work" % org["id"]).json()
    assert len(calls) == 2  # one retry after the old read, then no more within a minute
    assert work["error"] == "Bench answered 401."


def backdate(client):
    conn = connect(client.app.state.settings.db_path)
    try:
        conn.execute("UPDATE bench_sync SET fetched_at = ?", ("2020-01-01T00:00:00.000000+00:00",))
    finally:
        conn.close()


def test_a_refresh_that_fails_in_the_database_is_recorded_and_logged(make_client, bench_core, monkeypatch, caplog):
    c = make(make_client, reader(bench_core))
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    refresher = c.app.state.bench_refresher

    def full_disk(*args):
        raise RuntimeError("disk full")

    monkeypatch.setattr(jobs.bench_links, "replace", full_disk)
    refresher.refresh()  # must not raise
    assert any(r.exc_info and "disk full" in str(r.exc_info[1]) for r in caplog.records)
    work = c.get("/api/orgs/%d/work" % org["id"]).json()
    assert work["error"] == "Could not refresh the Bench board."


def test_a_refresh_whose_error_cannot_be_recorded_still_does_not_raise(make_client, bench_core, monkeypatch):
    c = make(make_client, reader(bench_core))
    c.post("/api/orgs", json={"name": "Acme Studio"})
    refresher = c.app.state.bench_refresher

    def no_way(*args):
        raise RuntimeError("locked")

    monkeypatch.setattr(jobs.bench_links, "replace", no_way)
    monkeypatch.setattr(jobs.bench_links, "record_error", no_way)
    refresher.refresh()  # the failure is logged, and the lock is released
    assert refresher.running() is False


def test_a_background_refresh_runs_in_a_thread_named_bench_refresh():
    import threading

    names = []
    done = threading.Event()

    def job():
        names.append(threading.current_thread().name)
        done.set()

    jobs.in_thread(job, name="bench-refresh")
    assert done.wait(5)
    assert names == ["bench-refresh"]


def test_the_timer_survives_a_raising_refresh(make_client, bench_core, monkeypatch, caplog):
    c = make(make_client, reader(bench_core))
    refresher = c.app.state.bench_refresher

    def boom():
        raise RuntimeError("unexpected")

    monkeypatch.setattr(refresher, "refresh", boom)
    refresher.tick()  # one timer round: logged, not raised, so the loop goes on
    assert any("bench refresh failed" in r.getMessage() for r in caplog.records)
