def contact(client, org, name):
    return client.post("/api/orgs/%d/contacts" % org["id"], json={"name": name}).json()


def log(client, org, **kw):
    kw.setdefault("type", "call")
    kw.setdefault("summary", "Intro call")
    r = client.post("/api/orgs/%d/interactions" % org["id"], json=kw)
    assert r.status_code == 201, r.text
    return r.json()


def test_log_with_contacts(client, org):
    rui = contact(client, org, "Rui")
    i = log(client, org, contact_ids=[rui["id"]], happened_at="2026-11-01T10:00:00+00:00", next_step="Send deck")
    assert i["contact_ids"] == [rui["id"]]
    assert i["author_email"] == "ana@example.com"
    assert client.get("/api/orgs/%d" % org["id"]).json()["last_contact"] == "2026-11-01T10:00:00+00:00"


def test_happened_at_defaults_to_now(client, org):
    i = log(client, org)
    assert i["happened_at"] == i["created_at"]


def test_contact_from_other_org_is_422(client, org):
    other = client.post("/api/orgs", json={"name": "Other"}).json()
    stranger = contact(client, other, "Zé")
    r = client.post("/api/orgs/%d/interactions" % org["id"],
                    json={"type": "call", "summary": "x", "contact_ids": [stranger["id"]]})
    assert r.status_code == 422


def test_bad_type_is_422(client, org):
    r = client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "fax", "summary": "x"})
    assert r.status_code == 422


def test_patch_contacts_and_conflict(client, org):
    rui, ines = contact(client, org, "Rui"), contact(client, org, "Inês")
    i = log(client, org, contact_ids=[rui["id"]])
    j = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "contact_ids": [ines["id"]]}).json()
    assert j["contact_ids"] == [ines["id"]]
    r = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "summary": "y"})
    assert r.status_code == 409


def test_contact_interactions(client, org):
    rui = contact(client, org, "Rui")
    log(client, org, contact_ids=[rui["id"]], summary="With Rui")
    log(client, org, summary="Without")
    assert [i["summary"] for i in client.get("/api/contacts/%d/interactions" % rui["id"]).json()] == ["With Rui"]


def test_timeline_mixes_interactions_and_status(client, org):
    log(client, org, happened_at="2000-01-01T00:00:00+00:00", summary="Old note", type="note")
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "status": "contacted"})
    items = client.get("/api/orgs/%d/timeline" % org["id"]).json()
    assert [i["kind"] for i in items] == ["status", "status", "interaction"]
    assert items[0]["to_status"] == "contacted"
    assert items[-1]["summary"] == "Old note"


def test_delete_interaction(client, org):
    i = log(client, org)
    assert client.delete("/api/interactions/%d" % i["id"]).status_code == 204
    assert client.get("/api/orgs/%d/interactions" % org["id"]).json() == []


def test_patch_nulls_for_required_fields_are_422(client, org):
    i = log(client, org)
    url = "/api/interactions/%d" % i["id"]
    for field in ("summary", "type", "happened_at"):
        r = client.patch(url, json={"updated_at": i["updated_at"], field: None})
        assert r.status_code == 422, field


def test_happened_at_must_be_iso_datetime(client, org):
    bad = client.post("/api/orgs/%d/interactions" % org["id"],
                      json={"type": "call", "summary": "x", "happened_at": "yesterday"})
    assert bad.status_code == 422
    z = log(client, org, happened_at="2026-11-01T10:00:00Z")
    assert z["happened_at"] == "2026-11-01T10:00:00Z"
    r = client.patch("/api/interactions/%d" % z["id"], json={"updated_at": z["updated_at"], "happened_at": "nope"})
    assert r.status_code == 422


def test_next_step_due_must_be_an_iso_date(client, org):
    bad = client.post("/api/orgs/%d/interactions" % org["id"],
                      json={"type": "call", "summary": "x", "next_step_due": "next tuesday"})
    assert bad.status_code == 422
    i = log(client, org, next_step_due="2026-11-20")
    r = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "next_step_due": "soon"})
    assert r.status_code == 422
    r = client.patch("/api/interactions/%d" % i["id"], json={"updated_at": i["updated_at"], "next_step_due": None})
    assert r.json()["next_step_due"] is None


def test_contact_ownership_is_checked_inside_the_write_transaction(tmp_path, monkeypatch):
    import pytest
    from ledger.db import connect, migrate
    from ledger.errors import Invalid
    from ledger.repo import interactions, orgs
    path = str(tmp_path / "x.db")
    conn = connect(path)
    migrate(conn, path)
    org = orgs.create(conn, {"name": "A", "tags": []}, "ana@example.com")
    seen = []
    real = interactions._check
    monkeypatch.setattr(interactions, "_check", lambda c, *a: (seen.append(c.in_transaction), real(c, *a))[1])
    with pytest.raises(Invalid):
        interactions.create(conn, org["id"], {"type": "call", "summary": "x", "contact_ids": [99]}, "ana@example.com")
    assert seen == [True]
    assert not conn.in_transaction
