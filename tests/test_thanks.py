"""Year-end thanks: one row per person and year, saying what was sent and when."""

import datetime
import sqlite3
import zoneinfo

import pytest

from binder.db import connect

YEAR = 2026


def connector(client, name, **kw):
    r = client.post("/api/contacts", json=dict(kw, name=name, connector=True))
    assert r.status_code == 201, r.text
    return r.json()


def put(client, c, year=YEAR, **body):
    return client.put("/api/thanks/%d/%d" % (c["id"], year), json=body)


def test_a_year_lists_every_connector_with_their_row_or_none(client, org):
    marta = connector(client, "Marta", postal_address="1 Example Street")
    connector(client, "Bea")
    client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Not a connector"})
    put(client, marta, what="Port wine")
    got = client.get("/api/thanks?year=2026").json()
    assert [(r["contact"]["name"], r["thanks"] and r["thanks"]["what"]) for r in got] == [
        ("Bea", None), ("Marta", "Port wine")]
    assert got[1]["contact"]["postal_address"] == "1 Example Street"
    assert client.get("/api/thanks?year=2025").json()[1]["thanks"] is None


def test_put_creates_the_row_then_changes_only_what_it_is_given(client):
    m = connector(client, "Marta")
    r = put(client, m, what="Port wine")
    assert r.status_code == 200, r.text
    first = r.json()
    assert (first["contact_id"], first["year"], first["what"], first["sent_on"], first["note"],
            first["updated_by"]) == (m["id"], 2026, "Port wine", None, None, "ana@example.com")
    second = put(client, m, updated_at=first["updated_at"], sent_on="2026-12-15").json()
    assert (second["what"], second["sent_on"]) == ("Port wine", "2026-12-15")
    third = put(client, m, updated_at=second["updated_at"], sent_on=None).json()
    assert third["sent_on"] is None


def test_one_row_per_person_and_year(client):
    m = connector(client, "Marta")
    put(client, m, what="Wine")
    assert put(client, m, what="Cheese").status_code == 409  # a second create is a stale save
    assert put(client, m, year=2025, what="Cheese").status_code == 200
    conn = connect(client.app.state.settings.db_path)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO thanks(contact_id, year, created_at, updated_at, updated_by)"
                     " VALUES (?, 2026, 't', 't', 'u')", (m["id"],))


def test_a_stale_save_is_409_with_the_row_as_it_is_now(client):
    m = connector(client, "Marta")
    first = put(client, m, what="Wine").json()
    put(client, m, updated_at=first["updated_at"], what="Cheese")
    r = put(client, m, updated_at=first["updated_at"], note="late")
    assert r.status_code == 409
    assert r.json()["current"]["what"] == "Cheese"


def test_delete_removes_the_row(client):
    m = connector(client, "Marta")
    put(client, m, what="Wine")
    assert client.delete("/api/thanks/%d/2026" % m["id"]).status_code == 204
    assert client.delete("/api/thanks/%d/2026" % m["id"]).status_code == 404
    assert client.get("/api/thanks?year=2026").json()[0]["thanks"] is None


def test_bad_input_is_refused(client):
    m = connector(client, "Marta")
    assert put(client, m, sent_on="soon").status_code == 422
    assert put(client, m, year=1999, what="x").status_code == 422
    assert put(client, {"id": 999}, what="x").status_code == 404
    assert client.get("/api/thanks?year=3000").status_code == 422


def test_deleting_the_person_removes_their_thanks(client):
    m = connector(client, "Marta")
    put(client, m, what="Wine")
    client.delete("/api/contacts/%d" % m["id"])
    conn = connect(client.app.state.settings.db_path)
    assert conn.execute("SELECT count(*) FROM thanks").fetchone()[0] == 0


def test_the_year_defaults_to_this_one(client):
    this = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Lisbon")).year
    m = connector(client, "Marta")
    put(client, m, year=this, what="Wine")
    assert client.get("/api/thanks").json()[0]["thanks"]["year"] == this


def test_writes_need_the_header(make_client):
    from tests.conftest import TEAM
    assert make_client().put("/api/thanks/1/2026", json={}, headers=TEAM).status_code == 403


def test_only_key_connectors_are_on_the_thanks_list(client):
    r = client.post("/api/contacts", json={"name": "Not a connector"})
    c = r.json()
    r = put(client, c, what="Wine")
    assert r.status_code == 422
    assert "key connectors" in r.text
    assert client.get("/api/thanks?year=2026").json() == []


def test_a_note_is_capped(client):
    m = connector(client, "Marta")
    assert put(client, m, note="x" * 2001).status_code == 422
    assert put(client, m, note="x" * 2000).status_code == 200
