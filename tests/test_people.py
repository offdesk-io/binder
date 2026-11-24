"""People: a contact's organisation is optional. Key connectors carry a flag
and a postal address; /api/people lists everyone, connectors first."""

from tests.conftest import TEAM


def person(client, **kw):
    r = client.post("/api/contacts", json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def at(client, org, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def url(c):
    return "/api/contacts/%d" % c["id"]


def test_a_person_without_an_organisation(client):
    p = person(client, name="Marta", connector=True, postal_address="1 Example Street\nPorto")
    assert (p["org_id"], p["org_name"], p["org_slug"]) == (None, None, None)
    assert p["connector"] is True and p["postal_address"] == "1 Example Street\nPorto"
    assert client.get(url(p)).json() == p


def test_the_people_route_can_place_someone_at_an_organisation(client, org):
    p = person(client, name="Rui", org_id=org["id"])
    assert p["org_name"] == "Acme Studio"
    assert client.post("/api/contacts", json={"name": "X", "org_id": 999}).status_code == 404


def test_no_organisation_means_no_one_to_talk_to(client):
    assert client.post("/api/contacts", json={"name": "X", "is_primary": True}).status_code == 422


def test_moving_a_person_between_organisations_and_out(client, org):
    other = client.post("/api/orgs", json={"name": "Other"}).json()
    rui = at(client, org, name="Rui", is_primary=True)
    moved = client.patch(url(rui), json={"updated_at": rui["updated_at"], "org_id": other["id"]}).json()
    assert (moved["org_id"], moved["org_name"], moved["is_primary"]) == (other["id"], "Other", False)
    out = client.patch(url(rui), json={"updated_at": moved["updated_at"], "org_id": None}).json()
    assert (out["org_id"], out["org_slug"]) == (None, None)
    assert client.patch(url(rui), json={"updated_at": out["updated_at"], "is_primary": True}).status_code == 422
    assert client.patch(url(rui), json={"updated_at": out["updated_at"], "org_id": 999}).status_code == 422


def test_moving_in_as_the_one_to_talk_to_replaces_the_old_one(client, org):
    at(client, org, name="A", is_primary=True)
    solo = person(client, name="Solo")
    r = client.patch(url(solo), json={"updated_at": solo["updated_at"], "org_id": org["id"], "is_primary": True})
    assert r.json()["is_primary"] is True
    got = {c["name"]: c["is_primary"] for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()}
    assert got == {"A": False, "Solo": True}


def test_connector_and_postal_address_can_change_and_a_stale_save_is_409(client):
    p = person(client, name="Marta")
    assert p["connector"] is False and p["postal_address"] is None
    q = client.patch(url(p), json={"updated_at": p["updated_at"], "connector": True, "postal_address": "Porto"}).json()
    assert (q["connector"], q["postal_address"]) == (True, "Porto")
    assert client.patch(url(p), json={"updated_at": q["updated_at"], "connector": None}).status_code == 422
    assert client.patch(url(p), json={"updated_at": p["updated_at"], "role": "Chef"}).status_code == 409


def test_people_puts_connectors_first_then_a_to_z(client, org):
    at(client, org, name="Zoe")
    person(client, name="Yara", connector=True)
    person(client, name="Abel")
    person(client, name="Bea", connector=True)
    assert [p["name"] for p in client.get("/api/people").json()] == ["Bea", "Yara", "Abel", "Zoe"]
    assert [p["name"] for p in client.get("/api/people?connector=1").json()] == ["Bea", "Yara"]


def test_people_search_by_name_or_organisation(client, org):
    at(client, org, name="Zoe")
    person(client, name="Abel")
    assert [p["name"] for p in client.get("/api/people", params={"q": "acme"}).json()] == ["Zoe"]
    assert [p["name"] for p in client.get("/api/people", params={"q": "abe"}).json()] == ["Abel"]
    assert client.get("/api/people", params={"q": "%"}).json() == []


def test_people_carry_their_last_log_and_how_many_they_introduced(client, org):
    rui = at(client, org, name="Rui")
    client.post("/api/orgs/%d/interactions" % org["id"], json={
        "type": "call", "summary": "x", "contact_ids": [rui["id"]], "happened_at": "2026-09-12T10:00:00+00:00"})
    client.post("/api/orgs", json={"name": "Brought", "introduced_by_contact_id": rui["id"]})
    got = client.get("/api/people").json()[0]
    assert (got["name"], got["org_slug"], got["last_contact"], got["introduced_count"]) == (
        "Rui", "acme-studio", "2026-09-12T10:00:00.000000+00:00", 1)


def test_what_a_person_introduced(client):
    marta = person(client, name="Marta", connector=True)
    lead = client.post("/api/orgs", json={"name": "Lead Co", "value_estimate": 900,
                                          "introduced_by_contact_id": marta["id"]}).json()
    got = client.get("/api/contacts/%d/introduced" % marta["id"]).json()
    assert [o["slug"] for o in got["orgs"]] == [lead["slug"]]
    assert got["client_value"] == 0
    assert client.get("/api/contacts/999/introduced").status_code == 404


def test_deleting_an_organisation_keeps_its_people(client, org):
    rui = at(client, org, name="Rui", is_primary=True)
    assert client.delete("/api/orgs/%d" % org["id"]).status_code == 204
    kept = client.get(url(rui)).json()
    assert (kept["org_id"], kept["is_primary"], kept["updated_by"]) == (None, False, "ana@example.com")
    assert [p["name"] for p in client.get("/api/people").json()] == ["Rui"]


def test_a_person_without_an_organisation_cannot_be_researched(ai_client):
    solo = ai_client.post("/api/contacts", json={"name": "Solo"}).json()
    assert ai_client.post("/api/contacts/%d/research" % solo["id"]).status_code == 422
    assert ai_client.get("/api/contacts/%d/research" % solo["id"]).json() == []


def test_adding_a_person_needs_the_header(make_client):
    assert make_client().post("/api/contacts", json={"name": "X"}, headers=TEAM).status_code == 403
