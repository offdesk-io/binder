"""Year-end thanks: one row per key person and year, saying what was sent and when."""

import datetime
import sqlite3
import zoneinfo

import pytest

from binder.db import connect
from tests.conftest import TEAM

YEAR = 2026


def key(client, org, name, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=dict(kw, name=name, connector=True))
    assert r.status_code == 201, r.text
    return r.json()


def put(client, c, year=YEAR, **body):
    return client.put("/api/thanks/%d/%d" % (c["id"], year), json=body)


def year(client, y=YEAR):
    r = client.get("/api/thanks", params={"year": y})
    assert r.status_code == 200, r.text
    return r.json()


def test_a_year_lists_every_key_person_with_their_row_or_none(client, org):
    marta = key(client, org, "Marta", postal_address="1 Example Street")
    key(client, org, "Bea")
    client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Not key"})
    ref = client.post("/api/orgs", json={"name": "Rita Example", "kind": "referrer"}).json()
    put(client, marta, what="Port wine")
    got = year(client)
    assert [(r["person"]["name"], r["thanks"] and r["thanks"]["what"]) for r in got] == [
        ("Bea", None), ("Marta", "Port wine"), ("Rita Example", None)]
    assert got[1]["person"]["postal_address"] == "1 Example Street"
    assert got[2]["person"]["referrer"]["id"] == ref["id"]
    assert year(client, 2025)[1]["thanks"] is None


def test_put_creates_the_row_then_changes_only_what_it_is_given(client, org):
    m = key(client, org, "Marta")
    r = put(client, m, what="Port wine", updated_at=None)
    assert r.status_code == 200, r.text
    first = r.json()
    assert (first["contact_id"], first["year"], first["what"], first["sent_on"], first["note"],
            first["updated_by"]) == (m["id"], 2026, "Port wine", None, None, "ana@example.com")
    second = put(client, m, updated_at=first["updated_at"], sent_on="2026-12-15").json()
    assert (second["what"], second["sent_on"]) == ("Port wine", "2026-12-15")
    third = put(client, m, updated_at=second["updated_at"], sent_on=None).json()
    assert third["sent_on"] is None and third["what"] == "Port wine"


def test_one_row_per_person_and_year(client, org):
    m = key(client, org, "Marta")
    put(client, m, what="Wine")
    assert put(client, m, what="Cheese").status_code == 409  # a second create is a stale save
    assert put(client, m, year=2025, what="Cheese").status_code == 200
    conn = connect(client.app.state.settings.db_path)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO thanks(contact_id, year, created_at, updated_at, updated_by)"
                     " VALUES (?, 2026, 't', 't', 'u')", (m["id"],))


def test_a_stale_save_is_409_with_the_row_as_it_is_now(client, org):
    m = key(client, org, "Marta")
    first = put(client, m, what="Wine").json()
    put(client, m, updated_at=first["updated_at"], what="Cheese")
    r = put(client, m, updated_at=first["updated_at"], note="late")
    assert r.status_code == 409
    assert r.json()["current"]["what"] == "Cheese"


def test_a_save_that_expects_a_row_where_there_is_none_is_409_with_null(client, org):
    m = key(client, org, "Marta")
    r = put(client, m, updated_at="2026-01-01T00:00:00.000000+00:00", what="Wine")
    assert r.status_code == 409
    assert r.json()["current"] is None


def test_bad_input_is_refused(client, org):
    m = key(client, org, "Marta")
    assert put(client, m, sent_on="soon").status_code == 422
    assert put(client, m, year=1999, what="x").status_code == 422
    assert put(client, m, color="red").status_code == 422
    assert put(client, {"id": 999}, what="x").status_code == 404
    assert client.get("/api/thanks?year=3000").status_code == 422


def test_what_and_note_are_capped(client, org):
    m = key(client, org, "Marta")
    assert put(client, m, note="x" * 2001).status_code == 422
    assert put(client, m, what="x" * 201).status_code == 422
    assert put(client, m, note="x" * 2000, what="x" * 200).status_code == 200


def test_only_key_people_are_on_the_thanks_list(client, org):
    c = client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Not key"}).json()
    r = put(client, c, what="Wine")
    assert r.status_code == 422
    assert "key people" in r.json()["detail"]
    assert year(client) == []


def test_a_person_who_is_no_longer_key_keeps_their_row_but_leaves_the_list(client, org):
    m = key(client, org, "Marta")
    put(client, m, what="Wine")
    m = client.get("/api/contacts/%d" % m["id"]).json()
    client.patch("/api/contacts/%d" % m["id"], json={"updated_at": m["updated_at"], "connector": False})
    assert year(client) == []
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 1


def test_deleting_the_person_removes_their_thanks(client, org):
    m = key(client, org, "Marta")
    put(client, m, what="Wine")
    assert client.delete("/api/contacts/%d" % m["id"]).status_code == 204
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_deleting_the_organisation_removes_their_thanks(client, org):
    m = key(client, org, "Marta")
    put(client, m, what="Wine")
    assert client.delete("/api/orgs/%d" % org["id"]).status_code == 204
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_the_year_defaults_to_this_one(client, org):
    this = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Lisbon")).year
    m = key(client, org, "Marta")
    put(client, m, year=this, what="Wine")
    assert client.get("/api/thanks").json()[0]["thanks"]["year"] == this


def test_writes_need_the_header(make_client):
    assert make_client().put("/api/thanks/1/2026", json={}, headers=TEAM).status_code == 403
