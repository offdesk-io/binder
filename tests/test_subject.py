"""Export and erasure of what Binder holds about one person, found by email. The core calls these with an
admin's token (step 7); a signed-in team member can through Binder's own app. Erasure keeps a line saying
what was erased and when, without the erased data."""

import time

import pytest
from fastapi.testclient import TestClient

from binder.app import create_app
from binder.config import load_settings
from binder.db import connect
from tests.conftest import OWNERS, WRITE
from tests.test_core_tokens import KEY_HEX, make


def bearer(sub, agent="pa"):
    tok = make({"sub": sub, "agent": agent, "exp": int(time.time()) + 300})
    return {"authorization": "Bearer " + tok, "x-binder": "1"}


@pytest.fixture
def app(tmp_path):
    env = {"BINDER_DB": str(tmp_path / "t.db"), "BINDER_WEB": str(tmp_path / "no-web"), "BINDER_OWNERS": OWNERS,
           "BINDER_AUTH": "header", "BINDER_CORE_TOKEN_KEY": KEY_HEX, "BINDER_ADMINS": "ines@example.com"}
    c = TestClient(create_app(load_settings(env), ai=None, bench=None))
    c.headers.update(WRITE)
    return c, env["BINDER_DB"]


@pytest.fixture
def records(app):
    c, _ = app
    acme = c.post("/api/orgs", json={"name": "Acme Studio"}).json()
    other = c.post("/api/orgs", json={"name": "Other Co"}).json()
    bo = c.post("/api/orgs/%d/contacts" % acme["id"], json={
        "name": "Bo Example", "email": "Bo@Example.com", "phone": "+351 900 000 000", "role": "Founder",
        "notes": "Likes long calls", "connector": True, "postal_address": "1 Example Street"}).json()
    bo2 = c.post("/api/orgs/%d/contacts" % other["id"], json={"name": "Bo E.", "email": "bo@example.com"}).json()
    kim = c.post("/api/orgs/%d/contacts" % acme["id"], json={"name": "Kim Example", "email": "kim@example.com"}).json()
    met = c.post("/api/orgs/%d/interactions" % acme["id"], json={
        "type": "call", "summary": "Bo said the budget is tight", "next_step": "Send Bo the deck",
        "contact_ids": [bo["id"]]}).json()
    alone = c.post("/api/orgs/%d/interactions" % acme["id"], json={
        "type": "note", "summary": "Kim only", "contact_ids": [kim["id"]]}).json()
    c.put("/api/thanks/%d/2026" % bo["id"], json={"what": "Wine", "note": "Prefers red", "updated_at": None})
    return {"acme": acme, "bo": bo, "bo2": bo2, "kim": kim, "met": met, "alone": alone}


def test_export_returns_every_contact_with_that_email_and_their_interactions(app, records):
    c, _ = app
    r = c.get("/api/subject", params={"email": " BO@example.com "})
    assert r.status_code == 200
    out = r.json()
    assert out["email"] == "bo@example.com"
    assert sorted(x["id"] for x in out["contacts"]) == sorted([records["bo"]["id"], records["bo2"]["id"]])
    bo = next(x for x in out["contacts"] if x["id"] == records["bo"]["id"])
    assert (bo["phone"], bo["org_name"], bo["postal_address"]) == ("+351 900 000 000", "Acme Studio", "1 Example Street")
    assert bo["thanks"][0]["what"] == "Wine"
    assert [i["id"] for i in out["interactions"]] == [records["met"]["id"]]
    assert out["interactions"][0]["summary"] == "Bo said the budget is tight"


def test_export_of_an_unknown_email_is_empty(app, records):
    c, _ = app
    assert c.get("/api/subject", params={"email": "nobody@example.com"}).json() == {
        "email": "nobody@example.com", "contacts": [], "interactions": []}


def test_erase_removes_personal_fields_and_interaction_text_and_leaves_a_line(app, records):
    c, db = app
    r = c.post("/api/subject/erase", json={"email": "bo@example.com"})
    assert r.status_code == 200, r.text
    done = r.json()
    assert (done["contacts"], done["interactions"]) == (2, 1)
    bo = c.get("/api/contacts/%d" % records["bo"]["id"]).json()
    assert bo["name"] == "Erased"
    for f in ("email", "phone", "role", "linkedin_url", "postal_address"):
        assert bo[f] is None
    assert bo["notes"].startswith("Personal details erased on ")
    assert bo["connector"] is False
    met = c.get("/api/orgs/%d/interactions" % records["acme"]["id"]).json()
    erased = next(i for i in met if i["id"] == records["met"]["id"])
    assert erased["summary"].startswith("Erased on ") and erased["next_step"] is None
    assert erased["type"] == "call" and erased["happened_at"] == records["met"]["happened_at"]
    kept = next(i for i in met if i["id"] == records["alone"]["id"])
    assert kept["summary"] == "Kim only"
    assert c.get("/api/contacts/%d" % records["kim"]["id"]).json()["email"] == "kim@example.com"
    assert records["bo"]["id"] not in [t["person"]["id"] for t in c.get("/api/thanks", params={"year": 2026}).json()]
    assert c.get("/api/search", params={"q": "budget"}).json() == []
    assert c.get("/api/search", params={"q": "Bo"}).json() == []
    assert c.get("/api/subject", params={"email": "bo@example.com"}).json()["contacts"] == []
    conn = connect(db)
    try:
        [line] = [dict(r) for r in conn.execute("SELECT * FROM erasures")]
        assert tuple(conn.execute("SELECT what, note FROM thanks").fetchone()) == (None, None)
    finally:
        conn.close()
    assert line["by"] == "ana@example.com" and line["at"] and (line["contacts"], line["interactions"]) == (2, 1)
    text = repr(line).lower()
    for erased_text in ("bo@example.com", "bo example", "budget", "900", "example street"):
        assert erased_text not in text


def test_erasing_nobody_changes_nothing(app, records):
    c, db = app
    assert c.post("/api/subject/erase", json={"email": "nobody@example.com"}).json() == {"contacts": 0, "interactions": 0}
    conn = connect(db)
    try:
        assert conn.execute("SELECT count(*) FROM erasures").fetchone()[0] == 0
    finally:
        conn.close()


def test_an_admins_token_may_export_and_erase(app, records):
    c, _ = app
    assert c.get("/api/subject", params={"email": "bo@example.com"}, headers=bearer("ines@example.com")).status_code == 200
    r = c.post("/api/subject/erase", json={"email": "bo@example.com"}, headers=bearer("ines@example.com"))
    assert r.status_code == 200


@pytest.mark.parametrize("sub, agent", [("rui@example.com", "pa"), ("agent:digest", "digest"),
                                        ("ines@example.com", "routine:r1"), ("ines@example.com", "helper")])
def test_other_tokens_may_not(app, records, sub, agent):
    # Only an admin through the PA: not another person, an agent of the team, or an admin's routine or own agent.
    c, _ = app
    h = bearer(sub, agent)
    assert c.get("/api/subject", params={"email": "bo@example.com"}, headers=h).status_code == 403
    assert c.post("/api/subject/erase", json={"email": "bo@example.com", "confirm": True}, headers=h).status_code == 403


def test_erase_needs_x_binder_and_an_email(app, records):
    c, _ = app
    headers = {k: v for k, v in WRITE.items() if k != "x-binder"}
    r = TestClient(c.app).post("/api/subject/erase", json={"email": "bo@example.com"}, headers=headers)
    assert r.status_code == 403
    assert c.post("/api/subject/erase", json={"email": "  "}).status_code == 422
    assert c.get("/api/subject", params={"email": "nope"}).status_code == 422
