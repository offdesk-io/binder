"""Partners and referrers: the two kinds that introduce leads and clients."""

import sqlite3

import pytest

from binder.db import MIGRATIONS as REAL_MIGRATIONS, connect, migrate
from binder.errors import Invalid
from binder.repo import feeds
from binder.statuses import check_transition, initial_status


def _new(client, name, **body):
    r = client.post("/api/orgs", json=dict(body, name=name))
    assert r.status_code == 201, r.text
    return r.json()


def _patch(client, o, **body):
    return client.patch("/api/orgs/%d" % o["id"], json=dict(body, updated_at=o["updated_at"]))


def _get(client, o):
    return client.get("/api/orgs/%d" % o["id"]).json()


# Statuses


def test_partner_and_referrer_start_identified():
    assert initial_status("partner") == "identified"
    assert initial_status("referrer") == "identified"


@pytest.mark.parametrize("kind,steps", [("partner", ("paused", "terms_sent", "identified", "contacted", "active", "in_talks")),
                                        ("referrer", ("paused", "identified", "contacted", "active", "in_talks"))])
def test_partner_and_referrer_steps_are_unordered(kind, steps):
    for s in steps:
        assert check_transition(kind, s) == (kind, s)


@pytest.mark.parametrize("kind,status", [("partner", "won"), ("referrer", "lead"),
                                         ("partner", "past"), ("referrer", "past"), ("referrer", "terms_sent"),
                                         ("client", "in_talks"), ("lead", "in_talks"), ("client", "identified")])
def test_statuses_stay_within_their_kind(kind, status):
    with pytest.raises(Invalid):
        check_transition(kind, status)


def test_unknown_kind_is_invalid():
    with pytest.raises(Invalid):
        initial_status("supplier")


def test_create_partner_and_move_its_status(client):
    p = _new(client, "Northwind Agency", kind="partner")
    assert (p["kind"], p["status"]) == ("partner", "identified")
    r = _patch(client, p, status="terms_sent")
    assert r.status_code == 200 and r.json()["status"] == "terms_sent"
    assert _patch(client, r.json(), status="won").status_code == 422
    hist = client.get("/api/orgs/%d/status-history" % p["id"]).json()
    assert [(h["from_status"], h["to_status"]) for h in hist] == [("identified", "terms_sent"), (None, "identified")]


def test_referrer_has_no_terms_sent_step(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    assert ref["status"] == "identified"
    assert _patch(client, ref, status="terms_sent").status_code == 422


def test_unknown_kind_on_create_is_422(client):
    assert client.post("/api/orgs", json={"name": "X", "kind": "supplier"}).status_code == 422


def test_meta_serves_the_new_kinds(client):
    m = client.get("/api/meta").json()
    assert m["kinds"] == ["lead", "client", "partner", "referrer"]
    assert m["partner_statuses"] == ["identified", "contacted", "in_talks", "terms_sent", "active", "paused"]
    assert m["referrer_statuses"] == ["identified", "contacted", "in_talks", "active", "paused"]


def test_list_by_kind(client):
    _new(client, "Lead Co")
    _new(client, "Partner Co", kind="partner")
    _new(client, "Rita Reis", kind="referrer")
    assert [o["name"] for o in client.get("/api/orgs?kind=partner").json()] == ["Partner Co"]
    assert [o["name"] for o in client.get("/api/orgs?kind=referrer").json()] == ["Rita Reis"]
    assert [o["name"] for o in client.get("/api/orgs?kind=lead").json()] == ["Lead Co"]
    assert len(client.get("/api/orgs").json()) == 3


# Introduced by


def test_lead_introduced_by_a_referrer(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    lead = _new(client, "Acme Studio", introduced_by_id=ref["id"])
    assert lead["introduced_by_id"] == ref["id"]
    assert lead["introduced_by"] == {"id": ref["id"], "slug": ref["slug"], "name": "Rita Reis", "kind": "referrer"}
    assert lead["introduced"] == []
    got = _get(client, ref)
    assert got["introduced_by"] is None
    assert got["introduced"] == [{"id": lead["id"], "slug": lead["slug"], "name": "Acme Studio",
                                  "kind": "lead", "status": "lead"}]


def test_introduced_lists_leads_and_clients_by_name(client):
    p = _new(client, "Partner Co", kind="partner")
    _new(client, "zeta", introduced_by_id=p["id"])
    _new(client, "Alpha", kind="client", introduced_by_id=p["id"])
    assert [(x["name"], x["kind"], x["status"]) for x in _get(client, p)["introduced"]] == [
        ("Alpha", "client", "active"), ("zeta", "lead", "lead")]


def test_list_carries_introduced_by_and_introduced(client):
    p = _new(client, "Partner Co", kind="partner")
    lead = _new(client, "Acme", introduced_by_id=p["id"])
    listed = {o["id"]: o for o in client.get("/api/orgs").json()}
    assert listed[lead["id"]] == _get(client, lead)
    assert listed[p["id"]] == _get(client, p)


def test_set_and_clear_introduced_by_on_patch(client):
    p = _new(client, "Partner Co", kind="partner")
    lead = _new(client, "Acme")
    r = _patch(client, lead, introduced_by_id=p["id"])
    assert r.status_code == 200 and r.json()["introduced_by"]["id"] == p["id"]
    r = _patch(client, r.json(), introduced_by_id=None)
    assert r.status_code == 200 and r.json()["introduced_by"] is None


def test_introduced_by_must_be_a_partner_or_referrer(client):
    other = _new(client, "Other Lead")
    client_org = _new(client, "A Client", kind="client")
    lead = _new(client, "Acme")
    for target in (other["id"], client_org["id"], lead["id"], 999):
        r = _patch(client, lead, introduced_by_id=target)
        assert r.status_code == 422, target
        assert isinstance(r.json()["detail"], str)
    assert client.post("/api/orgs", json={"name": "B", "introduced_by_id": other["id"]}).status_code == 422
    assert client.post("/api/orgs", json={"name": "C", "introduced_by_id": 999}).status_code == 422
    assert _get(client, lead)["introduced_by_id"] is None


def test_partner_and_referrer_have_no_introducer(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    assert client.post("/api/orgs", json={"name": "P", "kind": "partner", "introduced_by_id": ref["id"]}).status_code == 422
    p = _new(client, "Partner Co", kind="partner")
    assert _patch(client, p, introduced_by_id=ref["id"]).status_code == 422
    assert _patch(client, ref, introduced_by_id=ref["id"]).status_code == 422


def test_won_keeps_the_introducer(client):
    p = _new(client, "Partner Co", kind="partner")
    lead = _new(client, "Acme", introduced_by_id=p["id"])
    won = _patch(client, lead, status="won").json()
    assert (won["kind"], won["status"]) == ("client", "active")
    assert won["introduced_by"]["id"] == p["id"]


def test_deleting_the_introducer_clears_the_link(client):
    p = _new(client, "Partner Co", kind="partner")
    lead = _new(client, "Acme", introduced_by_id=p["id"])
    assert client.delete("/api/orgs/%d" % p["id"]).status_code == 204
    got = _get(client, lead)
    assert got["introduced_by_id"] is None and got["introduced_by"] is None


# Kind change


def _history(client, o):
    return [(h["from_status"], h["to_status"]) for h in client.get("/api/orgs/%d/status-history" % o["id"]).json()]


def test_lead_becomes_referrer(client):
    lead = _new(client, "Rita Reis")
    lead = _patch(client, lead, status="contacted").json()
    r = _patch(client, lead, kind="referrer")
    assert r.status_code == 200
    assert (r.json()["kind"], r.json()["status"]) == ("referrer", "identified")
    assert _history(client, lead)[0] == ("contacted", "identified")


def test_partner_becomes_lead(client):
    p = _new(client, "Partner Co", kind="partner")
    r = _patch(client, p, kind="lead").json()
    assert (r["kind"], r["status"]) == ("lead", "lead")
    assert _history(client, p)[0] == ("identified", "lead")


def test_client_can_be_refiled_as_a_lead(client):
    c = _new(client, "A Client", kind="client")
    r = _patch(client, c, kind="lead").json()
    assert (r["kind"], r["status"]) == ("lead", "lead")


def test_kind_change_with_a_status_for_the_new_kind(client):
    lead = _new(client, "Partner Co")
    r = _patch(client, lead, kind="partner", status="active").json()
    assert (r["kind"], r["status"]) == ("partner", "active")
    assert _history(client, lead)[0] == ("lead", "active")
    assert _patch(client, _new(client, "B"), kind="partner", status="won").status_code == 422


def test_same_kind_is_no_change(client):
    lead = _new(client, "Acme")
    r = _patch(client, lead, kind="lead").json()
    assert r["status"] == "lead"
    assert _history(client, lead) == [(None, "lead")]


def test_bad_kind_on_patch_is_422(client):
    lead = _new(client, "Acme")
    assert _patch(client, lead, kind="supplier").status_code == 422
    assert _patch(client, lead, kind=None).status_code == 422
    assert _get(client, lead)["kind"] == "lead"


def test_becoming_a_partner_clears_the_introducer(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    lead = _new(client, "Acme", introduced_by_id=ref["id"])
    r = _patch(client, lead, kind="partner").json()
    assert r["introduced_by_id"] is None and r["introduced_by"] is None
    assert _get(client, ref)["introduced"] == []


def test_becoming_a_partner_while_setting_an_introducer_is_422(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    lead = _new(client, "Acme")
    assert _patch(client, lead, kind="partner", introduced_by_id=ref["id"]).status_code == 422
    assert _get(client, lead)["kind"] == "lead"


def test_kind_change_and_introducer_in_one_patch(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    p = _new(client, "Filed Wrong", kind="partner")
    r = _patch(client, p, kind="lead", introduced_by_id=ref["id"])
    assert r.status_code == 200 and r.json()["introduced_by"]["id"] == ref["id"]


def test_referrer_that_becomes_a_lead_stops_introducing(client):
    ref = _new(client, "Rita Reis", kind="referrer")
    lead = _new(client, "Acme", introduced_by_id=ref["id"])
    _patch(client, _get(client, ref), kind="lead")
    got = _get(client, lead)
    assert got["introduced_by"] is None
    assert got["updated_at"] != lead["updated_at"]  # a form holding the old link sees a 409
    assert _patch(client, lead, name="Acme 2").status_code == 409


# Pipeline feeds and search


def _db(client):
    return connect(client.app.state.settings.db_path)


def test_partners_and_referrers_stay_out_of_attention(client):
    _new(client, "Partner Co", kind="partner", next_step_due="2026-01-05")
    _new(client, "Rita Reis", kind="referrer", next_step_due="2026-01-05")
    lead = _new(client, "Acme", next_step_due="2026-01-05")
    items = feeds.attention(_db(client), today="2026-11-11")
    assert [i["org"]["id"] for i in items] == [lead["id"]]


def test_partners_and_referrers_stay_out_of_activity(client):
    p = _new(client, "Partner Co", kind="partner")
    client.post("/api/orgs/%d/interactions" % p["id"], json={"type": "call", "summary": "Agreement terms"})
    _patch(client, p, status="active")
    lead = _new(client, "Acme")
    assert {a["org_id"] for a in client.get("/api/activity").json()} == {lead["id"]}


def test_pipeline_list_is_leads_only(client):
    _new(client, "Partner Co", kind="partner")
    _new(client, "Acme")
    assert [o["kind"] for o in client.get("/api/orgs?kind=lead").json()] == ["lead"]


def test_search_finds_partners_with_their_kind(client):
    p = _new(client, "Northwind Partners", kind="partner")
    client.post("/api/orgs/%d/contacts" % p["id"], json={"name": "Bo Northwind"})
    ref = _new(client, "Rita Reis", kind="referrer")
    _new(client, "Acme")
    hits = client.get("/api/search?q=northwind").json()
    assert sorted((h["kind"], h["org_kind"]) for h in hits) == [("contact", "partner"), ("org", "partner")]
    assert client.get("/api/search?q=rita").json()[0]["org_kind"] == "referrer"
    assert client.get("/api/search?q=acme").json()[0]["org_kind"] == "lead"
    _patch(client, ref, kind="lead")
    assert client.get("/api/search?q=rita").json()[0]["org_kind"] == "lead"


# Won clients, for the Pipeline's Won column


def _set_won_at(client, o, at):
    _db(client).execute("UPDATE status_history SET at = ? WHERE org_id = ? AND to_status = 'won'", (at, o["id"]))


def test_won_at_is_null_until_won(client):
    lead = _new(client, "Acme")
    assert lead["won_at"] is None
    assert _new(client, "Straight In", kind="client")["won_at"] is None
    won = _patch(client, lead, status="won").json()
    hist = client.get("/api/orgs/%d/status-history" % lead["id"]).json()
    assert won["won_at"] == hist[0]["at"] and hist[0]["to_status"] == "won"


def test_won_at_is_the_latest_win(client):
    lead = _new(client, "Acme")
    won = _patch(client, lead, status="won").json()
    _set_won_at(client, won, "2026-01-01T00:00:00.000000+00:00")
    back = _patch(client, _get(client, won), kind="lead").json()  # refiled, then won again
    again = _patch(client, back, status="won").json()
    assert again["won_at"] > "2026-01-01T00:00:00.000000+00:00"
    assert again["won_at"] == client.get("/api/orgs/%d/status-history" % lead["id"]).json()[0]["at"]


def test_won_clients_list_newest_won_first(client):
    old = _patch(client, _new(client, "Old Win"), status="won").json()
    new = _patch(client, _new(client, "New Win"), status="won").json()
    _set_won_at(client, old, "2026-01-01T00:00:00.000000+00:00")
    _set_won_at(client, new, "2026-10-01T00:00:00.000000+00:00")
    paused = _patch(client, _get(client, old), status="paused").json()  # still a won client, whatever its status
    _new(client, "Straight In", kind="client")
    _new(client, "Open Lead")
    got = client.get("/api/orgs?kind=client&won=true").json()
    assert [(o["name"], o["won_at"]) for o in got] == [
        ("New Win", "2026-10-01T00:00:00.000000+00:00"), ("Old Win", "2026-01-01T00:00:00.000000+00:00")]
    assert paused["status"] == "paused"
    assert [o["name"] for o in client.get("/api/orgs?kind=client&won=false").json()] == ["Straight In"]
    assert [o["name"] for o in client.get("/api/orgs?kind=client&won=true&sort=name").json()] == ["New Win", "Old Win"]


def test_won_clients_have_no_time_limit(client):
    won = _patch(client, _new(client, "Ancient"), status="won").json()
    _set_won_at(client, won, "2019-03-01T00:00:00.000000+00:00")
    assert [o["name"] for o in client.get("/api/orgs?kind=client&won=true").json()] == ["Ancient"]


def test_a_won_client_refiled_as_a_lead_leaves_the_won_list(client):
    won = _patch(client, _new(client, "Acme"), status="won").json()
    _patch(client, won, kind="lead")
    assert client.get("/api/orgs?kind=client&won=true").json() == []


def test_bad_won_value_is_422(client):
    assert client.get("/api/orgs?won=maybe").status_code == 422


# Migration 006


def _upto(tmp_path, monkeypatch, number):
    mig = tmp_path / ("migs%d" % number)
    mig.mkdir()
    for f in REAL_MIGRATIONS.glob("*.sql"):
        if int(f.name[:3]) <= number:
            (mig / f.name).write_text(f.read_text())
    monkeypatch.setattr("binder.db.MIGRATIONS", mig)


def test_migration_006_keeps_rows_children_and_search(tmp_path, monkeypatch):
    path = str(tmp_path / "l.db")
    conn = connect(path)
    _upto(tmp_path, monkeypatch, 5)
    migrate(conn, path)
    conn.execute("INSERT INTO organisations(slug,name,kind,status,summary,created_at,updated_at,updated_by)"
                 " VALUES ('a','Acme','lead','contacted','Ceramics in Porto','t1','t2','u'),"
                 " ('b','Bolt','client','active',NULL,'t1','t2','u')")
    conn.execute("INSERT INTO contacts(org_id,name,is_primary,created_at,updated_at,updated_by)"
                 " VALUES (1,'Rui',1,'t','t','u')")
    conn.execute("INSERT INTO interactions(org_id,type,happened_at,summary,author_email,created_at,updated_at,updated_by)"
                 " VALUES (1,'call','2026-11-01T10:00:00.000000+00:00','Hello','u','t','t','u')")
    conn.execute("INSERT INTO status_history(org_id,from_status,to_status,at,by_email) VALUES (1,NULL,'lead','t','u')")
    conn.execute("INSERT INTO bench_links(org_id,board,task_key,title,state,fetched_at) VALUES (2,'work','k1','T','Doing','t')")
    before = [tuple(r) for r in conn.execute("SELECT * FROM organisations ORDER BY id")]
    search_before = sorted(tuple(r) for r in conn.execute("SELECT kind, ref_id, org_id, title FROM search"))
    index_names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")}

    _upto(tmp_path, monkeypatch, 6)
    migrate(conn, path)

    assert conn.execute("PRAGMA user_version").fetchone()[0] == 6
    assert [tuple(r)[:-1] for r in conn.execute("SELECT * FROM organisations ORDER BY id")] == before
    assert [r[0] for r in conn.execute("SELECT introduced_by_id FROM organisations")] == [None, None]
    for table in ("contacts", "interactions", "status_history", "bench_links"):
        assert conn.execute("SELECT count(*) FROM %s" % table).fetchone()[0] == 1, table
    assert sorted(tuple(r) for r in conn.execute("SELECT kind, ref_id, org_id, title FROM search")) == search_before
    after_indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")}
    assert index_names | {"organisations_introduced_by"} == after_indexes
    triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='organisations'")}
    assert triggers == {"org_ai", "org_au", "org_ad"}
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1

    # The rebuilt table takes the new kinds, still refuses unknown ones, and its triggers still feed search.
    conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                 " VALUES ('p','Partner Co','partner','identified','t','t','u')")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO organisations(slug,name,kind,status,created_at,updated_at,updated_by)"
                     " VALUES ('s','S','supplier','x','t','t','u')")
    conn.execute("UPDATE organisations SET summary = 'Kilns' WHERE id = 1")
    assert conn.execute("SELECT count(*) FROM search WHERE search MATCH 'kilns'").fetchone()[0] == 1
    assert conn.execute("SELECT count(*) FROM search WHERE search MATCH 'partner'").fetchone()[0] == 1
    # Child rows still cascade, and an introducer's delete sets the link to null.
    conn.execute("UPDATE organisations SET introduced_by_id = 3 WHERE id = 2")
    conn.execute("DELETE FROM organisations WHERE id = 3")
    assert conn.execute("SELECT introduced_by_id FROM organisations WHERE id = 2").fetchone()[0] is None
    conn.execute("DELETE FROM organisations WHERE id = 1")
    assert conn.execute("SELECT count(*) FROM contacts").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM search WHERE org_id = 1").fetchone()[0] == 0
