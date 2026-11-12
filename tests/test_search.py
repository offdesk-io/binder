def test_search_finds_each_kind(client, org):
    client.patch("/api/orgs/%d" % org["id"], json={"updated_at": org["updated_at"], "summary": "Ceramics brand in Porto"})
    client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Rui Costa", "role": "Founder"})
    client.post("/api/orgs/%d/interactions" % org["id"], json={"type": "call", "summary": "Talked about the Lisbon pop-up"})

    hits = client.get("/api/search?q=porto").json()
    assert [(h["kind"], h["org_name"]) for h in hits] == [("org", "Acme Studio")]
    assert "\x02Porto\x03" in hits[0]["snippet"]

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
    assert hit["id"] == org["id"] and "ref_id" not in hit and hit["org_id"] == org["id"]


def test_search_survives_control_characters(client, org):
    assert client.get("/api/search", params={"q": "\x00"}).json() == []
    assert client.get("/api/search", params={"q": "a\x00b"}).status_code == 200
    assert [h["kind"] for h in client.get("/api/search", params={"q": "ac\x00me"}).json()] == ["org"]


def test_search_query_is_capped_at_200_chars(client, org):
    assert client.get("/api/search", params={"q": "x" * 5000}).status_code == 200
    # the cap cuts the query, it does not reject it: words past 200 characters are ignored
    assert len(client.get("/api/search", params={"q": "acme" + " " * 300 + "zzz"}).json()) == 1


def test_interaction_title_is_type_and_date_only(client, org):
    client.post("/api/orgs/%d/interactions" % org["id"],
                json={"type": "call", "summary": "Pricing", "happened_at": "2026-11-01T10:00:00+00:00"})
    assert client.get("/api/search", params={"q": "000000"}).json() == []
    hit = client.get("/api/search", params={"q": "pricing"}).json()[0]
    assert hit["title"] == "call 2026-11-01"


def test_research_hits_say_whose_brief_they_are(ai_client, org):
    bo = ai_client.post("/api/orgs/%d/contacts" % org["id"], json={"name": "Bo"}).json()
    ai_client.post("/api/orgs/%d/research" % org["id"])
    ai_client.post("/api/contacts/%d/research" % bo["id"])
    hits = [h for h in ai_client.get("/api/search?q=fake").json() if h["kind"] == "research"]
    assert sorted((h["title"], h["contact_id"]) for h in hits) == [
        ("Research brief", None), ("Research brief: Bo", bo["id"])]


def test_other_hits_have_no_contact_id(client, org):
    hits = client.get("/api/search?q=acme").json()
    assert hits and all(h["contact_id"] is None for h in hits)
