from types import SimpleNamespace as NS

import pytest

from ledger.db import connect
from ledger.errors import Conflict, NotFound
from ledger.repo import research, search

ANA = "ana@example.com"
BRIEF = {
    "overview": "Makes kilns in a made-up town",
    "what_they_do": "Pottery equipment",
    "size_and_funding": "Twelve people",
    "people": [{"name": "Rowan Example", "role": "Founder", "contact_id": None, "why": "Runs it"}],
    "recent_news": [{"headline": "Won a glaze prize", "date": "2026-10-01", "url": "https://example.com/news"}],
    "likely_needs": ["A web shop"],
    "offdesk_angle": "Build the shop",
    "open_questions": ["Who holds the budget?"],
}
USAGE = NS(model="claude-opus-5-5", input_tokens=1000, output_tokens=500, web_searches=2)


@pytest.fixture
def conn(client):
    c = connect(client.app.state.settings.db_path)
    yield c
    c.close()


def person(client, org, name, **kw):
    return client.post("/api/orgs/%d/contacts" % org["id"], json=dict(kw, name=name)).json()


def test_a_run_starts_running_and_finishes_done(conn, org):
    r = research.start(conn, ANA, org_id=org["id"])
    assert (r["status"], r["contact_id"], r["brief"], r["sources"], r["cost_usd"]) == ("running", None, None, [], None)
    research.finish(conn, r["id"], BRIEF, [{"url": "https://example.com", "title": "Home"}], USAGE)
    done = research.get(conn, r["id"])
    assert (done["status"], done["brief"], done["author_email"]) == ("done", BRIEF, ANA)
    assert done["sources"] == [{"url": "https://example.com", "title": "Home"}]
    assert done["finished_at"] >= done["run_at"]
    assert done["cost_usd"] == 0.034  # $0.004 in, $0.01 out, $0.02 for two searches


def test_only_one_run_at_a_time_per_record(conn, client, org):
    first = research.start(conn, ANA, org_id=org["id"])
    with pytest.raises(Conflict) as e:
        research.start(conn, ANA, org_id=org["id"])
    assert str(e.value) == "Research is already running"
    assert e.value.current["id"] == first["id"]
    bo = person(client, org, "Bo")
    theirs = research.start(conn, ANA, contact_id=bo["id"])  # a person's brief is a separate record
    assert (theirs["org_id"], theirs["contact_id"]) == (org["id"], bo["id"])


def test_a_failed_run_keeps_its_reason_and_cannot_finish_later(conn, org):
    r = research.start(conn, ANA, org_id=org["id"])
    research.fail(conn, r["id"], "The model declined this request.", USAGE)
    research.finish(conn, r["id"], BRIEF, [], USAGE)
    failed = research.get(conn, r["id"])
    assert (failed["status"], failed["error"], failed["brief"]) == ("failed", "The model declined this request.", None)
    assert failed["input_tokens"] == 1000


def test_a_restart_fails_running_runs(conn, org):
    r = research.start(conn, ANA, org_id=org["id"])
    assert research.fail_interrupted(conn) == 1
    assert research.get(conn, r["id"])["error"] == research.INTERRUPTED


def test_lists_keep_organisation_and_person_runs_apart(conn, client, org):
    bo = person(client, org, "Bo")
    older = research.start(conn, ANA, org_id=org["id"])
    research.finish(conn, older["id"], BRIEF, [], USAGE)
    newer = research.start(conn, ANA, org_id=org["id"])
    theirs = research.start(conn, ANA, contact_id=bo["id"])
    assert [x["id"] for x in research.list_for_org(conn, org["id"])] == [newer["id"], older["id"]]
    assert [x["id"] for x in research.list_for_contact(conn, bo["id"])] == [theirs["id"]]
    with pytest.raises(NotFound):
        research.list_for_org(conn, 999)


def test_the_subject_holds_what_ledger_knows(conn, client, org):
    rui = person(client, org, "Rui", role="CTO", is_primary=True)
    for n in range(25):
        r = client.post("/api/orgs/%d/interactions" % org["id"], json={
            "type": "call", "summary": "Call %d" % n, "happened_at": "2026-10-%02dT10:00:00+00:00" % (n + 1),
            "contact_ids": [rui["id"]] if n % 2 else []})
        assert r.status_code == 201
    first = research.start(conn, ANA, org_id=org["id"])
    research.finish(conn, first["id"], BRIEF, [], USAGE)
    second = research.start(conn, ANA, org_id=org["id"])
    s = research.subject(conn, second["id"])
    assert s["organisation"]["name"] == "Acme Studio"
    assert "owner_email" not in s["organisation"]
    assert s["contacts"] == [{"id": rui["id"], "name": "Rui", "role": "CTO", "relationship": None,
                              "is_primary": True, "notes": None}]
    assert len(s["interactions"]) == 20
    assert s["interactions"][0] == {"type": "call", "happened_at": "2026-10-25T10:00:00.000000+00:00",
                                    "summary": "Call 24", "next_step": None}
    assert s["previous_brief"] == BRIEF
    assert "person" not in s

    theirs = research.start(conn, ANA, contact_id=rui["id"])
    p = research.subject(conn, theirs["id"])
    assert p["person"]["name"] == "Rui"
    assert [i["summary"] for i in p["interactions"]][:2] == ["Call 23", "Call 21"]
    assert p["previous_brief"] is None  # the organisation's brief is not theirs


def test_a_finished_brief_is_searchable_until_its_person_goes(conn, client, org):
    r = research.start(conn, ANA, org_id=org["id"])
    assert search.query(conn, "glaze") == []  # a running row is not indexed
    research.finish(conn, r["id"], BRIEF, [], USAGE)
    hits = search.query(conn, "glaze")
    assert [(h["kind"], h["id"], h["title"]) for h in hits] == [("research", r["id"], "Research brief")]

    bo = person(client, org, "Bo")
    theirs = research.start(conn, ANA, contact_id=bo["id"])
    research.finish(conn, theirs["id"], dict(BRIEF, overview="Bo collects teapots"), [], USAGE)
    assert search.query(conn, "teapots")[0]["title"] == "Research brief: Bo"
    assert client.delete("/api/contacts/%d" % bo["id"]).status_code == 204
    assert search.query(conn, "teapots") == []
    with pytest.raises(NotFound):
        research.get(conn, theirs["id"])
