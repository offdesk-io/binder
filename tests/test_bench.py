import io
import sys
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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
    assert set(by_key) == {"aa0002", "acme-site", "aa0005", "bb0001", "bb0003"}
    assert by_key["aa0002"] == {
        "slug": "acme-studio", "task_key": "aa0002", "title": "Acme Studio follow-up", "bucket": "Leads",
        "state": "Doing", "done": False, "cancelled": False, "done_on": None, "due": None,
        "assignee": "ana@example.com"}
    assert by_key["bb0001"]["done"] is True and by_key["bb0001"]["done_on"] == "2026-11-01"
    assert by_key["bb0001"]["state"] == "Done"
    assert by_key["bb0003"]["slug"] == "no-such-org"
    # Ticked and cancelled: not finished work, and its day is the day it was decided against.
    assert by_key["aa0005"] == {
        "slug": "birch-co", "task_key": "aa0005", "title": "Birch and Co pitch", "bucket": "Leads",
        "state": "Cancelled", "done": False, "cancelled": True, "done_on": "2026-10-25", "due": None,
        "assignee": None}


def test_bucket_tasks_lists_the_leads_with_notes_and_steps(bench_core):
    todo = bench.load_todo(bench_core)
    tasks = bench.bucket_tasks(todo, FIXTURE_BOARD.read_text(), "Leads")
    assert [t["task_key"] for t in tasks] == ["aa0001", "aa0005", "aa0002", "aa0004", "acme-site"]
    follow = tasks[2]
    assert follow["notes"] == ["Wants a quote for the archive tool."]
    assert follow["steps"] == [{"title": "Send the quote", "done": False}]
    assert follow["lead"] == "acme-studio"
    assert tasks[0]["done"] is True and tasks[0]["state"] == "Done"
    assert tasks[1]["state"] == "Cancelled"


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


def test_an_unticked_task_in_the_done_column_is_open(bench_core):
    todo = bench.load_todo(bench_core)
    text = "## 1. Leads\n\n### Done\n\n- [ ] **Parked in Done** [lead:: acme] `id:cc0001`\n"
    (link,) = bench.linked_tasks(todo, text)
    assert (link["done"], link["cancelled"], link["state"], link["done_on"]) == (False, False, "Done", None)


def test_a_ticked_task_without_a_valid_date_is_not_finished(bench_core):
    todo = bench.load_todo(bench_core)
    text = ("## 1. Leads\n\n### Done\n\n"
            "- [x] **Soon** [lead:: acme] [done:: soon] `id:cc0002`\n"
            "- [x] **Impossible** [lead:: acme] [done:: 2026-13-45] `id:cc0003`\n")
    links = {l["task_key"]: l for l in bench.linked_tasks(todo, text)}
    assert links["cc0002"]["done"] is False and links["cc0002"]["done_on"] is None
    assert links["cc0003"]["done"] is False and links["cc0003"]["done_on"] is None


def test_invalid_due_dates_are_none(bench_core):
    todo = bench.load_todo(bench_core)
    text = "## 1. Leads\n\n### To do\n\n- [ ] **Vague** [lead:: acme] [due:: next week] `id:cc0004`\n"
    (link,) = bench.linked_tasks(todo, text)
    assert link["due"] is None


def test_a_cancelled_task_is_archived_or_cancelled_and_ticked(bench_core):
    todo = bench.load_todo(bench_core)
    text = ("## 1. Leads\n\n### Done\n\n"
            "- [x] **Archived** [lead:: acme] `done:2026-10-01` `archived:2026-10-03` `id:cc0005`\n"
            "- [ ] **Cancelled but open** [lead:: acme] `cancelled:2026-10-03` `id:cc0006`\n")
    links = {l["task_key"]: l for l in bench.linked_tasks(todo, text)}
    assert links["cc0005"]["state"] == "Cancelled" and links["cc0005"]["cancelled"] is True
    assert links["cc0005"]["done_on"] == "2026-10-03"
    assert links["cc0006"]["cancelled"] is False and links["cc0006"]["state"] == "Done"


@pytest.mark.parametrize("line, expected", [
    ("- [ ] **A** [Lead:: Acme Studio] `id:dd0001`", "acme-studio"),
    ("- [ ] **B** `lead:Birch & Co` `id:dd0002`", "birch-co"),
    ("- [ ] **C** [lead:: ] `id:dd0003`", ""),
    ("- [ ] **D** `id:dd0004`", ""),
])
def test_lead_of_reads_both_forms_whatever_the_case_and_slugifies(bench_core, line, expected):
    todo = bench.load_todo(bench_core)
    (task,) = todo.parse_doc("## 1. Leads\n\n### To do\n\n" + line + "\n")
    assert bench.lead_of(task) == expected


@pytest.mark.parametrize("line, expected", [
    ("- [ ] **E** [ref:: binder:org/acme-studio] `id:dd0005`", "acme-studio"),
    ("- [ ] **F** `ref:binder:org/Birch-Co` `id:dd0006`", "birch-co"),
    ("- [ ] **G** [ref:: calls:call/x-1] [ref:: binder:org/gamma] `id:dd0007`", "gamma"),
    ("- [ ] **H** [lead:: acme-studio] [ref:: binder:org/gamma] `id:dd0008`", "acme-studio"),
    ("- [ ] **I** [ref:: binder:person/ana] `id:dd0009`", ""),
])
def test_lead_of_reads_the_generic_reference_as_well(bench_core, line, expected):
    todo = bench.load_todo(bench_core)
    (task,) = todo.parse_doc("## 1. Leads\n\n### To do\n\n" + line + "\n")
    assert bench.lead_of(task) == expected


def test_leads_of_gives_every_organisation_a_task_points_at_once(bench_core):
    todo = bench.load_todo(bench_core)
    (task,) = todo.parse_doc("## 1. Leads\n\n### To do\n\n- [ ] **J** [lead:: acme-studio] [ref:: binder:org/gamma] "
                             "[ref:: binder:org/acme-studio] [ref:: calls:call/x] `id:dd0010`\n")
    assert bench.leads_of(task) == ["acme-studio", "gamma"]


def test_a_task_found_only_by_its_reference_is_linked(bench_core):
    todo = bench.load_todo(bench_core)
    text = ("## 1. Leads\n\n### To do\n\n- [ ] **Joint pitch** [ref:: calls:call/x] [ref:: binder:org/gamma] "
            "[ref:: binder:org/acme-studio] `id:dd0011`\n")
    links = bench.linked_tasks(todo, text)
    assert [(l["slug"], l["task_key"]) for l in links] == [("gamma", "dd0011")]


class _OldTask:
    """A task as a Bench todo.py from before references reads it: the tag left in `extra`."""
    lead = ""
    extra = ["[ref:: binder:org/acme-studio]"]


def test_lead_of_reads_a_reference_an_older_bench_left_in_extra():
    assert bench.lead_of(_OldTask()) == "acme-studio"


def test_load_todo_is_cached_by_path(bench_core):
    assert bench.load_todo(bench_core) is bench.load_todo(bench_core + "/")


def test_a_todo_py_that_fails_to_load_leaves_nothing_behind(tmp_path):
    (tmp_path / "todo.py").write_text("raise RuntimeError('broken')\n")
    before = set(sys.modules)
    with pytest.raises(RuntimeError):
        bench.load_todo(str(tmp_path))
    assert set(sys.modules) - before == set()


def test_the_opener_never_uses_a_proxy(monkeypatch):
    # A proxy named in the environment would be picked up by the default ProxyHandler: it must not be.
    for var in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"):
        monkeypatch.setenv(var, "http://127.0.0.1:1")
    opener = bench._build_opener()
    for scheme in ("http", "https"):
        assert not any(isinstance(h, bench.urllib.request.ProxyHandler) for h in opener.handle_open.get(scheme, []))


def test_http_source_refuses_a_missing_board_header(monkeypatch):
    monkeypatch.setattr(bench, "_open", lambda req, timeout: _Resp("x", None))
    with pytest.raises(bench.BenchError):
        bench.HttpSource("https://bench.example.com", "t", "work").fetch()


class _Redirecting(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.hits.append(self.path)
        if self.path == "/data/todo.md":
            self.send_response(302)
            self.send_header("Location", "/elsewhere")
            self.end_headers()
        else:
            self.send_response(200)
            self.send_header("X-Bench-Board", "work")
            self.end_headers()
            self.wfile.write(b"## 1. Leads\n")

    def log_message(self, *args):
        pass


def test_a_redirect_from_a_real_server_is_refused_without_a_second_request():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Redirecting)
    server.hits = []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        base = "http://127.0.0.1:%d" % server.server_address[1]
        with pytest.raises(bench.BenchError, match="302"):
            bench.HttpSource(base, "t0ken", "work").fetch()
        assert server.hits == ["/data/todo.md"]
    finally:
        server.shutdown()
        server.server_close()
