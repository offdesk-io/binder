from binder.ai import FakeAI, Usage
from tests.conftest import WRITE, run_now


def make(make_client, ai):
    c = make_client(ai=ai, run_job=run_now)
    c.headers.update(WRITE)
    return c


def person(c, org, name):
    return c.post("/api/orgs/%d/contacts" % org["id"], json={"name": name}).json()


class Says(FakeAI):
    """Answers with whatever `answer` is set to."""

    answer = {}

    def summarise(self, text, org_name, contacts, now_local):
        return self.answer, Usage("fake")


def test_summarise_fills_the_fields_and_saves_nothing(ai_client, org, fake_ai):
    bo = person(ai_client, org, "Bo")
    r = ai_client.post("/api/summarise", json={"org_id": org["id"], "text": "Coffee with Bo\nAgreed to send a quote"})
    assert r.status_code == 200
    assert r.json() == {"summary": "Coffee with Bo", "type": "note", "happened_at": None, "next_step": None,
                        "next_step_due": None, "contact_ids": [bo["id"]]}
    assert ai_client.get("/api/orgs/%d/interactions" % org["id"]).json() == []
    call = fake_ai.calls[-1][1]
    assert call["org_name"] == "Acme Studio"
    assert call["now_local"].endswith("(Europe/London)")


def test_the_answer_is_checked_before_it_reaches_the_form(make_client, org):
    ai = Says()
    c = make(make_client, ai)
    bo = person(c, org, "Bo")
    ai.answer = {"summary": "  Met  ", "type": "lunch", "happened_at": "yesterday", "next_step": "  ",
                 "next_step_due": "soon", "contact_ids": [999, bo["id"], bo["id"], True]}
    r = c.post("/api/summarise", json={"org_id": org["id"], "text": "notes"})
    assert r.json() == {"summary": "Met", "type": "note", "happened_at": None, "next_step": None,
                        "next_step_due": None, "contact_ids": [bo["id"]]}


def test_good_values_are_kept_in_binder_form(make_client, org):
    ai = Says()
    ai.answer = {"summary": "Call", "type": "call", "happened_at": "2026-11-10T09:30:00Z", "next_step": "Send deck",
                 "next_step_due": "2026-11-20", "contact_ids": []}
    c = make(make_client, ai)
    r = c.post("/api/summarise", json={"org_id": org["id"], "text": "notes"})
    assert r.json() == {"summary": "Call", "type": "call", "happened_at": "2026-11-10T09:30:00.000000+00:00",
                        "next_step": "Send deck", "next_step_due": "2026-11-20", "contact_ids": []}


def test_a_failed_call_is_a_502_with_the_reason(make_client, org):
    c = make(make_client, FakeAI(fail="Could not reach the AI service. Try again."))
    r = c.post("/api/summarise", json={"org_id": org["id"], "text": "notes"})
    assert r.status_code == 502
    assert r.json()["detail"] == "Could not reach the AI service. Try again."


def test_bad_requests(ai_client, org):
    assert ai_client.post("/api/summarise", json={"org_id": org["id"], "text": "   "}).status_code == 422
    assert ai_client.post("/api/summarise", json={"org_id": org["id"], "text": "x" * 30001}).status_code == 422
    assert ai_client.post("/api/summarise", json={"org_id": 999, "text": "Hi"}).status_code == 404


def test_without_ai_summarise_says_so(client, org):
    r = client.post("/api/summarise", json={"org_id": org["id"], "text": "Hi"})
    assert r.status_code == 503
    assert r.json()["detail"] == "AI is not set up on this server"
