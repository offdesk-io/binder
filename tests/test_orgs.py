from tests.conftest import TEAM


def test_post_without_x_binder_is_403(make_client):
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


def test_patch_name_null_is_422(client, org):
    r = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "name": None})
    assert r.status_code == 422


def test_integrity_error_backstop_hides_internals_and_logs_them(make_client, caplog):
    import logging
    import sqlite3
    c = make_client()

    @c.app.get("/boom-secret")
    def boom_secret():
        raise sqlite3.IntegrityError("NOT NULL constraint failed: organisations.name")

    @c.app.get("/boom-dup")
    def boom_dup():
        raise sqlite3.IntegrityError("UNIQUE constraint failed: organisations.slug")

    with caplog.at_level(logging.WARNING, logger="binder"):
        r = c.get("/boom-secret")
        d = c.get("/boom-dup")
    assert (r.status_code, r.json()) == (422, {"detail": "That breaks a rule on this record"})
    assert (d.status_code, d.json()) == (409, {"detail": "That conflicts with an existing record"})
    assert "organisations.name" in caplog.text and "organisations.slug" in caplog.text


def test_integrity_error_backstop_is_422_and_unique_is_409(make_client):
    import sqlite3
    c = make_client()

    @c.app.get("/boom-check")
    def boom_check():
        raise sqlite3.IntegrityError("NOT NULL constraint failed: organisations.name")

    @c.app.get("/boom-unique")
    def boom_unique():
        raise sqlite3.IntegrityError("UNIQUE constraint failed: organisations.slug")

    assert c.get("/boom-check").status_code == 422
    assert c.get("/boom-unique").status_code == 409


def test_create_failure_leaves_no_open_transaction(tmp_path):
    import pytest
    from binder.db import connect, migrate
    from binder.repo import orgs as repo
    path = str(tmp_path / "x.db")
    conn = connect(path)
    migrate(conn, path)
    with pytest.raises(KeyError):
        repo.create(conn, {"tags": []}, "ana@example.com")  # no name
    assert not conn.in_transaction


def test_next_step_due_must_be_an_iso_date(client, org):
    assert client.post("/api/orgs", json={"name": "Z", "next_step_due": "next tuesday"}).status_code == 422
    assert client.post("/api/orgs", json={"name": "Z", "next_step_due": "2026-11-20"}).status_code == 201
    base = {"updated_at": org["updated_at"]}
    assert client.patch("/api/orgs/%d" % org["id"], json=dict(base, next_step_due="soon")).status_code == 422
    o = client.patch("/api/orgs/%d" % org["id"], json=dict(base, next_step_due="2026-11-20")).json()
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": o["updated_at"], "next_step_due": None}).json()
    assert o["next_step_due"] is None


def test_name_query_treats_wildcards_literally(client):
    client.post("/api/orgs", json={"name": "Acme"})
    client.post("/api/orgs", json={"name": "100% Pure"})
    client.post("/api/orgs", json={"name": "A_B"})
    assert [o["name"] for o in client.get("/api/orgs", params={"q": "%"}).json()] == ["100% Pure"]
    assert [o["name"] for o in client.get("/api/orgs", params={"q": "_"}).json()] == ["A_B"]
    assert client.get("/api/orgs", params={"q": "\\"}).json() == []


def test_owner_email_is_lowercased(client, org):
    o = client.post("/api/orgs", json={"name": "Own", "owner_email": "Rui@Example.COM"}).json()
    assert o["owner_email"] == "rui@example.com"
    p = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "owner_email": "Ines@Example.com"}).json()
    assert p["owner_email"] == "ines@example.com"
    assert [x["name"] for x in client.get("/api/orgs", params={"owner": "RUI@example.com"}).json()] == ["Own"]


def test_value_estimate_must_be_finite_and_not_negative(client):
    assert client.post("/api/orgs", json={"name": "V", "value_estimate": -1}).status_code == 422
    r = client.post("/api/orgs", content='{"name": "V", "value_estimate": NaN}',
                    headers={"content-type": "application/json"})
    assert r.status_code == 422
    assert client.post("/api/orgs", json={"name": "V", "value_estimate": 0}).status_code == 201


def test_unknown_sort_is_422(client):
    assert client.get("/api/orgs?sort=bogus").status_code == 422
    assert client.get("/api/orgs?sort=name").status_code == 200


def test_website_must_be_http_or_bare(client, org):
    assert client.post("/api/orgs", json={"name": "A", "website": "javascript:alert(1)"}).status_code == 422
    assert client.post("/api/orgs", json={"name": "B", "website": "https://example.com"}).status_code == 201
    assert client.post("/api/orgs", json={"name": "C", "website": "example.com"}).status_code == 201
    assert client.post("/api/orgs", json={"name": "D", "website": "localhost:3000"}).status_code == 201
    bad = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "website": "data:text/html,x"})
    assert bad.status_code == 422
    ok = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "website": None})
    assert ok.status_code == 200
