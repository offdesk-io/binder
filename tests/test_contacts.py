def add(client, org, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_add_and_list(client, org):
    add(client, org, name="Rui", role="CEO", email="rui@acme.example")
    add(client, org, name="Inês")
    names = [c["name"] for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()]
    assert names == ["Inês", "Rui"]


def test_one_primary_per_org(client, org):
    a = add(client, org, name="A", is_primary=True)
    add(client, org, name="B", is_primary=True)
    contacts = {c["name"]: c for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()}
    assert contacts["B"]["is_primary"] is True
    assert contacts["A"]["is_primary"] is False
    listed = client.get("/api/orgs/%d/contacts" % org["id"]).json()
    assert listed[0]["name"] == "B"  # primary first
    assert a["id"] != contacts["B"]["id"]


def test_patch_and_conflict(client, org):
    c = add(client, org, name="Rui")
    r = client.patch("/api/contacts/%d" % c["id"], json={"updated_at": c["updated_at"], "role": "CTO"})
    assert r.json()["role"] == "CTO"
    r = client.patch("/api/contacts/%d" % c["id"], json={"updated_at": c["updated_at"], "role": "COO"})
    assert r.status_code == 409


def test_bad_relationship_is_422(client, org):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "X", "relationship": "best"})
    assert r.status_code == 422


def test_get_and_delete(client, org):
    c = add(client, org, name="Rui")
    assert client.get("/api/contacts/%d" % c["id"]).json()["org_name"] == "Acme Studio"
    assert client.delete("/api/contacts/%d" % c["id"]).status_code == 204
    assert client.get("/api/contacts/%d" % c["id"]).status_code == 404


def test_contact_on_missing_org_is_404(client):
    assert client.post("/api/orgs/999/contacts", json={"name": "X"}).status_code == 404


def test_patch_name_null_is_422(client, org):
    c = add(client, org, name="Rui")
    r = client.patch("/api/contacts/%d" % c["id"], json={"updated_at": c["updated_at"], "name": None})
    assert r.status_code == 422


def test_email_is_lowercased(client, org):
    c = add(client, org, name="Rui", email="Rui@Acme.Example")
    assert c["email"] == "rui@acme.example"
    r = client.patch("/api/contacts/%d" % c["id"], json={"updated_at": c["updated_at"], "email": "RUI@X.example"})
    assert r.json()["email"] == "rui@x.example"


def test_failed_create_leaves_no_open_transaction(tmp_path):
    import sqlite3

    import pytest
    from ledger.db import connect, migrate
    from ledger.errors import NotFound
    from ledger.repo import contacts, orgs
    path = str(tmp_path / "x.db")
    conn = connect(path)
    migrate(conn, path)
    with pytest.raises(NotFound):
        contacts.create(conn, 999, {"name": "X"}, "ana@example.com")
    assert not conn.in_transaction
    org = orgs.create(conn, {"name": "A", "tags": []}, "ana@example.com")
    with pytest.raises(sqlite3.InterfaceError):  # the insert fails after the write lock is taken
        contacts.create(conn, org["id"], {"name": "X", "email": object()}, "ana@example.com")
    assert not conn.in_transaction


def test_patch_primary_clears_the_other_primary(client, org):
    a = add(client, org, name="A", is_primary=True)
    b = add(client, org, name="B")
    r = client.patch("/api/contacts/%d" % b["id"], json={"updated_at": b["updated_at"], "is_primary": True})
    assert r.status_code == 200
    got = {c["name"]: c["is_primary"] for c in client.get("/api/orgs/%d/contacts" % org["id"]).json()}
    assert got == {"A": False, "B": True}
    assert a["id"] != b["id"]


def test_linkedin_must_be_http_or_bare(client, org):
    url = "/api/orgs/%d/contacts" % org["id"]
    assert client.post(url, json={"name": "A", "linkedin_url": "javascript:alert(1)"}).status_code == 422
    assert client.post(url, json={"name": "B", "linkedin_url": "https://example.com/in/b"}).status_code == 201
    c = add(client, org, name="C", linkedin_url="example.com/in/c")
    p = "/api/contacts/%d" % c["id"]
    assert client.patch(p, json={"updated_at": c["updated_at"], "linkedin_url": "data:x"}).status_code == 422
    assert client.patch(p, json={"updated_at": c["updated_at"], "linkedin_url": None}).status_code == 200
