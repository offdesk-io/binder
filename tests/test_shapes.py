"""Response shapes the frontend depends on. See the API section of the README."""

from ledger import statuses


def test_contact_list_and_get_return_the_same_fields(client, org):
    c = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo"}).json()
    listed = client.get("/api/orgs/%d/contacts" % org["id"]).json()[0]
    one = client.get("/api/contacts/%d" % c["id"]).json()
    assert listed == one
    assert (listed["org_name"], listed["org_slug"]) == (org["name"], org["slug"])


def test_timeline_items_name_their_author_by_email(client, org):
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "note", "summary": "Hi"})
    items = client.get("/api/orgs/%d/timeline" % org["id"]).json()
    assert {i["kind"] for i in items} == {"interaction", "status"}
    for i in items:
        assert i["by_email"] == "ana@example.com"
        assert "author_email" not in i


def test_every_error_detail_is_a_string(client, org):
    missing = client.get("/api/orgs/999")
    bad_body = client.post("/api/orgs", json={})
    bad_rule = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "X", "relationship": "hot"})
    stale = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": "2000-01-01T00:00:00.000000+00:00"})
    for r, code in ((missing, 404), (bad_body, 422), (bad_rule, 422), (stale, 409)):
        assert r.status_code == code
        assert isinstance(r.json()["detail"], str)


def test_request_validation_lists_each_field_error(client):
    body = client.post("/api/orgs", json={}).json()
    assert body["detail"] == "name: Field required"
    assert body["errors"] == [{"loc": ["body", "name"], "msg": "Field required", "type": "missing"}]


def test_meta_lists_the_vocabularies(client):
    m = client.get("/api/meta").json()
    assert m == {
        "kinds": list(statuses.KINDS),
        "lead_statuses": list(statuses.LEAD_STATUSES),
        "open_lead_statuses": list(statuses.OPEN_LEAD_STATUSES),
        "client_statuses": list(statuses.CLIENT_STATUSES),
        "interaction_types": list(statuses.INTERACTION_TYPES),
        "relationships": list(statuses.RELATIONSHIPS),
        "ai": False,
    }
    assert None not in m["relationships"]


def test_meta_is_behind_the_guard(make_client):
    assert make_client().get("/api/meta").status_code == 401
