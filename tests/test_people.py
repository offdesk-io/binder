"""Key people: contacts starred as key connectors and every referrer's own
person. A contact carries the star and a postal address; /api/people lists
key people A to Z."""

from tests.conftest import TEAM


def new_org(client, name, **body):
    r = client.post("/api/orgs", json=dict(body, name=name))
    assert r.status_code == 201, r.text
    return r.json()


def at(client, org, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def url(c):
    return "/api/contacts/%d" % c["id"]


def people(client, **params):
    r = client.get("/api/people", params=params)
    assert r.status_code == 200, r.text
    return r.json()


# The contact's own fields


def test_a_contact_starts_unstarred_with_no_postal_address(client, org):
    c = at(client, org, name="Bo")
    assert (c["connector"], c["postal_address"], c["is_referrer"]) == (False, None, False)


def test_star_and_postal_address_can_be_set_on_create_and_patch(client, org):
    c = at(client, org, name="Bo", connector=True, postal_address="1 Example Street\nPorto")
    assert (c["connector"], c["postal_address"]) == (True, "1 Example Street\nPorto")
    r = client.patch(url(c), json={"updated_at": c["updated_at"], "connector": False})
    assert r.status_code == 200 and r.json()["connector"] is False
    assert r.json()["postal_address"] == "1 Example Street\nPorto"
    assert client.patch(url(c), json={"updated_at": r.json()["updated_at"], "connector": None}).status_code == 422
    assert client.patch(url(c), json={"updated_at": c["updated_at"], "connector": True}).status_code == 409


def test_a_postal_address_is_capped(client, org):
    assert client.post("/api/orgs/%d/contacts" % org["id"],
                       json={"name": "Bo", "postal_address": "x" * 1001}).status_code == 422


def test_a_referrers_own_person_says_so(client, org):
    ref = new_org(client, "Rita Example", kind="referrer")
    rita = client.get("/api/contacts/%d" % ref["person"]["contact_id"]).json()
    assert rita["is_referrer"] is True
    other = at(client, ref, name="Assistant")
    assert other["is_referrer"] is False
    assert at(client, org, name="Bo")["is_referrer"] is False


# The people list


def test_people_are_starred_contacts_and_referrers_people_a_to_z(client, org):
    at(client, org, name="Zoe")  # not key
    at(client, org, name="Yara", connector=True)
    new_org(client, "Abel Example", kind="referrer")
    partner = new_org(client, "Northwind", kind="partner")
    at(client, partner, name="bea", connector=True)
    got = people(client)
    assert [p["name"] for p in got] == ["Abel Example", "bea", "Yara"]
    abel, bea, yara = got
    assert abel["referrer"]["name"] == "Abel Example" and abel["referrer"]["status"] == "identified"
    assert bea["referrer"] is None and yara["referrer"] is None
    assert (yara["org_name"], yara["org_slug"]) == ("Acme Studio", "acme-studio")
    assert (bea["connector"], abel["connector"]) == (True, False)


def test_a_starred_referrers_person_is_listed_once(client):
    ref = new_org(client, "Rita Example", kind="referrer")
    rita = client.get("/api/contacts/%d" % ref["person"]["contact_id"]).json()
    client.patch(url(rita), json={"updated_at": rita["updated_at"], "connector": True})
    assert [p["name"] for p in people(client)] == ["Rita Example"]


def test_a_referrer_that_becomes_a_lead_leaves_the_list(client):
    ref = new_org(client, "Rita Example", kind="referrer")
    client.patch("/api/orgs/%d" % ref["id"], json={"updated_at": ref["updated_at"], "kind": "lead"})
    assert people(client) == []


def test_people_carry_contact_details(client, org):
    at(client, org, name="Yara", role="Chef", email="yara@example.com", phone="+351 1", linkedin_url="linkedin.com/in/y",
       connector=True)
    p = people(client)[0]
    assert (p["role"], p["email"], p["phone"], p["linkedin_url"]) == ("Chef", "yara@example.com", "+351 1",
                                                                       "linkedin.com/in/y")


def test_people_search_by_name_role_or_organisation(client, org):
    at(client, org, name="Yara", role="Chef", connector=True)
    other = new_org(client, "Bolt")
    at(client, other, name="Bo", role="Founder", connector=True)
    assert [p["name"] for p in people(client, q="acme")] == ["Yara"]
    assert [p["name"] for p in people(client, q="found")] == ["Bo"]
    assert [p["name"] for p in people(client, q="BO")] == ["Bo"]
    assert people(client, q="%") == [] and people(client, q="_") == []


def test_last_contact_is_the_newest_log_with_them(client, org):
    y = at(client, org, name="Yara", connector=True)
    at(client, org, name="Other")
    client.post("/api/orgs/%d/interactions" % org["id"], json={
        "type": "call", "summary": "x", "contact_ids": [y["id"]], "happened_at": "2026-09-12T10:00:00+00:00"})
    client.post("/api/orgs/%d/interactions" % org["id"], json={
        "type": "call", "summary": "without her", "happened_at": "2026-10-12T10:00:00+00:00"})
    assert people(client)[0]["last_contact"] == "2026-09-12T10:00:00.000000+00:00"


def test_a_referrers_person_counts_every_log_on_the_referrer(client):
    ref = new_org(client, "Rita Example", kind="referrer")
    client.post("/api/orgs/%d/interactions" % ref["id"], json={
        "type": "call", "summary": "x", "happened_at": "2026-09-12T10:00:00+00:00"})
    assert people(client)[0]["last_contact"] == "2026-09-12T10:00:00.000000+00:00"


def test_introduced_count_is_through_the_referrer(client, org):
    ref = new_org(client, "Rita Example", kind="referrer")
    new_org(client, "Lead A", introduced_by_id=ref["id"])
    new_org(client, "Client B", kind="client", introduced_by_id=ref["id"])
    at(client, org, name="Yara", connector=True)
    got = {p["name"]: p["introduced_count"] for p in people(client)}
    assert got == {"Rita Example": 2, "Yara": 0}


def test_people_needs_sign_in(make_client):
    assert make_client().get("/api/people").status_code == 401
    assert make_client().get("/api/people", headers=TEAM).status_code == 200


# Search


def test_search_marks_key_people(client, org):
    at(client, org, name="Yara Starred", connector=True)
    at(client, org, name="Yara Plain")
    new_org(client, "Yara Referrer", kind="referrer")
    hits = {(h["kind"], h["title"]): h["key_person"] for h in client.get("/api/search?q=yara").json()}
    assert hits[("contact", "Yara Starred")] is True
    assert hits[("contact", "Yara Plain")] is False
    assert hits[("contact", "Yara Referrer")] is True
    assert hits[("org", "Yara Referrer")] is False
