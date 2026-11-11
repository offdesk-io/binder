def test_search_finds_each_kind(client, org):
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "summary": "Ceramics brand in Porto"})
    client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui Costa", "role": "Founder"})
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "call", "summary": "Talked about the Lisbon pop-up"})

    hits = client.get("/api/search?q=porto").json()
    assert [(h["kind"], h["org_name"]) for h in hits] == [("org", "Acme Studio")]
    assert "[Porto]" in hits[0]["snippet"]

    assert client.get("/api/search?q=founder").json()[0]["kind"] == "contact"
    assert client.get("/api/search?q=lisb").json()[0]["kind"] == "interaction"  # prefix match


def test_search_ignores_accents_and_quotes(client):
    client.post("/api/orgs", json={"name": "Café Açores"})
    assert len(client.get("/api/search?q=acores").json()) == 1
    assert client.get('/api/search?q="').json() == []


def test_search_follows_edits_and_deletes(client, org):
    o = client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "name": "Zebra Co"}).json()
    assert client.get("/api/search?q=acme").json() == []
    assert len(client.get("/api/search?q=zebra").json()) == 1
    client.delete("/api/orgs/%d" % o["id"])
    assert client.get("/api/search?q=zebra").json() == []


def test_empty_query(client):
    assert client.get("/api/search?q=").json() == []


def test_search_ids_are_integers(client, org):
    hit = client.get("/api/search?q=acme").json()[0]
    assert hit["ref_id"] == org["id"] and hit["org_id"] == org["id"]
