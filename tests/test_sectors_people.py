"""Sectors as a fixed list, the description that holds the old free text,
"Handled by" from BINDER_OWNERS, and a referrer as a person."""

import pytest

from binder.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate
from binder.statuses import SECTORS
from tests.conftest import WRITE


def _new(client, name, **body):
    r = client.post("/api/orgs", json=dict(body, name=name))
    assert r.status_code == 201, r.text
    return r.json()


def _patch(client, o, **body):
    return client.patch("/api/orgs/%d" % o["id"], json=dict(body, updated_at=o["updated_at"]))


def _get(client, o):
    return client.get("/api/orgs/%d" % o["id"]).json()


def _contacts(client, o):
    return client.get("/api/orgs/%d/contacts" % o["id"]).json()


# Sectors and description


def test_meta_serves_the_sectors(client):
    assert client.get("/api/meta").json()["sectors"] == list(SECTORS) == [
        "manufacturing", "consulting", "technology", "retail_ecommerce", "healthcare", "construction_installations"]


def test_sector_is_a_key_or_null(client):
    o = _new(client, "Acme", sector="consulting", description="Lean and training for SMEs")
    assert (o["sector"], o["description"]) == ("consulting", "Lean and training for SMEs")
    assert client.post("/api/orgs", json={"name": "B", "sector": "Consulting"}).status_code == 422
    assert client.post("/api/orgs", json={"name": "C", "sector": "Textiles and more"}).status_code == 422
    r = _patch(client, o, sector="ceramics")
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    r = _patch(client, o, sector=None)
    assert r.status_code == 200 and r.json()["sector"] is None


def test_search_finds_description(client):
    o = _new(client, "Acme", description="Makes kilns for potteries")
    assert [h["id"] for h in client.get("/api/search?q=kilns").json()] == [o["id"]]
    _patch(client, o, description="Glazes now")
    assert client.get("/api/search?q=kilns").json() == []
    assert len(client.get("/api/search?q=glazes").json()) == 1


def test_search_finds_sector(client):
    _new(client, "Acme", sector="healthcare")
    assert [h["org_name"] for h in client.get("/api/search?q=healthcare").json()] == ["Acme"]


def _upto(tmp_path, monkeypatch, number):
    mig = tmp_path / ("migs%d" % number)
    mig.mkdir()
    for f in REAL_MIGRATIONS.glob("*.sql"):
        if int(f.name[:3]) <= number:
            (mig / f.name).write_text(f.read_text())
    monkeypatch.setattr("binder.db.MIGRATIONS", mig)


def test_migration_007_moves_sector_text_to_description(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    _upto(tmp_path, monkeypatch, 6)
    migrate(conn, path)
    texts = [
        "Pottery and kilns (made up)",           # free text: no sector, kept as description
        "Tooling, exports to \"Somewhere\"",     # quotes do not trip anything
        "consulting",                            # already a key: stays the sector too
        "",                                      # empty text
        None,                                    # no sector at all
        "Something never seen before, 100% unknown; 'quoted' too",
    ]
    for i, t in enumerate(texts):
        conn.execute("INSERT INTO organisations(slug,name,kind,status,sector,created_at,updated_at,updated_by)"
                     " VALUES (?,?,?,?,?,'t','t','u')", ("o%d" % i, "Org %d" % i, "lead", "lead", t))
    conn.execute("INSERT INTO organisations(slug,name,kind,status,sector,created_at,updated_at,updated_by)"
                 " VALUES ('r','Rita Example','referrer','identified','Project manager at Example Co','t','t','u')")
    conn.execute("INSERT INTO contacts(org_id,name,created_at,updated_at,updated_by) VALUES (1,'Bo','t','t','u')")

    monkeypatch.setattr("binder.db.MIGRATIONS", REAL_MIGRATIONS)
    migrate(conn, path)

    assert conn.execute("PRAGMA user_version").fetchone()[0] >= 7
    got = [(r["sector"], r["description"]) for r in conn.execute("SELECT sector, description FROM organisations ORDER BY id")]
    assert got == [
        (None, "Pottery and kilns (made up)"),
        (None, "Tooling, exports to \"Somewhere\""),
        ("consulting", "consulting"),
        (None, ""),
        (None, None),
        (None, "Something never seen before, 100% unknown; 'quoted' too"),
        (None, "Project manager at Example Co"),
    ]
    assert conn.execute("SELECT count(*) FROM contacts").fetchone()[0] == 1
    # The old text is still found by search, now through description, and the triggers follow edits.
    assert conn.execute("SELECT count(*) FROM search WHERE search MATCH 'kilns'").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM search WHERE kind = 'org'").fetchone()[0] == 7
    conn.execute("UPDATE organisations SET description = 'Glazes' WHERE id = 1")
    assert conn.execute("SELECT count(*) FROM search WHERE search MATCH 'kilns'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM search WHERE search MATCH 'glazes'").fetchone()[0] == 1
    triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='organisations'")}
    assert triggers == {"org_ai", "org_au", "org_ad"}


# Handled by


def test_meta_serves_the_owners(client):
    assert client.get("/api/meta").json()["owners"][0] == {"email": "ana@example.com", "name": "Ana"}


def test_owner_must_be_on_the_list(client):
    o = _new(client, "Acme", owner_email="rui@example.com")
    assert o["owner_email"] == "rui@example.com"
    assert client.post("/api/orgs", json={"name": "B", "owner_email": "someone@example.com"}).status_code == 422
    assert _patch(client, o, owner_email="someone@example.com").status_code == 422
    r = _patch(client, o, owner_email=None)
    assert r.status_code == 200 and r.json()["owner_email"] is None


def test_creator_on_the_list_handles_a_new_record(client):
    assert _new(client, "Acme")["owner_email"] == "ana@example.com"


def test_creator_off_the_list_leaves_it_with_nobody(make_client):
    c = make_client(owners="rui@example.com=Rui")
    c.headers.update(WRITE)  # signed in as ana@example.com, who is not on the list
    assert _new(c, "Acme")["owner_email"] is None


def test_without_owners_only_nobody(make_client):
    c = make_client(owners=None)
    c.headers.update(WRITE)
    assert c.get("/api/meta").json()["owners"] == []
    o = _new(c, "Acme")
    assert o["owner_email"] is None
    assert _patch(c, o, owner_email="ana@example.com").status_code == 422


def test_an_old_owner_off_the_list_stays_until_changed(client):
    o = _new(client, "Acme")
    db = connect(client.app.state.settings.db_path)
    db.execute("UPDATE organisations SET owner_email = 'former@example.com' WHERE id = ?", (o["id"],))
    o = _get(client, o)
    r = _patch(client, o, next_step="Call")
    assert r.status_code == 200 and r.json()["owner_email"] == "former@example.com"
    assert _patch(client, r.json(), owner_email="former@example.com").status_code == 422


def test_list_filter_by_owner_still_works(client):
    _new(client, "A", owner_email="rui@example.com")
    _new(client, "B")
    assert [o["name"] for o in client.get("/api/orgs?owner=rui@example.com").json()] == ["A"]


# A referrer as a person


def test_referrer_gets_its_own_primary_contact(client):
    ref = _new(client, "Rita Example", kind="referrer",
               person={"email": "Rita@Example.com", "phone": "+351 900 000 000", "linkedin_url": "linkedin.com/in/rita"})
    people = _contacts(client, ref)
    assert [(c["name"], c["is_primary"], c["email"]) for c in people] == [("Rita Example", True, "rita@example.com")]
    assert ref["person"] == {"contact_id": people[0]["id"], "email": "rita@example.com",
                             "phone": "+351 900 000 000", "linkedin_url": "linkedin.com/in/rita"}


def test_referrer_without_person_fields_still_gets_a_contact(client):
    ref = _new(client, "Rita Example", kind="referrer")
    assert ref["person"] == {"contact_id": _contacts(client, ref)[0]["id"], "email": None, "phone": None,
                             "linkedin_url": None}


def test_other_kinds_have_no_person(client):
    lead = _new(client, "Acme")
    assert lead["person"] is None and _contacts(client, lead) == []
    assert client.post("/api/orgs", json={"name": "B", "person": {"email": "b@example.com"}}).status_code == 422
    assert _patch(client, lead, person={"phone": "1"}).status_code == 422


def test_patch_person_fields_writes_the_contact(client):
    ref = _new(client, "Rita Example", kind="referrer", person={"email": "rita@example.com"})
    r = _patch(client, ref, person={"phone": "123"})
    assert r.status_code == 200
    assert (r.json()["person"]["email"], r.json()["person"]["phone"]) == ("rita@example.com", "123")
    c = client.get("/api/contacts/%d" % ref["person"]["contact_id"]).json()
    assert (c["email"], c["phone"]) == ("rita@example.com", "123")


def test_bad_person_fields_are_422(client):
    ref = _new(client, "Rita Example", kind="referrer")
    assert _patch(client, ref, person={"linkedin_url": "ftp://example.com"}).status_code == 422
    assert _patch(client, ref, person={"notes": "x"}).status_code == 422


def test_renaming_a_referrer_renames_its_contact(client):
    ref = _new(client, "Rita Example", kind="referrer")
    _patch(client, ref, name="Rita B. Example")
    assert [c["name"] for c in _contacts(client, ref)] == ["Rita B. Example"]
    assert client.get("/api/search?q=rita").json()  # both the record and the contact are found


def test_renaming_a_lead_leaves_its_contacts(client):
    lead = _new(client, "Acme")
    client.post("/api/orgs/%d/contacts" % lead["id"], json={"name": "Bo", "is_primary": True})
    _patch(client, lead, name="Acme Two")
    assert [c["name"] for c in _contacts(client, lead)] == ["Bo"]


@pytest.mark.parametrize("field,value", [("website", "example.com"), ("size", "1"), ("sector", "consulting")])
def test_referrer_refuses_organisation_fields(client, field, value):
    assert client.post("/api/orgs", json={"name": "R", "kind": "referrer", field: value}).status_code == 422
    ref = _new(client, "Rita Example", kind="referrer")
    assert _patch(client, ref, **{field: value}).status_code == 422
    assert _patch(client, ref, **{field: None}).status_code == 200


def test_becoming_a_referrer_clears_website_size_and_sector_but_keeps_description(client):
    lead = _new(client, "Rita Example", website="example.com", size="10", sector="consulting",
                description="Project manager at Example Co")
    assert _patch(client, lead, kind="referrer", website="example.org").status_code == 422  # sent with a value: refused
    r = _patch(client, lead, kind="referrer")
    assert r.status_code == 200
    got = r.json()
    assert (got["website"], got["size"], got["sector"]) == (None, None, None)
    assert got["description"] == "Project manager at Example Co"
    assert client.get("/api/search?q=consulting").json() == []


def test_lead_becomes_referrer_and_gets_a_contact(client):
    lead = _new(client, "Rita Example")
    r = _patch(client, lead, kind="referrer", person={"email": "rita@example.com"}).json()
    people = _contacts(client, lead)
    assert [(c["name"], c["is_primary"], c["email"]) for c in people] == [("Rita Example", True, "rita@example.com")]
    assert r["person"]["contact_id"] == people[0]["id"]


def test_becoming_a_referrer_keeps_an_existing_primary(client):
    lead = _new(client, "Wrongly Filed Co")
    bo = client.post("/api/orgs/%d/contacts" % lead["id"], json={"name": "Bo Example", "is_primary": True}).json()
    r = _patch(client, lead, kind="referrer").json()
    assert r["person"]["contact_id"] == bo["id"]
    assert [c["name"] for c in _contacts(client, lead)] == ["Bo Example"]


def test_becoming_a_referrer_without_a_primary_adds_one(client):
    lead = _new(client, "Rita Example")
    client.post("/api/orgs/%d/contacts" % lead["id"], json={"name": "Bo"})
    r = _patch(client, lead, kind="referrer").json()
    people = _contacts(client, lead)
    assert [(c["name"], c["is_primary"]) for c in people] == [("Rita Example", True), ("Bo", False)]
    assert r["person"]["contact_id"] == people[0]["id"]


def test_leaving_referrer_keeps_the_contact(client):
    ref = _new(client, "Rita Example", kind="referrer")
    r = _patch(client, ref, kind="lead").json()
    assert r["person"] is None
    assert [c["name"] for c in _contacts(client, ref)] == ["Rita Example"]


def test_referrer_keeps_one_primary(client):
    ref = _new(client, "Rita Example", kind="referrer")
    own = client.get("/api/contacts/%d" % ref["person"]["contact_id"]).json()
    r = client.patch("/api/contacts/%d" % own["id"], json={"updated_at": own["updated_at"], "is_primary": False})
    assert r.status_code == 422
    assert client.delete("/api/contacts/%d" % own["id"]).status_code == 422
    other = client.post("/api/orgs/%d/contacts" % ref["id"], json={"name": "Assistant", "is_primary": True}).json()
    assert _get(client, ref)["person"]["contact_id"] == other["id"]
    assert client.delete("/api/contacts/%d" % own["id"]).status_code == 204  # no longer the primary


def test_list_carries_person(client):
    ref = _new(client, "Rita Example", kind="referrer", person={"phone": "9"})
    listed = {o["id"]: o for o in client.get("/api/orgs").json()}
    assert listed[ref["id"]]["person"] == ref["person"]


def test_deleting_a_referrer_deletes_its_contact(client):
    ref = _new(client, "Rita Example", kind="referrer")
    assert client.delete("/api/orgs/%d" % ref["id"]).status_code == 204
    assert client.get("/api/contacts/%d" % ref["person"]["contact_id"]).status_code == 404


# Renaming renames the referrer's own contact only


def test_renaming_a_referrer_leaves_another_primary_alone(client):
    ref = _new(client, "Rita Example", kind="referrer")
    own = ref["person"]["contact_id"]
    other = client.post("/api/orgs/%d/contacts" % ref["id"], json={"name": "Bo Example", "is_primary": True}).json()
    assert _get(client, ref)["person"]["contact_id"] == other["id"]  # Bo took over as primary
    _patch(client, _get(client, ref), name="Rita B. Example")
    names = {c["id"]: c["name"] for c in _contacts(client, ref)}
    assert names == {own: "Rita B. Example", other["id"]: "Bo Example"}


def test_a_referrer_made_from_a_lead_renames_the_primary_it_started_with(client):
    lead = _new(client, "Wrongly Filed Co")
    bo = client.post("/api/orgs/%d/contacts" % lead["id"], json={"name": "Bo Example", "is_primary": True}).json()
    client.post("/api/orgs/%d/contacts" % lead["id"], json={"name": "Cy Example"})
    ref = _patch(client, lead, kind="referrer").json()
    assert ref["person"]["contact_id"] == bo["id"]
    _patch(client, ref, name="Bo Example Jr")
    assert sorted(c["name"] for c in _contacts(client, ref)) == ["Bo Example Jr", "Cy Example"]


def test_the_record_does_not_show_the_tracking_column(client):
    ref = _new(client, "Rita Example", kind="referrer")
    assert "person_contact_id" not in ref and "person_contact_id" not in _get(client, ref)


def test_leaving_and_rejoining_referrer_adopts_the_primary_again(client):
    ref = _new(client, "Rita Example", kind="referrer")
    lead = _patch(client, ref, kind="lead").json()
    bo = client.post("/api/orgs/%d/contacts" % lead["id"], json={"name": "Bo Example", "is_primary": True}).json()
    back = _patch(client, lead, kind="referrer").json()
    assert back["person"]["contact_id"] == bo["id"]


def test_migration_008_points_referrers_at_their_primary_and_clears_their_sector(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    _upto(tmp_path, monkeypatch, 7)
    migrate(conn, path)
    for slug, kind, sector in (("r", "referrer", "consulting"), ("l", "lead", "consulting")):
        conn.execute("INSERT INTO organisations(slug,name,kind,status,sector,created_at,updated_at,updated_by)"
                     " VALUES (?,?,?,?,?,'t','t','u')", (slug, slug.upper(), kind, "identified", sector))
    conn.execute("INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by) VALUES (1,'Rita',0,'t','t','u')")
    conn.execute("INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by) VALUES (1,'Rita P',1,'t','t','u')")
    monkeypatch.setattr("binder.db.MIGRATIONS", REAL_MIGRATIONS)
    migrate(conn, path)
    rows = {r["slug"]: (r["person_contact_id"], r["sector"]) for r in conn.execute("SELECT * FROM organisations")}
    assert rows == {"r": (2, None), "l": (None, "consulting")}


# Handled by: not sent is the creator, null is nobody


def test_owner_not_sent_defaults_to_the_creator_when_on_the_list(client):
    me = client.get("/api/whoami").json()["email"]
    assert _new(client, "A")["owner_email"] == me


def test_owner_null_is_nobody(client):
    assert _new(client, "A", owner_email=None)["owner_email"] is None


def test_owner_null_stays_nobody_on_the_list_too(client):
    me = client.get("/api/whoami").json()["email"]
    assert _new(client, "A", owner_email=me)["owner_email"] == me
    assert _new(client, "B", owner_email=None)["owner_email"] is None
    assert client.get("/api/orgs?owner=%s" % me).json()[0]["name"] == "A"


# An empty person is nothing


def test_empty_person_on_a_non_referrer_is_ignored(client):
    lead = _new(client, "Acme", person={})
    assert lead["person"] is None and _contacts(client, lead) == []
    r = _patch(client, lead, person={}, summary="x")
    assert r.status_code == 200 and r.json()["summary"] == "x"


def test_a_person_with_content_on_a_non_referrer_is_still_refused(client):
    assert client.post("/api/orgs", json={"name": "B", "person": {"phone": "1"}}).status_code == 422
