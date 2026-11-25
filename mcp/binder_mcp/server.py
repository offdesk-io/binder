"""Binder's tools for the Offdesk core, over MCP on stdio.

Each call carries the core's signed token in its request meta (`offdesk/token`). The token goes to
Binder as `Authorization: Bearer`, so Binder itself decides who is asking and what they may do; a call
without one is refused here before Binder is reached. Every request carries `X-Binder: 1`, which Binder
asks of writes. Answers are short plain text for the model, never Binder's JSON in full; Binder's
errors come back as tool errors with its own message.

BINDER_URL is Binder's address (default http://127.0.0.1:8770, on the same machine as the core)."""

import os
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import quote

import anyio
import httpx
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

DEFAULT_URL = "http://127.0.0.1:8770"
LAST = 5            # interactions shown with an organisation
MAX_TEXT = 300      # characters of a summary shown in a list
MAX_ROWS = 50       # lines in a list

READ = types.ToolAnnotations(read_only_hint=True)
WRITE = types.ToolAnnotations(read_only_hint=False, destructive_hint=False)
KINDS = ["lead", "client", "partner", "referrer"]
TYPES = ["call", "email", "meeting", "note"]
DATE = {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"}
SLUG = {"type": "string", "minLength": 1, "description": "The organisation's slug, as binder.find shows it."}
UPDATED_AT = {"type": "string", "minLength": 1,
              "description": "The record's updated_at, exactly as binder.org showed it."}


class Failed(Exception):
    """A plain sentence for the model."""


def _obj(props: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {"type": "object", "properties": props, "required": required, "additionalProperties": False}


TOOLS = [
    types.Tool(name="find", annotations=READ, input_schema=_obj(
        {"query": {"type": "string", "minLength": 1, "description": "Words to look for."},
         "kind": {"type": "string", "enum": KINDS, "description": "Only organisations of this kind."}}, ["query"]),
        description="Find organisations in Binder by name, or by a contact, a logged interaction or a research "
                    "brief that mentions the words. Gives each one's slug, kind and stage."),
    types.Tool(name="org", annotations=READ, input_schema=_obj({"slug": SLUG}, ["slug"]),
               description="Read one organisation: its record, stage, next step, contacts (with their ids) and "
                           "the last five interactions. Also gives updated_at, which binder.move and "
                           "binder.next_step need."),
    types.Tool(name="pipeline", annotations=READ, input_schema=_obj(
        {"kind": {"type": "string", "enum": KINDS, "description": "Which pipeline (default lead)."}}, []),
        description="The pipeline: every open lead (or the clients, partners or referrers) grouped by stage, "
                    "with each one's next step and when it is due."),
    types.Tool(name="people", annotations=READ, input_schema=_obj(
        {"query": {"type": "string", "description": "Only people whose name, role or organisation matches."}}, []),
        description="The key people: the connectors to thank and keep close, and each referrer's own person, "
                    "with when we last spoke to them."),
    types.Tool(name="log", annotations=WRITE, input_schema=_obj({
        "slug": SLUG,
        "type": {"type": "string", "enum": TYPES},
        "summary": {"type": "string", "minLength": 1, "description": "What happened, in a few sentences."},
        "happened_at": {"type": "string", "description": "When, as an ISO date-time with a time zone; "
                                                         "default now."},
        "next_step": {"type": "string", "description": "The next step this interaction leads to, if any."},
        "next_step_due": DATE,
        "contact_ids": {"type": "array", "items": {"type": "integer"},
                        "description": "The ids (#n in binder.org) of the contacts it was with."}},
        ["slug", "type", "summary"]),
        description="Log an interaction (a call, an email, a meeting or a note) on an organisation."),
    types.Tool(name="next_step", annotations=WRITE, input_schema=_obj({
        "slug": SLUG,
        "next_step": {"type": ["string", "null"], "description": "The next step, or null to clear it."},
        "due": {"anyOf": [DATE, {"type": "null"}], "description": "When it is due (YYYY-MM-DD), or null."},
        "updated_at": UPDATED_AT}, ["slug", "next_step", "updated_at"]),
        description="Set an organisation's next step and when it is due."),
    types.Tool(name="move", annotations=WRITE, input_schema=_obj({
        "slug": SLUG,
        "status": {"type": "string", "description": "The new stage, one of its kind's (binder.pipeline lists "
                                                    "them). For a lead, won makes it an active client."},
        "updated_at": UPDATED_AT}, ["slug", "status", "updated_at"]),
        description="Move an organisation to another stage of its pipeline."),
]
TOOL_NAMES = {t.name for t in TOOLS}


def _cut(text: Optional[str], n: int = MAX_TEXT) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _name(o: Dict[str, Any]) -> str:
    return "%s (%s)" % (o["name"], o["slug"])


def _next(o: Dict[str, Any]) -> str:
    if not o.get("next_step"):
        return "no next step"
    return "next: %s%s" % (_cut(o["next_step"], 120), ", due %s" % o["next_step_due"] if o.get("next_step_due") else "")


class Binder:
    """Binder's HTTP API, called with one call's token."""

    def __init__(self, http: httpx.AsyncClient, token: str):
        self.http, self.token = http, token

    async def request(self, method: str, path: str, **kw) -> Any:
        headers = {"Authorization": "Bearer " + self.token, "X-Binder": "1"}
        try:
            r = await self.http.request(method, path, headers=headers, **kw)
        except httpx.HTTPError:
            raise Failed("Binder did not answer. Try again later.") from None
        if r.status_code < 400:
            return r.json() if r.content else None
        try:
            detail = r.json().get("detail") or ""
        except ValueError:
            detail = ""
        if r.status_code == 409:
            raise Failed("It changed since you read it; read it again with binder.org and use its new updated_at.")
        if r.status_code == 401:
            raise Failed("Binder refused the call: %s" % (detail or "not signed in"))
        raise Failed(detail or "Binder answered %d" % r.status_code)

    async def org(self, slug: str) -> Dict[str, Any]:
        return await self.request("GET", "/api/orgs/by-slug/%s" % quote(slug, safe=""))


async def find(b: Binder, args: Dict[str, Any]) -> str:
    hits = await b.request("GET", "/api/search", params={"q": args["query"][:200]})
    kind = args.get("kind")
    found: Dict[str, Dict[str, Any]] = {}
    for h in hits:
        if kind and h["org_kind"] != kind:
            continue
        o = found.setdefault(h["org_slug"], {"name": h["org_name"], "slug": h["org_slug"], "kind": h["org_kind"],
                                             "status": h["org_status"], "why": []})
        if h["kind"] != "org":
            what = {"contact": "contact", "interaction": "interaction", "research": "research brief"}.get(h["kind"],
                                                                                                         h["kind"])
            line = "%s %s" % (what, _cut(h["title"], 80))
            if line not in o["why"]:
                o["why"].append(line)
    if not found:
        return 'Nothing in Binder matches "%s".' % args["query"]
    lines = ['%d organisation(s) match "%s":' % (len(found), args["query"])]
    for o in list(found.values())[:MAX_ROWS]:
        why = "; matched %s" % ", ".join(o["why"][:3]) if o["why"] else ""
        lines.append("- %s: %s, %s%s" % (_name(o), o["kind"], o["status"], why))
    return "\n".join(lines)


async def org(b: Binder, args: Dict[str, Any]) -> str:
    o = await b.org(args["slug"])
    contacts = await b.request("GET", "/api/orgs/%d/contacts" % o["id"])
    interactions = await b.request("GET", "/api/orgs/%d/interactions" % o["id"])
    lines = [_name(o), "Kind: %s. Stage: %s." % (o["kind"], o["status"])]
    if o.get("owner_email"):
        lines.append("Handled by: %s" % o["owner_email"])
    lines.append("Next step: %s" % (_next(o)[6:] if o.get("next_step") else "none"))
    for label, key in (("Value estimate", "value_estimate"), ("Website", "website"), ("Sector", "sector"),
                       ("Location", "location"), ("Source", "source"), ("Last contact", "last_contact")):
        if o.get(key) not in (None, ""):
            lines.append("%s: %s" % (label, str(o[key])[:10] if key == "last_contact" else o[key]))
    if o.get("tags"):
        lines.append("Tags: %s" % ", ".join(o["tags"]))
    if o.get("introduced_by"):
        i = o["introduced_by"]
        lines.append("Introduced by: %s, a %s" % (_name(i), i["kind"]))
    if o.get("introduced"):
        lines.append("Introduced: %s" % ", ".join(_name(i) for i in o["introduced"][:10]))
    if o.get("description"):
        lines.append("About: %s" % _cut(o["description"]))
    if o.get("summary"):
        lines.append("Summary: %s" % _cut(o["summary"], 600))
    lines.append("updated_at: %s (give it to binder.move or binder.next_step)" % o["updated_at"])
    lines.append("")
    if contacts:
        lines.append("Contacts:")
        for c in contacts:
            bits = [x for x in (c.get("role"), c.get("email"), c.get("phone")) if x]
            if c.get("is_primary"):
                bits.append("primary")
            if c.get("connector") or c.get("is_referrer"):
                bits.append("key person")
            lines.append("- #%d %s%s" % (c["id"], c["name"], ", " + ", ".join(bits) if bits else ""))
    else:
        lines.append("No contacts.")
    if interactions:
        lines.append("Last interactions (%d of %d):" % (min(LAST, len(interactions)), len(interactions)))
        for i in interactions[:LAST]:
            nxt = "; next: %s" % _cut(i["next_step"], 120) if i.get("next_step") else ""
            lines.append("- %s %s by %s: %s%s" % (i["happened_at"][:10], i["type"], i["author_email"],
                                                  _cut(i["summary"]), nxt))
    else:
        lines.append("Nothing logged yet.")
    return "\n".join(lines)


async def pipeline(b: Binder, args: Dict[str, Any]) -> str:
    kind = args.get("kind") or "lead"
    meta = await b.request("GET", "/api/meta")
    stages = meta["open_lead_statuses"] if kind == "lead" else meta["%s_statuses" % kind]
    orgs = await b.request("GET", "/api/orgs", params={"kind": kind})
    if not orgs:
        return "No %s in Binder yet." % kind
    lines = ["The %s pipeline, by stage (in order: %s):" % (kind, ", ".join(stages))]
    others: Dict[str, int] = {}
    for stage in stages:
        here = sorted((o for o in orgs if o["status"] == stage),
                      key=lambda o: (o.get("next_step_due") or "9999", o["name"].lower()))
        if not here:
            continue
        lines.append("%s (%d):" % (stage, len(here)))
        for o in here[:MAX_ROWS]:
            bits = [_next(o)]
            if o.get("owner_email"):
                bits.append("handled by %s" % o["owner_email"])
            if o.get("last_contact"):
                bits.append("last contact %s" % o["last_contact"][:10])
            if o.get("value_estimate") is not None:
                bits.append("value %g" % o["value_estimate"])
            lines.append("- %s: %s" % (_name(o), "; ".join(bits)))
    for o in orgs:
        if o["status"] not in stages:
            others[o["status"]] = others.get(o["status"], 0) + 1
    if others:
        lines.append("Not open: %s." % ", ".join("%d %s" % (n, s) for s, n in sorted(others.items())))
    return "\n".join(lines)


async def people(b: Binder, args: Dict[str, Any]) -> str:
    params = {"q": args["query"][:200]} if args.get("query") else {}
    found = await b.request("GET", "/api/people", params=params)
    if not found:
        return "No key people match." if params else "No key people in Binder yet."
    lines = ["Key people (%d):" % len(found)]
    for p in found[:MAX_ROWS]:
        where = "%s at %s" % (p["role"], _name({"name": p["org_name"], "slug": p["org_slug"]})) if p.get("role") \
            else _name({"name": p["org_name"], "slug": p["org_slug"]})
        bits = [where]
        if p.get("referrer"):
            bits.append("a referrer, who brought in %d" % p.get("introduced_count", 0))
        if p.get("email"):
            bits.append(p["email"])
        bits.append("last contact %s" % (p["last_contact"][:10] if p.get("last_contact") else "never"))
        lines.append("- #%d %s: %s" % (p["id"], p["name"], "; ".join(bits)))
    return "\n".join(lines)


async def log(b: Binder, args: Dict[str, Any]) -> str:
    o = await b.org(args["slug"])
    body = {k: args[k] for k in ("type", "summary", "happened_at", "next_step", "next_step_due", "contact_ids")
            if args.get(k) is not None}
    i = await b.request("POST", "/api/orgs/%d/interactions" % o["id"], json=body)
    return "Logged a %s on %s, %s." % (i["type"], _name(o), i["happened_at"][:10])


async def next_step(b: Binder, args: Dict[str, Any]) -> str:
    o = await b.org(args["slug"])
    body: Dict[str, Any] = {"updated_at": args["updated_at"], "next_step": args.get("next_step")}
    if "due" in args:
        body["next_step_due"] = args["due"]
    o = await b.request("PATCH", "/api/orgs/%d" % o["id"], json=body)
    return "%s: %s. updated_at: %s" % (_name(o), _next(o), o["updated_at"])


async def move(b: Binder, args: Dict[str, Any]) -> str:
    before = await b.org(args["slug"])
    o = await b.request("PATCH", "/api/orgs/%d" % before["id"],
                        json={"updated_at": args["updated_at"], "status": args["status"]})
    if args["status"] == "won":
        said = "%s won: it is now an active client" % _name(o)
    else:
        said = "%s moved from %s to %s" % (_name(o), before["status"], o["status"])
    return "%s. updated_at: %s" % (said, o["updated_at"])


HANDLERS: Dict[str, Callable[[Binder, Dict[str, Any]], Awaitable[str]]] = {
    "find": find, "org": org, "pipeline": pipeline, "people": people,
    "log": log, "next_step": next_step, "move": move,
}


def _check(name: str, args: Dict[str, Any]) -> None:
    tool = next(t for t in TOOLS if t.name == name)
    schema = tool.input_schema
    missing = [k for k in schema["required"] if k not in args]
    if missing:
        raise Failed("Missing %s." % ", ".join(missing))
    extra = [k for k in args if k not in schema["properties"]]
    if extra:
        raise Failed("Unknown argument %s." % ", ".join(extra))


def _result(text: str, error: bool = False) -> types.CallToolResult:
    return types.CallToolResult(content=[types.TextContent(type="text", text=text)], is_error=error)


def make_server(http: httpx.AsyncClient) -> Server:
    async def list_tools(ctx, params) -> types.ListToolsResult:
        return types.ListToolsResult(tools=TOOLS)

    async def call_tool(ctx, params: types.CallToolRequestParams) -> types.CallToolResult:
        name, args = params.name, dict(params.arguments or {})
        if name not in HANDLERS:
            return _result("No tool %r in Binder." % name, error=True)
        token = (ctx.meta or {}).get("offdesk/token")
        if not isinstance(token, str) or not token:
            return _result("No Offdesk token on this call: Binder acts only for the person the core names.",
                           error=True)
        try:
            _check(name, args)
            return _result(await HANDLERS[name](Binder(http, token), args))
        except Failed as e:
            return _result(str(e), error=True)

    return Server("binder", on_list_tools=list_tools, on_call_tool=call_tool)


async def _serve() -> None:
    url = os.environ.get("BINDER_URL", DEFAULT_URL).rstrip("/")
    async with httpx.AsyncClient(base_url=url, timeout=30) as http:
        server = make_server(http)
        async with stdio_server() as (read, write):
            await server.run(read, write, server.create_initialization_options())


def main() -> None:
    anyio.run(_serve)
