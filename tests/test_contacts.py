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
    import pytest
    from ledger.db import connect, migrate
    from ledger.errors import NotFound
    from ledger.repo import contacts
    path = str(tmp_path / "x.db")
    conn = connect(path)
    migrate(conn, path)
    with pytest.raises(NotFound):
        contacts.create(conn, 999, {"name": "X"}, "ana@example.com")
    assert not conn.in_transaction
    with pytest.raises(KeyError):  # fails after the write lock is taken
        contacts.create(conn, 999, {}, "ana@example.com")
    assert not conn.in_transaction
