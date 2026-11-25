from binder.repo import feeds

OLD = "2026-01-01T00:00:00.000000+00:00"


def db(client):
    from binder.db import connect
    return connect(client.app.state.settings.db_path)


def test_attention_reasons(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = ?, next_step_due = '2026-01-05' WHERE id = ?", (OLD, org["id"]))
    conn.execute("UPDATE status_history SET at = ? WHERE org_id = ?", (OLD, org["id"]))
    fresh = client.post("/api/orgs", json={"name": "Fresh"}).json()
    items = feeds.attention(conn, today="2026-11-11")
    assert [(i["org"]["name"], sorted(i["reasons"])) for i in items] == [("Acme Studio", ["overdue", "quiet", "stuck"])]
    assert fresh["id"] not in [i["org"]["id"] for i in items]


def test_recent_interaction_clears_quiet(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = ? WHERE id = ?", (OLD, org["id"]))
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "call", "summary": "x", "happened_at": "2026-11-10T09:00:00+00:00"})
    items = feeds.attention(conn, today="2026-11-11")
    assert all("quiet" not in i["reasons"] for i in items)


def test_closed_leads_and_clients_only_overdue(client):
    c = client.post("/api/orgs", json={"name": "Client", "kind": "client"}).json()
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = ? WHERE id = ?", (OLD, c["id"]))
    conn.execute("UPDATE status_history SET at = ? WHERE org_id = ?", (OLD, c["id"]))
    assert feeds.attention(conn, today="2026-11-11") == []


def test_client_with_overdue_step_is_listed_for_overdue_only(client):
    c = client.post("/api/orgs", json={"name": "Client", "kind": "client", "next_step_due": "2026-11-01"}).json()
    items = feeds.attention(db(client), today="2026-11-11")
    assert [(i["org"]["id"], i["reasons"]) for i in items] == [(c["id"], ["overdue"])]


def test_quiet_boundary_is_by_day(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = '2026-10-28T00:00:00.000000+00:00' WHERE id = ?", (org["id"],))
    # 14 days before 2026-11-11 is 2026-10-28T00:00: exactly on the cutoff is not yet quiet.
    assert feeds.attention(conn, today="2026-11-11") == []
    conn.execute("UPDATE organisations SET created_at = '2026-10-27T23:59:59.000000+00:00' WHERE id = ?", (org["id"],))
    assert [i["reasons"] for i in feeds.attention(conn, today="2026-11-11")] == [["quiet"]]


def test_attention_route(client, org):
    assert client.get("/api/attention").status_code == 200


def test_activity_feed(client, org):
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "note", "summary": "Hello"})
    items = client.get("/api/activity").json()
    assert items[0]["kind"] == "interaction" and items[0]["org_name"] == "Acme Studio"
    assert items[0]["type"] == "note" and items[0]["summary"] == "Hello"
    assert items[1]["kind"] == "status" and items[1]["to_status"] == "lead"


def test_stuck_without_history_rows_falls_back_to_created_at(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET created_at = ? WHERE id = ?", (OLD, org["id"]))
    conn.execute("DELETE FROM status_history WHERE org_id = ?", (org["id"],))
    items = feeds.attention(conn, today="2026-11-11")
    assert sorted(items[0]["reasons"]) == ["quiet", "stuck"]


def test_today_follows_the_configured_zone(client, monkeypatch):
    import datetime
    monkeypatch.setattr(feeds, "_now_utc", lambda: datetime.datetime(2026, 11, 11, 23, 30, tzinfo=datetime.timezone.utc))
    client.post("/api/orgs", json={"name": "Due", "next_step_due": "2026-11-11"})
    conn = db(client)
    assert feeds.attention(conn, tz="Europe/Lisbon") == []
    assert [i["reasons"] for i in feeds.attention(conn, tz="Pacific/Auckland")] == [["overdue"]]  # already the 12th there


# Key people with no log in 90 days


def _key(client, org, name, **kw):
    r = client.post("/api/orgs/%d/contacts" % org["id"], json=dict(kw, name=name, connector=True))
    assert r.status_code == 201, r.text
    return r.json()


def _log(client, org, day, contact_ids=()):
    client.post("/api/orgs/%d/interactions" % org["id"], json={
        "type": "call", "summary": "x", "happened_at": day + "T10:00:00+00:00", "contact_ids": list(contact_ids)})


def _quiet_people(conn, today):
    return [(i["contact"]["name"], i["reasons"]) for i in feeds.attention(conn, today=today) if "contact" in i]


def test_a_key_person_is_quiet_after_90_days_without_a_log(client, org):
    conn = db(client)
    bea = _key(client, org, "Bea")
    _log(client, org, "2026-08-14", [bea["id"]])  # 89 days before 2026-11-11
    assert _quiet_people(conn, "2026-11-11") == []
    conn.execute("UPDATE interactions SET happened_at = '2026-08-12T10:00:00.000000+00:00'")  # 91 days
    assert _quiet_people(conn, "2026-11-11") == [("Bea", ["quiet_connector"])]


def test_a_key_person_never_logged_counts_from_when_they_were_added(client, org):
    conn = db(client)
    bea = _key(client, org, "Bea")
    conn.execute("UPDATE contacts SET created_at = '2026-08-14T10:00:00.000000+00:00' WHERE id = ?", (bea["id"],))
    assert _quiet_people(conn, "2026-11-11") == []
    conn.execute("UPDATE contacts SET created_at = '2026-08-12T10:00:00.000000+00:00' WHERE id = ?", (bea["id"],))
    assert _quiet_people(conn, "2026-11-11") == [("Bea", ["quiet_connector"])]


def test_quiet_key_people_come_after_organisations_a_to_z(client, org):
    conn = db(client)
    for name in ("Zed", "abe"):
        _key(client, org, name)
    conn.execute("UPDATE contacts SET created_at = ?", (OLD,))
    client.post("/api/orgs", json={"name": "Due", "next_step_due": "2026-11-01"})
    items = feeds.attention(conn, today="2026-11-11")
    assert [i["org"]["name"] if "org" in i else i["contact"]["name"] for i in items][-2:] == ["abe", "Zed"]
    assert "org" in items[0]
    assert items[-1]["contact"]["org_slug"] == org["slug"]


def test_a_log_without_them_does_not_count(client, org):
    conn = db(client)
    _key(client, org, "Bea")
    conn.execute("UPDATE contacts SET created_at = ?", (OLD,))
    _log(client, org, "2026-11-10")
    assert _quiet_people(conn, "2026-11-11") == [("Bea", ["quiet_connector"])]


def test_a_referrers_person_is_nudged_only_while_the_referrer_is_active(client):
    conn = db(client)
    ref = client.post("/api/orgs", json={"name": "Rita Example", "kind": "referrer"}).json()
    conn.execute("UPDATE contacts SET created_at = ?", (OLD,))
    assert _quiet_people(conn, "2026-11-11") == []  # identified
    client.patch("/api/orgs/%d" % ref["id"], json={"updated_at": ref["updated_at"], "status": "active"})
    assert _quiet_people(conn, "2026-11-11") == [("Rita Example", ["quiet_connector"])]
    _log(client, ref, "2026-11-01")  # any log on the referrer is with them
    assert _quiet_people(conn, "2026-11-11") == []
    # The referrer itself stays out of the organisation items.
    assert all("org" not in i for i in feeds.attention(conn, today="2026-11-11"))


def test_a_starred_person_at_an_inactive_referrer_still_counts(client):
    conn = db(client)
    ref = client.post("/api/orgs", json={"name": "Rita Example", "kind": "referrer"}).json()
    rita = client.get("/api/contacts/%d" % ref["person"]["contact_id"]).json()
    client.patch("/api/contacts/%d" % rita["id"], json={"updated_at": rita["updated_at"], "connector": True})
    conn.execute("UPDATE contacts SET created_at = ?", (OLD,))
    assert _quiet_people(conn, "2026-11-11") == [("Rita Example", ["quiet_connector"])]


def test_the_attention_route_returns_quiet_people(client, org):
    _key(client, org, "Bea")
    db(client).execute("UPDATE contacts SET created_at = ?", (OLD,))
    items = client.get("/api/attention").json()
    assert [i["contact"]["name"] for i in items if "contact" in i] == ["Bea"]
