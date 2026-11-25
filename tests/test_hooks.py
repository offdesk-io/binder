"""Events for the Offdesk core: queued in the same transaction as the move that caused them, sent later,
signed as the core's webhooks expect (`X-Offdesk-Timestamp`, HMAC-SHA256 of `<ts>.<body>`), retried
with backoff for a day. No real sleeps: the clock and the sender are the test's."""

import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from binder.app import create_app
from binder.config import ConfigError, load_settings
from binder.db import connect
from binder.hooks import Hooks
from tests.conftest import OWNERS, WRITE

URL = "http://127.0.0.1:8780/api/hooks/binder"
SECRET = "hook-secret-for-tests"


class Clock:
    def __init__(self):
        self.t = time.time() + 5   # just after anything the test queues now

    def __call__(self):
        return self.t


class Sender:
    def __init__(self, answers=None):
        self.calls, self.answers = [], list(answers or [])

    def __call__(self, url, body, headers):
        self.calls.append((url, body, headers))
        answer = self.answers.pop(0) if self.answers else 202
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def setup(tmp_path):
    def _make(answers=None, url=URL):
        env = {"BINDER_DB": str(tmp_path / "t.db"), "BINDER_WEB": str(tmp_path / "no-web"), "BINDER_OWNERS": OWNERS,
               "BINDER_AUTH": "header"}
        if url:
            env.update(BINDER_CORE_HOOK_URL=url, BINDER_CORE_HOOK_SECRET=SECRET)
        settings = load_settings(env)
        clock, sender = Clock(), Sender(answers)
        hooks = Hooks(settings.db_path, settings.hook_url, settings.hook_secret, clock=clock, send=sender) if url else None
        c = TestClient(create_app(settings, ai=None, bench=None, hooks=hooks))
        c.headers.update(WRITE)
        return c, hooks, clock, sender, settings.db_path
    return _make


def rows(db_path):
    conn = connect(db_path)
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM hook_queue ORDER BY id")]
    finally:
        conn.close()


def move(c, org, status):
    r = c.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": status})
    assert r.status_code == 200, r.text
    return r.json()


def test_a_move_is_queued_and_sent_signed(setup):
    c, hooks, clock, sender, db = setup()
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    assert rows(db) == []   # a new record is not an event
    move(c, org, "contacted")
    [queued] = rows(db)
    assert queued["event"] == "org.moved" and queued["sent_at"] is None and queued["tries"] == 0
    hooks.tick()
    [(url, body, headers)] = sender.calls
    assert url == URL
    data = json.loads(body)
    assert data["event"] == "org.moved"
    assert data["org"] == {"id": org["id"], "slug": "acme-studio", "name": "Acme Studio", "kind": "lead",
                           "status": "contacted"}
    assert (data["from"], data["to"], data["by"]) == ("lead", "contacted", "ana@example.com")
    ts = headers["X-Offdesk-Timestamp"]
    assert ts == str(int(clock.t))
    assert headers["X-Offdesk-Signature"] == "sha256=" + hmac.new(
        SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    assert headers["Content-Type"] == "application/json"
    assert rows(db)[0]["sent_at"] is not None
    hooks.tick()
    assert len(sender.calls) == 1   # sent once


def test_won_is_its_own_event(setup):
    c, hooks, clock, sender, db = setup()
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    move(c, org, "won")
    [queued] = rows(db)
    assert queued["event"] == "org.won"
    data = json.loads(queued["body"])
    assert (data["from"], data["to"]) == ("lead", "won")
    assert (data["org"]["kind"], data["org"]["status"]) == ("client", "active")


def test_a_save_that_does_not_move_queues_nothing(setup):
    c, hooks, clock, sender, db = setup()
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    c.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "next_step": "Call back"})
    assert rows(db) == []


def test_a_failed_move_queues_nothing(setup):
    c, hooks, clock, sender, db = setup()
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    r = c.patch("/api/orgs/%d" % org["id"], json={"updated_at": "stale", "status": "contacted"})
    assert r.status_code == 409
    assert rows(db) == []


def test_a_failure_is_retried_with_backoff_and_a_fresh_signature(setup):
    c, hooks, clock, sender, db = setup(answers=[503, OSError("connection refused"), 202])
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    move(c, org, "contacted")
    hooks.tick()
    first = rows(db)[0]
    assert (first["tries"], first["error"], first["sent_at"]) == (1, "HTTP 503", None)
    hooks.tick()
    assert len(sender.calls) == 1   # not due yet
    clock.t += 30
    hooks.tick()
    second = rows(db)[0]
    assert (second["tries"], second["error"]) == (2, "connection refused")
    assert second["next_at"] > first["next_at"]
    clock.t += 30
    hooks.tick()
    assert len(sender.calls) == 2   # the wait doubled
    clock.t += 30
    hooks.tick()
    assert len(sender.calls) == 3
    assert rows(db)[0]["sent_at"] is not None
    stamps = [h["X-Offdesk-Timestamp"] for _, _, h in sender.calls]
    assert len(set(stamps)) == 3   # each try signs with its own time, so the core never sees a replay


def test_it_gives_up_after_a_day(setup):
    c, hooks, clock, sender, db = setup(answers=[500] * 100)
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    move(c, org, "contacted")
    for _ in range(60):
        clock.t += 3600
        hooks.tick()
    [r] = rows(db)
    assert r["next_at"] is None and r["sent_at"] is None
    assert r["error"].startswith("Gave up after a day")
    tried = len(sender.calls)
    assert 20 < tried < 30   # about every hour once the backoff tops out
    clock.t += 3600
    hooks.tick()
    assert len(sender.calls) == tried


def test_sent_rows_are_forgotten_after_a_week(setup):
    c, hooks, clock, sender, db = setup()
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    move(c, org, "contacted")
    hooks.tick()
    clock.t += 8 * 86400
    hooks.tick()
    assert rows(db) == []


def test_off_without_a_url(setup):
    c, hooks, clock, sender, db = setup(url="")
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    move(c, org, "won")
    assert rows(db) == []


def test_a_url_needs_a_secret_and_https_or_loopback():
    with pytest.raises(ConfigError, match="BINDER_CORE_HOOK_SECRET"):
        load_settings({"BINDER_CORE_HOOK_URL": URL})
    with pytest.raises(ConfigError, match="https"):
        load_settings({"BINDER_CORE_HOOK_URL": "http://core.example.com/api/hooks/binder",
                       "BINDER_CORE_HOOK_SECRET": SECRET})
    s = load_settings({"BINDER_CORE_HOOK_URL": URL, "BINDER_CORE_HOOK_SECRET": SECRET})
    assert s.hook_url == URL and SECRET not in repr(s)


def test_a_sender_that_breaks_never_stops_the_tick(setup):
    c, hooks, clock, sender, db = setup(answers=[RuntimeError("boom")])
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    move(c, org, "contacted")
    hooks.tick()
    assert rows(db)[0]["error"] == "boom"


def test_the_move_wakes_the_sender(setup):
    c, hooks, clock, sender, db = setup()
    org = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    assert not hooks.woken.is_set()
    move(c, org, "contacted")
    assert hooks.woken.is_set()
