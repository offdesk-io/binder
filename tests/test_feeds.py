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


def connector(client, name="Marta"):
    return client.post("/api/contacts", json={"name": name, "connector": True}).json()


def test_a_connector_goes_quiet_after_90_days_without_a_log(client):
    conn = db(client)
    m = connector(client)
    client.post("/api/contacts", json={"name": "Not a connector"})
    conn.execute("UPDATE contacts SET created_at = ?", (OLD,))
    log = client.post("/api/contacts/%d/interactions" % m["id"],
                      json={"type": "call", "summary": "x", "happened_at": "2026-08-14T09:00:00+00:00"}).json()
    # 90 days before 2026-11-11 is 2026-08-13: a log 89 days ago keeps them in touch, one 91 days ago does not.
    assert [i for i in feeds.attention(conn, today="2026-11-11") if "contact" in i] == []
    client.patch("/api/interactions/%d" % log["id"],
                 json={"updated_at": log["updated_at"], "happened_at": "2026-08-12T09:00:00+00:00"})
    items = [i for i in feeds.attention(conn, today="2026-11-11") if "contact" in i]
    assert [(i["contact"]["name"], i["reasons"]) for i in items] == [("Marta", ["quiet_connector"])]


def test_a_connector_never_logged_is_quiet_from_when_they_were_added(client):
    conn = db(client)
    m = connector(client)
    assert feeds.attention(conn, today="2026-11-11") == []  # just added
    conn.execute("UPDATE contacts SET created_at = ? WHERE id = ?", (OLD, m["id"]))
    assert [i["contact"]["id"] for i in feeds.attention(conn, today="2026-11-11")] == [m["id"]]


def test_organisations_come_before_people(client, org):
    conn = db(client)
    conn.execute("UPDATE organisations SET next_step_due = '2026-01-05' WHERE id = ?", (org["id"],))
    m = connector(client)
    conn.execute("UPDATE contacts SET created_at = ? WHERE id = ?", (OLD, m["id"]))
    items = feeds.attention(conn, today="2026-11-11")
    assert ["org" in items[0], "contact" in items[1]] == [True, True]


def test_the_route_returns_people_items(client):
    m = connector(client)
    db(client).execute("UPDATE contacts SET created_at = ? WHERE id = ?", (OLD, m["id"]))
    items = client.get("/api/attention").json()
    assert [(i["contact"]["id"], i["reasons"]) for i in items] == [(m["id"], ["quiet_connector"])]
