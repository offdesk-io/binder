import pytest

from binder.ai import FakeAI
from binder.repo.research import INTERRUPTED
from tests.conftest import TEAM, WRITE, run_now


def make(make_client, ai, run_job=run_now):
    c = make_client(ai=ai, run_job=run_job)
    c.headers.update(WRITE)
    return c


def never(job):
    """A job that never runs, so its row stays running."""


def test_a_run_is_accepted_then_done(ai_client, org):
    r = ai_client.post("/api/orgs/%d/research" % org["id"])
    assert r.status_code == 202
    assert r.json()["status"] == "running"
    done = ai_client.get("/api/research/%d" % r.json()["id"]).json()
    assert done["status"] == "done"
    assert done["brief"]["overview"] == "Acme Studio, as the fake research sees it."
    assert done["sources"] == [{"url": "https://example.com/about", "title": "About"}]
    assert (done["author_email"], done["model"], done["cost_usd"]) == ("ana@example.com", "fake", 0.0)
    assert [x["id"] for x in ai_client.get("/api/orgs/%d/research" % org["id"]).json()] == [done["id"]]


def test_a_second_run_waits_for_the_first(make_client, org):
    c = make(make_client, FakeAI(), run_job=never)
    first = c.post("/api/orgs/%d/research" % org["id"]).json()
    r = c.post("/api/orgs/%d/research" % org["id"])
    assert r.status_code == 409
    assert r.json()["detail"] == "Research is already running"
    assert r.json()["current"]["id"] == first["id"]


def test_a_failed_run_says_why_and_changes_nothing(make_client, org):
    c = make(make_client, FakeAI(fail="The model declined this request (cyber)."))
    run = c.post("/api/orgs/%d/research" % org["id"]).json()
    failed = c.get("/api/research/%d" % run["id"]).json()
    assert (failed["status"], failed["error"], failed["brief"]) == (
        "failed", "The model declined this request (cyber).", None)
    assert c.get("/api/orgs/%d" % org["id"]).json()["updated_at"] == org["updated_at"]
    assert c.get("/api/orgs/%d/contacts" % org["id"]).json() == []


def test_an_unexpected_error_fails_the_run(make_client, org):
    class Broken(FakeAI):
        def research(self, subject):
            raise RuntimeError("boom")

    c = make(make_client, Broken())
    run = c.post("/api/orgs/%d/research" % org["id"]).json()
    assert c.get("/api/research/%d" % run["id"]).json()["error"] == "Research failed unexpectedly. Try again."


def test_a_person_has_their_own_runs(ai_client, org, fake_ai):
    bo = ai_client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo", "role": "CEO"}).json()
    r = ai_client.post("/api/contacts/%d/research" % bo["id"])
    assert r.status_code == 202
    assert r.json()["contact_id"] == bo["id"]
    assert fake_ai.calls[-1][1]["person"]["name"] == "Bo"
    assert len(ai_client.get("/api/contacts/%d/research" % bo["id"]).json()) == 1
    assert ai_client.get("/api/orgs/%d/research" % org["id"]).json() == []


def test_a_rerun_is_given_the_last_brief(ai_client, org, fake_ai):
    ai_client.post("/api/orgs/%d/research" % org["id"])
    ai_client.post("/api/orgs/%d/research" % org["id"])
    assert fake_ai.calls[0][1]["previous_brief"] is None
    assert fake_ai.calls[1][1]["previous_brief"]["overview"] == "Acme Studio, as the fake research sees it."


def test_without_ai_research_says_so(client, org):
    r = client.post("/api/orgs/%d/research" % org["id"])
    assert r.status_code == 503
    assert r.json()["detail"] == "AI is not set up on this server"
    assert client.get("/api/meta").json()["ai"] is False


def test_meta_says_when_ai_is_on(ai_client):
    assert ai_client.get("/api/meta").json()["ai"] is True


def test_a_run_that_cannot_start_is_marked_failed(make_client, org):
    def cannot_start(job):
        raise RuntimeError("no thread")

    c = make(make_client, FakeAI(), run_job=cannot_start)
    with pytest.raises(RuntimeError):
        c.post("/api/orgs/%d/research" % org["id"])
    run = c.get("/api/orgs/%d/research" % org["id"]).json()[0]
    assert (run["status"], run["error"]) == ("failed", "Could not start the research. Try again.")


def test_a_restart_fails_a_running_run(make_client, org):
    c = make(make_client, FakeAI(), run_job=never)
    run = c.post("/api/orgs/%d/research" % org["id"]).json()
    again = make(make_client, FakeAI())  # a new app on the same database
    assert again.get("/api/research/%d" % run["id"]).json()["error"] == INTERRUPTED


def test_unknown_records_are_404(ai_client):
    assert ai_client.post("/api/orgs/999/research").status_code == 404
    assert ai_client.post("/api/contacts/999/research").status_code == 404
    assert ai_client.get("/api/research/999").status_code == 404
    assert ai_client.get("/api/orgs/999/research").status_code == 404


def test_research_needs_sign_in_and_the_header(make_client, org):
    c = make_client(ai=FakeAI())
    assert c.get("/api/research/1").status_code == 401
    c.headers.update(TEAM)  # signed in, but no X-Binder
    assert c.post("/api/orgs/%d/research" % org["id"]).status_code == 403


def test_a_brief_cannot_point_at_a_contact_outside_the_organisation(make_client, org):
    class Wrong(FakeAI):
        def research(self, subject):
            out = super().research(subject)
            out.brief["people"] = [
                {"name": "Bo", "role": "", "contact_id": bo["id"], "why": "Runs it."},
                {"name": "Ghost", "role": "", "contact_id": 999, "why": "Made up."},
                {"name": "Cy", "role": "", "contact_id": elsewhere["id"], "why": "Other company."},
            ]
            return out

    c = make(make_client, Wrong(), run_job=run_now)
    bo = c.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo"}).json()
    other = c.post("/api/orgs", json={"name": "Other Studio"}).json()
    elsewhere = c.post("/api/orgs/%d/contacts" % other["id"], json={"name": "Cy"}).json()
    run = c.post("/api/orgs/%d/research" % org["id"]).json()
    done = c.get("/api/research/%d" % run["id"]).json()
    assert done["status"] == "done"
    assert [p["contact_id"] for p in done["brief"]["people"]] == [bo["id"], None, None]
