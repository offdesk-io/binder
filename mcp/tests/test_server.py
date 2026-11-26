"""Every tool against an in-process Binder, through an in-process MCP client."""

import json

import pytest
from mcp import Client

from conftest import meta, token

pytestmark = pytest.mark.anyio

READS = {"find", "org", "pipeline", "people", "ref"}
WRITES = {"log", "next_step", "move"}


@pytest.fixture
def acme(direct):
    org = direct.post("/api/orgs", json={"name": "Acme Studio", "value_estimate": 12000, "location": "Porto",
                                         "next_step": "Send the deck", "next_step_due": "2026-12-01"}).json()
    bo = direct.post("/api/orgs/%d/contacts" % org["id"], json={
        "name": "Bo Example", "role": "Founder", "email": "bo@example.com", "is_primary": True,
        "connector": True}).json()
    for n in range(7):
        direct.post("/api/orgs/%d/interactions" % org["id"], json={
            "type": "call", "summary": "Call number %d" % n, "happened_at": "2026-11-%02dT10:00:00Z" % (n + 1),
            "contact_ids": [bo["id"]]})
    org = direct.get("/api/orgs/%d" % org["id"]).json()
    return {"org": org, "bo": bo}


async def call(server, name, args, sub="ana@example.com", **kw):
    async with Client(server) as c:
        return await c.call_tool(name, args, meta=meta(sub, **kw) if sub else None)


def text(result):
    return "\n".join(c.text for c in result.content)


async def test_the_tools_and_their_annotations(server):
    async with Client(server) as c:
        tools = {t.name: t for t in (await c.list_tools()).tools}
    assert set(tools) == READS | WRITES
    for name in READS:
        assert tools[name].annotations.read_only_hint is True
    for name in WRITES:
        a = tools[name].annotations
        assert a.read_only_hint is False and a.destructive_hint is False
    for t in tools.values():
        assert t.description and t.input_schema["type"] == "object"
    assert "updated_at" in tools["move"].input_schema["required"]
    assert "updated_at" in tools["next_step"].input_schema["required"]


async def test_the_token_is_passed_through_with_x_binder(server, seen, acme):
    tok = token("rui@example.com")
    async with Client(server) as c:
        r = await c.call_tool("org", {"slug": "acme-studio"}, meta={"offdesk/token": tok})
    assert not r.is_error
    assert seen and all(req.headers["authorization"] == "Bearer " + tok for req in seen)
    assert all(req.headers["x-binder"] == "1" for req in seen)


async def test_no_token_is_refused_before_binder_is_called(server, seen, acme):
    r = await call(server, "find", {"query": "acme"}, sub=None)
    assert r.is_error and "token" in text(r)
    assert seen == []


async def test_a_token_binder_refuses_comes_back_as_an_error(server, acme):
    r = await call(server, "find", {"query": "acme"}, key=b"x" * 32)
    assert r.is_error and "Binder refused" in text(r) and "signature" in text(r)


async def test_find(server, acme):
    r = await call(server, "find", {"query": "Bo"})
    out = text(r)
    assert not r.is_error
    assert "Acme Studio (acme-studio)" in out and "lead" in out
    assert "Bo Example" in out
    nothing = await call(server, "find", {"query": "zzzz"})
    assert "Nothing" in text(nothing)


async def test_org_shows_the_record_contacts_and_last_five(server, acme):
    out = text(await call(server, "org", {"slug": "acme-studio"}))
    assert "Acme Studio (acme-studio)" in out
    assert "Stage: lead" in out
    assert "Send the deck" in out and "2026-12-01" in out
    assert acme["org"]["updated_at"] in out
    assert "#%d Bo Example" % acme["bo"]["id"] in out and "key person" in out and "bo@example.com" in out
    assert "Call number 6" in out and "Call number 2" in out and "Call number 1" not in out
    assert "5 of 7" in out
    assert '"id"' not in out   # plain text, not Binder's JSON


async def test_org_unknown(server):
    r = await call(server, "org", {"slug": "nope"})
    assert r.is_error and "nope" in text(r)


async def test_ref_resolves_an_organisation_for_the_core(server, acme, monkeypatch):
    monkeypatch.setenv("BINDER_WEB_URL", "https://binder.example.com/")
    r = await call(server, "ref", {"kind": "org", "id": "acme-studio"})
    assert not r.is_error, text(r)
    got = json.loads(text(r))
    assert got == {"title": "Acme Studio", "url": "https://binder.example.com/o/acme-studio",
                   "summary": "Lead, stage lead; next: Send the deck, due 2026-12-01"}


async def test_ref_of_an_unknown_record_is_missing_not_an_error(server, acme):
    r = await call(server, "ref", {"kind": "org", "id": "nope"})
    assert not r.is_error and json.loads(text(r)) == {"missing": True}


async def test_ref_without_a_web_address_gives_no_link(server, acme, monkeypatch):
    monkeypatch.delenv("BINDER_WEB_URL", raising=False)
    got = json.loads(text(await call(server, "ref", {"kind": "org", "id": "acme-studio"})))
    assert got["title"] == "Acme Studio" and got["url"] == ""


async def test_ref_knows_only_organisations(server, acme):
    r = await call(server, "ref", {"kind": "person", "id": "bo"})
    assert r.is_error and "kind" in text(r)


async def test_pipeline(server, direct, acme):
    other = direct.post("/api/orgs", json={"name": "Beta Lda"}).json()
    direct.patch("/api/orgs/%d" % other["id"], json={"updated_at": other["updated_at"], "status": "proposal_sent"})
    out = text(await call(server, "pipeline", {}))
    assert out.index("lead (1)") < out.index("proposal_sent (1)")
    assert "Acme Studio (acme-studio)" in out and "Beta Lda (beta-lda)" in out
    clients = text(await call(server, "pipeline", {"kind": "client"}))
    assert "No client" in clients


async def test_people(server, acme):
    out = text(await call(server, "people", {}))
    assert "Bo Example" in out and "Founder" in out and "Acme Studio (acme-studio)" in out
    assert "No key people match" in text(await call(server, "people", {"query": "zzzz"}))


async def test_log_records_who_through_the_token(server, direct, acme):
    r = await call(server, "log", {"slug": "acme-studio", "type": "meeting", "summary": "Met at their office",
                                   "contact_ids": [acme["bo"]["id"]], "next_step": "Price it",
                                   "next_step_due": "2026-12-05"}, sub="rui@example.com")
    assert not r.is_error, text(r)
    assert "Logged a meeting on Acme Studio" in text(r)
    [latest] = [i for i in direct.get("/api/orgs/%d/interactions" % acme["org"]["id"]).json()
                if i["summary"] == "Met at their office"]
    assert latest["author_email"] == "rui@example.com" and latest["contact_ids"] == [acme["bo"]["id"]]


async def test_an_agent_is_recorded_as_the_agent(server, direct, acme):
    r = await call(server, "log", {"slug": "acme-studio", "type": "note", "summary": "Seen in the news"},
                   sub="agent:digest", agent="digest")
    assert not r.is_error, text(r)
    notes = [i for i in direct.get("/api/orgs/%d/interactions" % acme["org"]["id"]).json() if i["type"] == "note"]
    assert notes[0]["author_email"] == "agent:digest"


async def test_log_refuses_a_bad_type(server, acme):
    r = await call(server, "log", {"slug": "acme-studio", "type": "fax", "summary": "x"})
    assert r.is_error and "type" in text(r)


async def test_next_step(server, direct, acme):
    r = await call(server, "next_step", {"slug": "acme-studio", "next_step": "Call Bo",
                                         "due": "2026-12-10", "updated_at": acme["org"]["updated_at"]})
    assert not r.is_error, text(r)
    now = direct.get("/api/orgs/%d" % acme["org"]["id"]).json()
    assert (now["next_step"], now["next_step_due"], now["updated_by"]) == ("Call Bo", "2026-12-10", "ana@example.com")
    assert now["updated_at"] in text(r)


async def test_a_stale_write_says_read_it_again(server, acme):
    r = await call(server, "move", {"slug": "acme-studio", "status": "contacted", "updated_at": "2020-01-01"})
    assert r.is_error
    assert "changed since you read it; read it again" in text(r)


async def test_move_and_won(server, direct, acme):
    r = await call(server, "move", {"slug": "acme-studio", "status": "contacted",
                                    "updated_at": acme["org"]["updated_at"]})
    assert not r.is_error and "from lead to contacted" in text(r)
    now = direct.get("/api/orgs/%d" % acme["org"]["id"]).json()
    r = await call(server, "move", {"slug": "acme-studio", "status": "won", "updated_at": now["updated_at"]})
    assert "won" in text(r) and "active client" in text(r)
    bad = await call(server, "move", {"slug": "acme-studio", "status": "maybe",
                                      "updated_at": direct.get("/api/orgs/%d" % acme["org"]["id"]).json()["updated_at"]})
    assert bad.is_error and "maybe" in text(bad)


async def test_unknown_tool_and_bad_arguments(server, acme):
    r = await call(server, "delete", {"slug": "acme-studio"})
    assert r.is_error
    r = await call(server, "org", {})
    assert r.is_error and "slug" in text(r)


async def test_binder_down_is_a_plain_error(acme):
    import httpx
    from binder_mcp.server import make_server

    def refuse(request):
        raise httpx.ConnectError("refused")

    srv = make_server(httpx.AsyncClient(transport=httpx.MockTransport(refuse), base_url="http://binder"))
    r = await call(srv, "find", {"query": "acme"})
    assert r.is_error and "Binder did not answer" in text(r)
    assert "Bearer" not in text(r)


def mock_server(handler):
    import httpx
    from binder_mcp.server import make_server
    return make_server(httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://binder"))


@pytest.mark.parametrize("status, body, ctype", [
    (500, b"[1, 2]", "application/json"),                                   # an error body that is not an object
    (422, b'{"detail": [{"loc": ["q"], "msg": "bad"}]}', "application/json"),  # a detail that is a list
    (502, b"<html>Bad gateway</html>", "text/html"),                         # not JSON at all
    (200, b"<html>not json</html>", "text/html"),                            # a 2xx that is not JSON
    (200, b'{"unexpected": true}', "application/json"),                      # JSON of the wrong shape
])
async def test_an_unexpected_reply_is_a_short_plain_error(status, body, ctype):
    import httpx
    srv = mock_server(lambda req: httpx.Response(status, content=body, headers={"content-type": ctype}))
    r = await call(srv, "find", {"query": "acme"})
    out = text(r)
    assert r.is_error
    assert len(out) < 200 and "Traceback" not in out and "Error(" not in out and "<html>" not in out


@pytest.mark.parametrize("name, args, word", [
    ("find", {"query": 5}, "query"),
    ("find", {"query": "x", "kind": "planet"}, "kind"),
    ("org", {"slug": ["a"]}, "slug"),
    ("log", {"slug": "acme-studio", "type": "call", "summary": "x", "contact_ids": ["one"]}, "contact_ids"),
    ("log", {"slug": "acme-studio", "type": "call", "summary": "x", "contact_ids": 3}, "contact_ids"),
    ("next_step", {"slug": "acme-studio", "next_step": 7, "updated_at": "x"}, "next_step"),
    ("next_step", {"slug": "acme-studio", "next_step": "x", "due": "tomorrow", "updated_at": "x"}, "due"),
    ("move", {"slug": "acme-studio", "status": None, "updated_at": "x"}, "status"),
])
async def test_arguments_of_the_wrong_type_are_refused_before_binder(server, seen, name, args, word):
    r = await call(server, name, args)
    assert r.is_error and word in text(r)
    assert seen == []


async def test_org_lists_at_most_fifty_contacts_and_says_how_many_more(server, direct, acme):
    for n in range(55):
        direct.post("/api/orgs/%d/contacts" % acme["org"]["id"], json={"name": "Person %02d" % n})
    out = text(await call(server, "org", {"slug": "acme-studio"}))
    shown = out.split("Contacts:\n")[1].split("Last interactions")[0]
    assert shown.count("- #") == 50
    assert "and 6 more contacts" in out
