import io
import urllib.error

import pytest

from binder import bench
from tests.conftest import FIXTURE_BOARD


def test_task_url_encodes_the_key_like_bench():
    assert bench.task_url("https://bench.offdesk.io", "work", "aa0002") == \
        "https://bench.offdesk.io/#!board=work!task=aa0002"
    assert bench.task_url("https://bench.offdesk.io", "work", "Call Ana! Now") == \
        "https://bench.offdesk.io/#!board=work!task=Call%20Ana%21%20Now"


def test_linked_tasks_finds_every_lead_tag(bench_core):
    todo = bench.load_todo(bench_core)
    links = bench.linked_tasks(todo, FIXTURE_BOARD.read_text())
    by_key = {l["task_key"]: l for l in links}
    assert set(by_key) == {"aa0002", "acme-site", "bb0001", "bb0003"}
    assert by_key["aa0002"] == {
        "slug": "acme-studio", "task_key": "aa0002", "title": "Acme Studio follow-up", "bucket": "Leads",
        "state": "Doing", "done": False, "done_on": None, "due": None, "assignee": "ana@example.com"}
    assert by_key["bb0001"]["done"] is True and by_key["bb0001"]["done_on"] == "2026-11-01"
    assert by_key["bb0001"]["state"] == "Done"
    assert by_key["bb0003"]["slug"] == "no-such-org"


def test_bucket_tasks_lists_the_leads_with_notes_and_steps(bench_core):
    todo = bench.load_todo(bench_core)
    tasks = bench.bucket_tasks(todo, FIXTURE_BOARD.read_text(), "Leads")
    assert [t["task_key"] for t in tasks] == ["aa0001", "aa0002", "aa0004", "acme-site"]
    follow = tasks[1]
    assert follow["notes"] == ["Wants a quote for the archive tool."]
    assert follow["steps"] == [{"title": "Send the quote", "done": False}]
    assert follow["lead"] == "acme-studio"
    assert tasks[0]["done"] is True and tasks[0]["state"] == "Done"


def test_file_source_reads_the_file():
    assert "Leads" in bench.FileSource(str(FIXTURE_BOARD)).fetch()


class _Resp(io.BytesIO):
    def __init__(self, body, board):
        super().__init__(body.encode())
        self.headers = {"X-Bench-Board": board}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_http_source_sends_the_token_and_checks_the_board(monkeypatch):
    seen = {}

    def fake_open(req, timeout):
        seen["url"], seen["headers"], seen["method"] = req.full_url, dict(req.header_items()), req.get_method()
        return _Resp("## 1. Leads\n", "work")

    monkeypatch.setattr(bench, "_open", fake_open)
    text = bench.HttpSource("https://bench.example.com", "t0ken", "work").fetch()
    assert text == "## 1. Leads\n"
    assert seen["method"] == "GET"
    assert seen["url"] == "https://bench.example.com/data/todo.md"
    assert seen["headers"]["Authorization"] == "Bearer t0ken"
    assert seen["headers"]["X-offdesk-board"] == "work"


def test_http_source_refuses_another_board(monkeypatch):
    monkeypatch.setattr(bench, "_open", lambda req, timeout: _Resp("x", "personal"))
    with pytest.raises(bench.BenchError, match="personal"):
        bench.HttpSource("https://bench.example.com", "t", "work").fetch()


def test_http_errors_become_bench_errors(monkeypatch):
    def boom(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr(bench, "_open", boom)
    with pytest.raises(bench.BenchError, match="401"):
        bench.HttpSource("https://bench.example.com", "t", "work").fetch()


def test_http_source_refuses_a_redirect():
    handler = bench._NoRedirect()
    req = bench.urllib.request.Request("https://bench.example.com/data/todo.md")
    with pytest.raises(bench.urllib.error.HTTPError):
        handler.redirect_request(req, None, 302, "Found", {}, "http://elsewhere.example.com/")
