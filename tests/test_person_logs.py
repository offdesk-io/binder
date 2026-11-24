"""A log can be about a person with no organisation. It then needs at least
one person. Search finds people and logs with no organisation."""

import pytest

from binder.db import connect
from binder.errors import Invalid
from binder.repo import interactions


def solo(client, name="Marta"):
    r = client.post("/api/contacts", json={"name": name, "connector": True})
    assert r.status_code == 201, r.text
    return r.json()


def log_with(client, c, **kw):
    kw.setdefault("type", "call")
    kw.setdefault("summary", "Coffee in Porto")
    r = client.post("/api/contacts/%d/interactions" % c["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_a_log_with_a_person_who_has_no_organisation(client):
    m = solo(client)
    i = log_with(client, m)
    assert (i["org_id"], i["contact_ids"], i["author_email"]) == (None, [m["id"]], "ana@example.com")
    assert [x["summary"] for x in client.get("/api/contacts/%d/interactions" % m["id"]).json()] == ["Coffee in Porto"]


def test_a_log_with_a_person_at_an_organisation_belongs_to_it(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    bo = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo"}).json()
    i = log_with(client, rui, summary="Lunch", contact_ids=[bo["id"]])
    assert (i["org_id"], i["contact_ids"]) == (org["id"], sorted([rui["id"], bo["id"]]))
    assert [x["summary"] for x in client.get("/api/orgs/%d/interactions" % org["id"]).json()] == ["Lunch"]


def test_others_on_a_person_log_follow_the_organisation_rule(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    m = solo(client)
    r = client.post("/api/contacts/%d/interactions" % rui["id"],
                    json={"type": "note", "summary": "x", "contact_ids": [m["id"]]})
    assert r.status_code == 422


def test_a_log_with_a_missing_person_is_404(client):
    assert client.post("/api/contacts/999/interactions", json={"type": "call", "summary": "x"}).status_code == 404


def test_a_log_without_an_organisation_must_keep_someone(client):
    m = solo(client)
    i = log_with(client, m)
    r = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "contact_ids": []})
    assert r.status_code == 422
    conn = connect(client.app.state.settings.db_path)
    with pytest.raises(Invalid):
        interactions.create(conn, None, {"type": "call", "summary": "x"}, "ana@example.com")
    assert not conn.in_transaction


def test_a_log_kept_only_by_a_deleted_person_goes_with_them(client):
    m, n = solo(client, "Marta"), solo(client, "Nuno")
    alone = log_with(client, m, summary="Just Marta")
    log_with(client, m, summary="Both", contact_ids=[n["id"]])
    assert client.delete("/api/contacts/%d" % m["id"]).status_code == 204
    assert [x["summary"] for x in client.get("/api/contacts/%d/interactions" % n["id"]).json()] == ["Both"]
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM interactions WHERE id = ?", (alone["id"],)).fetchone()[0] == 0


def test_search_finds_people_and_logs_with_no_organisation(client):
    m = solo(client, "Marta Quintela")
    log_with(client, m, summary="Talked about azulejos")
    hit = client.get("/api/search?q=quintela").json()[0]
    assert (hit["kind"], hit["id"], hit["org_id"], hit["org_name"], hit["org_slug"], hit["org_status"],
            hit["connector"]) == ("contact", m["id"], None, None, None, None, True)
    log = client.get("/api/search?q=azulejos").json()[0]
    assert (log["kind"], log["org_id"], log["contact_id"]) == ("interaction", None, m["id"])


def test_search_finds_partners_and_people_kept_after_their_organisation_goes(client, org):
    client.post("/api/orgs", json={"name": "Northwind Partners", "kind": "partner"})
    assert [(h["kind"], h["org_status"]) for h in client.get("/api/search?q=northwind").json()] == [("org", "prospect")]
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui Kept"}).json()
    client.delete("/api/orgs/%d" % org["id"])
    hits = client.get("/api/search?q=kept").json()
    assert [(h["kind"], h["id"], h["org_id"]) for h in hits] == [("contact", rui["id"], None)]


def test_other_hits_are_not_connectors(client, org):
    hits = client.get("/api/search?q=acme").json()
    assert hits and all(h["connector"] is False for h in hits)


def test_a_moved_person_stays_on_their_old_organisations_logs(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    bo = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo"}).json()
    other = client.post("/api/orgs", json={"name": "Other"}).json()
    i = log_with(client, rui, summary="Lunch")
    client.patch("/api/contacts/%d" % rui["id"], json={"updated_at": rui["updated_at"], "org_id": other["id"]})
    r = client.patch("/api/interactions/%d" % i["id"],
                     json={"updated_at": i["updated_at"], "contact_ids": [rui["id"], bo["id"]]})
    assert r.status_code == 200, r.text
    assert r.json()["contact_ids"] == sorted([rui["id"], bo["id"]])
    # a person who was never on the log, and is elsewhere, is still refused
    stranger = client.post("/api/orgs/%d/contacts" % other["id"], json={"name": "Zed"}).json()
    r = client.patch("/api/interactions/%d" % i["id"],
                     json={"updated_at": r.json()["updated_at"], "contact_ids": [stranger["id"]]})
    assert r.status_code == 422


def test_search_takes_underscore_and_backslash_literally(client):
    client.post("/api/contacts", json={"name": "Ana_Maria"})
    client.post("/api/contacts", json={"name": "AnaXMaria"})
    client.post("/api/contacts", json={"name": "Back\\slash"})
    client.post("/api/contacts", json={"name": "Backslash"})
    assert [p["name"] for p in client.get("/api/people", params={"q": "a_m"}).json()] == ["Ana_Maria"]
    assert [p["name"] for p in client.get("/api/people", params={"q": "k\\s"}).json()] == ["Back\\slash"]


def test_deleting_an_organisation_keeps_the_person_in_search(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui Kept"}).json()
    client.delete("/api/orgs/%d" % org["id"])
    conn = connect(client.app.state.settings.db_path)
    rows = conn.execute("SELECT org_id FROM search WHERE kind = 'contact' AND ref_id = ?", (rui["id"],)).fetchall()
    assert len(rows) == 1 and rows[0][0] is None


def test_a_partner_cannot_move_to_lead(client):
    p = client.post("/api/orgs", json={"name": "Northwind Partners", "kind": "partner"}).json()
    r = client.patch("/api/orgs/%d" % p["id"], json={"updated_at": p["updated_at"], "status": "lead"})
    assert r.status_code == 422


def test_deleting_an_introducer_clears_and_touches_the_organisation(client, org):
    partner = client.post("/api/orgs", json={"name": "Northwind Partners", "kind": "partner"}).json()
    m = solo(client)
    a = client.post("/api/orgs", json={"name": "ByPerson", "introduced_by_contact_id": m["id"]}).json()
    b = client.post("/api/orgs", json={"name": "ByPartner", "introduced_by_org_id": partner["id"]}).json()
    assert client.delete("/api/contacts/%d" % m["id"]).status_code == 204
    assert client.delete("/api/orgs/%d" % partner["id"]).status_code == 204
    for before in (a, b):
        now = client.get("/api/orgs/%d" % before["id"]).json()
        assert now["introduced_by"] is None
        assert now["updated_at"] != before["updated_at"] and now["updated_by"] == "ana@example.com"
