"""Partners are organisations with kind `partner`. Any organisation can say who
introduced it: one person or one partner."""


def partner(client, name="Northwind Partners", **kw):
    r = client.post("/api/orgs", json=dict(kw, name=name, kind="partner"))
    assert r.status_code == 201, r.text
    return r.json()


def url(o):
    return "/api/orgs/%d" % o["id"]


def test_a_partner_is_an_organisation_with_partner_statuses(client):
    p = partner(client)
    assert (p["kind"], p["status"]) == ("partner", "prospect")
    r = client.patch(url(p), json={"updated_at": p["updated_at"], "status": "active"})
    assert (r.json()["kind"], r.json()["status"]) == ("partner", "active")
    assert client.patch(url(p), json={"updated_at": r.json()["updated_at"], "status": "won"}).status_code == 422
    client.post("/api/orgs", json={"name": "Plain lead"})
    assert [o["name"] for o in client.get("/api/orgs?kind=partner").json()] == ["Northwind Partners"]


def test_meta_serves_the_partner_kind_and_statuses(client):
    m = client.get("/api/meta").json()
    assert m["partner_statuses"] == ["prospect", "active", "past"]
    assert m["kinds"] == ["lead", "client", "partner"]


def test_an_unknown_kind_is_422(client):
    assert client.post("/api/orgs", json={"name": "X", "kind": "vendor"}).status_code == 422


def test_introduced_by_a_partner_is_read_back_with_its_name_and_slug(client, org):
    p = partner(client)
    r = client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["introduced_by"] == {"type": "partner", "id": p["id"], "name": "Northwind Partners", "slug": p["slug"]}
    listed = [o for o in client.get("/api/orgs").json() if o["id"] == org["id"]][0]
    assert listed["introduced_by"] == r.json()["introduced_by"]
    assert client.get(url(p)).json()["introduced_by"] is None


def test_introduced_by_a_person(client, org):
    rui = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui"}).json()
    o = client.post("/api/orgs", json={"name": "Brought In", "introduced_by_contact_id": rui["id"]}).json()
    assert o["introduced_by"] == {"type": "contact", "id": rui["id"], "name": "Rui"}
    assert (o["introduced_by_contact_id"], o["introduced_by_org_id"]) == (rui["id"], None)


def test_only_a_partner_that_exists_and_never_itself(client, org):
    lead = client.post("/api/orgs", json={"name": "Plain lead"}).json()
    base = {"updated_at": org["updated_at"]}
    assert client.patch(url(org), json=dict(base, introduced_by_org_id=lead["id"])).status_code == 422
    assert client.patch(url(org), json=dict(base, introduced_by_org_id=999)).status_code == 422
    assert client.patch(url(org), json=dict(base, introduced_by_contact_id=999)).status_code == 422
    p = partner(client)
    assert client.patch(url(p), json={"updated_at": p["updated_at"], "introduced_by_org_id": p["id"]}).status_code == 422


def test_one_introducer_at_most(client, org):
    p = partner(client)
    rui = client.post("/api/orgs/%d/contacts" % p["id"], json={"name": "Rui"}).json()
    both = client.post("/api/orgs", json={"name": "Both", "introduced_by_org_id": p["id"],
                                          "introduced_by_contact_id": rui["id"]})
    assert both.status_code == 422
    o = client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]}).json()
    # Setting the person while the stored partner stays would make two.
    r = client.patch(url(org), json={"updated_at": o["updated_at"], "introduced_by_contact_id": rui["id"]})
    assert r.status_code == 422
    swapped = client.patch(url(org), json={"updated_at": o["updated_at"], "introduced_by_contact_id": rui["id"],
                                           "introduced_by_org_id": None}).json()
    assert swapped["introduced_by"] == {"type": "contact", "id": rui["id"], "name": "Rui"}


def test_what_a_partner_introduced_and_what_its_clients_are_worth(client):
    p = partner(client)
    a = client.post("/api/orgs", json={"name": "Alpha", "kind": "client", "value_estimate": 3000,
                                       "introduced_by_org_id": p["id"]}).json()
    client.post("/api/orgs", json={"name": "Beta", "kind": "client", "value_estimate": 2000,
                                   "introduced_by_org_id": p["id"]})
    client.post("/api/orgs", json={"name": "Gamma", "value_estimate": 9000, "introduced_by_org_id": p["id"]})
    client.post("/api/orgs", json={"name": "Delta", "kind": "client", "value_estimate": 7000})
    got = client.get("/api/orgs/%d/introduced" % p["id"]).json()
    assert [o["name"] for o in got["orgs"]] == ["Alpha", "Beta", "Gamma"]
    assert got["orgs"][0] == {"id": a["id"], "name": "Alpha", "slug": a["slug"], "kind": "client",
                              "status": "active", "value_estimate": 3000}
    assert got["client_value"] == 5000
    assert client.get("/api/orgs/999/introduced").status_code == 404


def test_deleting_the_partner_clears_introduced_by(client, org):
    p = partner(client)
    client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]})
    assert client.delete(url(p)).status_code == 204
    assert client.get(url(org)).json()["introduced_by"] is None


def test_a_stale_introduced_by_save_is_409(client, org):
    p = partner(client)
    client.patch(url(org), json={"updated_at": org["updated_at"], "sector": "Retail"})
    r = client.patch(url(org), json={"updated_at": org["updated_at"], "introduced_by_org_id": p["id"]})
    assert r.status_code == 409
    assert r.json()["current"]["sector"] == "Retail"
