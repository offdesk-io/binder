from tests.conftest import TEAM


def test_post_without_x_ledger_is_403(make_client):
    r = make_client().post("/api/orgs", json={"name": "X"}, headers=TEAM)
    assert r.status_code == 403


def test_create_lead_defaults(client):
    r = client.post("/api/orgs", json={"name": "Acme Studio", "tags": ["design"]})
    assert r.status_code == 201
    o = r.json()
    assert o["slug"] == "acme-studio"
    assert o["kind"] == "lead" and o["status"] == "lead"
    assert o["tags"] == ["design"]
    assert o["owner_email"] == "ana@example.com"
    assert o["updated_by"] == "ana@example.com"


def test_slug_is_unique(client):
    client.post("/api/orgs", json={"name": "Acme"})
    assert client.post("/api/orgs", json={"name": "Acme"}).json()["slug"] == "acme-2"


def test_slug_strips_accents(client):
    assert client.post("/api/orgs", json={"name": "Café Açores"}).json()["slug"] == "cafe-acores"


def test_get_by_id_and_slug(client, org):
    assert client.get("/api/orgs/%d" % org["id"]).json()["name"] == "Acme Studio"
    assert client.get("/api/orgs/by-slug/acme-studio").json()["id"] == org["id"]


def test_get_missing_is_404(client):
    assert client.get("/api/orgs/999").status_code == 404


def test_patch_fields(client, org):
    r = client.patch("/api/orgs/%d" % org["id"], json={
        "updated_at": org["updated_at"], "website": "https://acme.example", "next_step": "Call Rui"})
    assert r.status_code == 200
    assert r.json()["website"] == "https://acme.example"


def test_stale_patch_is_409_with_current(client, org):
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "sector": "Retail"})
    r = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "sector": "Food"})
    assert r.status_code == 409
    assert r.json()["current"]["sector"] == "Retail"


def test_list_filters(client):
    client.post("/api/orgs", json={"name": "A", "tags": ["x"]})
    b = client.post("/api/orgs", json={"name": "B", "kind": "client"}).json()
    assert [o["name"] for o in client.get("/api/orgs?kind=client").json()] == ["B"]
    assert [o["name"] for o in client.get("/api/orgs?tag=x").json()] == ["A"]
    assert [o["name"] for o in client.get("/api/orgs?status=active").json()] == ["B"]
    assert b["status"] == "active"


def test_list_name_query(client):
    client.post("/api/orgs", json={"name": "Northwind"})
    client.post("/api/orgs", json={"name": "Acme"})
    assert [o["name"] for o in client.get("/api/orgs?q=north").json()] == ["Northwind"]


def test_delete(client, org):
    assert client.delete("/api/orgs/%d" % org["id"]).status_code == 204
    assert client.get("/api/orgs/%d" % org["id"]).status_code == 404
