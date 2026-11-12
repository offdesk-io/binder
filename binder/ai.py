"""The one place Binder calls the Anthropic API: on the server only, with
ANTHROPIC_API_KEY, so the browser never sees the key. The rest of the app
calls `research()` and `summarise()` on whatever `from_settings()` returns,
which is FakeAI in tests and local development.

Both calls use claude-opus-5-5 with adaptive thinking, stream the answer and
constrain it to a JSON schema. Research also searches and reads the web. If
the model declines, the API retries on another model by itself
(`fallbacks: "default"`); a decline that stands is an AIError."""

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .config import Settings
from .statuses import INTERACTION_TYPES

log = logging.getLogger("binder.ai")

MODEL = "claude-opus-5-5"
BETAS = ["server-side-fallback-2026-07-01"]
MAX_STEPS = 6  # a turn with web tools can pause; resume it this many times at most

# What the research prompt says Offdesk is. Replace it with what Offdesk sells:
# `offdesk_angle` in each brief is written against it.
ABOUT_OFFDESK = (
    "Offdesk is a small studio that takes on client projects. Its team uses Binder "
    "to keep track of the organisations it talks to about work."
)


@dataclass
class Usage:
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    web_searches: int = 0


class AIError(Exception):
    """A call that ended without a usable answer. The message is for people;
    `usage` is what the call used before it ended."""

    def __init__(self, message: str, usage: Optional[Usage] = None):
        super().__init__(message)
        self.usage = usage


@dataclass
class Brief:
    brief: Dict[str, Any]
    sources: List[Dict[str, str]]
    usage: Usage


def _object(props: Dict[str, Any]) -> Dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_TEXT = {"type": "string"}
_TEXTS = {"type": "array", "items": _TEXT}
_TEXT_OR_NULL = {"anyOf": [_TEXT, {"type": "null"}]}

BRIEF_SCHEMA = _object({
    "overview": _TEXT,
    "what_they_do": _TEXT,
    "size_and_funding": _TEXT,
    "people": {"type": "array", "items": _object({
        "name": _TEXT,
        "role": _TEXT,
        "contact_id": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
        "why": _TEXT,
    })},
    "recent_news": {"type": "array", "items": _object({"headline": _TEXT, "date": _TEXT, "url": _TEXT})},
    "likely_needs": _TEXTS,
    "offdesk_angle": _TEXT,
    "open_questions": _TEXTS,
    "sources": {"type": "array", "items": _object({"url": _TEXT, "title": _TEXT})},
})

SUMMARY_SCHEMA = _object({
    "summary": _TEXT,
    "type": {"type": "string", "enum": list(INTERACTION_TYPES)},
    "happened_at": _TEXT_OR_NULL,
    "next_step": _TEXT_OR_NULL,
    "next_step_due": _TEXT_OR_NULL,
    "contact_ids": {"type": "array", "items": {"type": "integer"}},
})

WEB_TOOLS = [
    {"type": "web_search_20260209", "name": "web_search", "max_uses": 10},
    {"type": "web_fetch_20260209", "name": "web_fetch"},
]

RESEARCH_SYSTEM = """You research organisations and people for Offdesk ahead of sales conversations. %s

Search and read the web for current facts that can be checked. Prefer the organisation's own site, reputable news and public filings. When something is unknown, say so in a few words rather than guess. Write in British English, short and factual, with no marketing tone.

Every fact from the web needs its page in `sources`. In `people`, set `contact_id` to the id of a known contact when the person is one of them, and to null for someone worth adding. `offdesk_angle` is how Offdesk could help them, in two or three sentences. If a previous brief is given, update it: keep what still holds, correct what changed and add what is new.""" % ABOUT_OFFDESK

SUMMARY_SYSTEM = """You turn a pasted email, notes or a transcript into one log entry in Offdesk's record of a lead or client.

- `summary`: what happened and what was agreed, in a few plain sentences of British English, with no greeting or sign-off.
- `type`: call, email, meeting or note.
- `happened_at`: when it happened, as ISO 8601 with a time zone, or null if the text does not say.
- `next_step` and `next_step_due` (YYYY-MM-DD): the next action and its date, if the text states or clearly implies them. Otherwise null.
- `contact_ids`: the ids of the known people who took part. Never invent people or dates."""


def research_prompt(subject: Dict[str, Any]) -> str:
    what = "person" if subject.get("person") else "organisation"
    known = json.dumps(subject, indent=1, ensure_ascii=False, sort_keys=True)
    return "Research this %s and write the brief.\n\n<known>\n%s\n</known>" % (what, known)


def summary_prompt(text: str, org_name: str, contacts: Sequence[Dict[str, Any]], now_local: str) -> str:
    people = [{"id": c["id"], "name": c["name"], "role": c.get("role")} for c in contacts]
    return "Now: %s\nOrganisation: %s\nKnown people: %s\n\n<pasted>\n%s\n</pasted>" % (
        now_local, org_name, json.dumps(people, ensure_ascii=False), text)


def _add(usage: Usage, msg: Any) -> None:
    usage.model = msg.model or usage.model
    usage.input_tokens += msg.usage.input_tokens or 0
    usage.output_tokens += msg.usage.output_tokens or 0
    tools = getattr(msg.usage, "server_tool_use", None)
    if tools is not None:
        usage.web_searches += tools.web_search_requests or 0


class AnthropicAI:
    def __init__(self, client: Any = None):
        import anthropic  # loaded here, so FakeAI and the tests never need a key

        self._sdk = anthropic
        self.client = client if client is not None else anthropic.Anthropic(max_retries=3)

    def _ask(self, system: str, prompt: str, schema: Dict[str, Any], effort: str,
             tools: Sequence[Dict[str, Any]] = (), max_tokens: int = 64000) -> Tuple[Dict[str, Any], Usage]:
        sdk = self._sdk
        messages: List[Dict[str, Any]] = [{"role": "user", "content": prompt}]
        usage = Usage(MODEL)
        extra: Dict[str, Any] = {"tools": list(tools)} if tools else {}
        for _ in range(MAX_STEPS):
            try:
                with self.client.beta.messages.stream(
                    model=MODEL,
                    max_tokens=max_tokens,
                    system=system,
                    messages=messages,
                    thinking={"type": "adaptive"},
                    output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
                    betas=BETAS,
                    fallbacks="default",
                    **extra,
                ) as stream:
                    msg = stream.get_final_message()
            except sdk.RateLimitError:
                raise AIError("The AI service is busy. Try again in a minute.", usage)
            except sdk.APIStatusError as e:
                log.warning("AI call failed with %s, request %s", e.status_code, getattr(e, "request_id", None))
                raise AIError("The AI service returned an error (%d). Try again." % e.status_code, usage)
            except sdk.APIConnectionError:
                raise AIError("Could not reach the AI service. Try again.", usage)
            _add(usage, msg)
            if msg.stop_reason == "pause_turn":
                # The server paused its web-tool loop: send back what it has so far and it carries on.
                messages.append({"role": "assistant", "content": msg.content})
                continue
            if msg.stop_reason == "refusal":
                category = getattr(msg.stop_details, "category", None) if msg.stop_details else None
                raise AIError("The model declined this request%s." % (" (%s)" % category if category else ""), usage)
            if msg.stop_reason == "max_tokens":
                raise AIError("The answer was cut off before it finished. Try again.", usage)
            texts = [b.text for b in msg.content if b.type == "text"]
            # With web search the answer can come as several text blocks (citations split it), so
            # join the trailing run of text blocks first; fall back to the last block alone.
            trailing: List[str] = []
            for b in reversed(msg.content):
                if b.type != "text":
                    break
                trailing.append(b.text)
            joined = "".join(reversed(trailing))
            try:
                return json.loads(joined), usage
            except ValueError:
                pass
            try:
                return json.loads(texts[-1]), usage
            except (IndexError, ValueError):
                raise AIError("The answer was not in the expected shape. Try again.", usage)
        raise AIError("The research took too many steps. Try again.", usage)

    def research(self, subject: Dict[str, Any]) -> Brief:
        data, usage = self._ask(RESEARCH_SYSTEM, research_prompt(subject), BRIEF_SCHEMA, "high", WEB_TOOLS)
        sources = data.pop("sources", [])
        return Brief(data, sources, usage)

    def summarise(self, text: str, org_name: str, contacts: Sequence[Dict[str, Any]],
                  now_local: str) -> Tuple[Dict[str, Any], Usage]:
        return self._ask(SUMMARY_SYSTEM, summary_prompt(text, org_name, contacts, now_local), SUMMARY_SCHEMA,
                         "low", max_tokens=16000)


class FakeAI:
    """Stands in for the API in tests and local development (BINDER_AI=fake).
    It answers at once from what it is given, costs nothing, and records each
    call in `calls`. With `fail`, every call raises AIError(fail)."""

    def __init__(self, fail: Optional[str] = None):
        self.fail = fail
        self.calls: List[Tuple[str, Any]] = []

    def research(self, subject: Dict[str, Any]) -> Brief:
        self.calls.append(("research", subject))
        if self.fail:
            raise AIError(self.fail, Usage("fake"))
        name = (subject.get("person") or subject["organisation"])["name"]
        people = [{"name": c["name"], "role": c.get("role") or "", "contact_id": c["id"], "why": "Already in Binder."}
                  for c in subject.get("contacts", [])]
        people.append({"name": "Sam Example", "role": "Head of Product", "contact_id": None,
                       "why": "Runs the product team."})
        brief = {
            "overview": "%s, as the fake research sees it." % name,
            "what_they_do": "Makes things people buy.",
            "size_and_funding": "Unknown.",
            "people": people,
            "recent_news": [{"headline": "Opened a new office", "date": "2026-10-01", "url": "https://example.com/news"}],
            "likely_needs": ["A partner for their next product"],
            "offdesk_angle": "Start with a short discovery sprint.",
            "open_questions": ["Who holds the budget?"],
        }
        return Brief(brief, [{"url": "https://example.com/about", "title": "About"}], Usage("fake"))

    def summarise(self, text: str, org_name: str, contacts: Sequence[Dict[str, Any]],
                  now_local: str) -> Tuple[Dict[str, Any], Usage]:
        self.calls.append(("summarise", {"text": text, "org_name": org_name, "contacts": list(contacts),
                                         "now_local": now_local}))
        if self.fail:
            raise AIError(self.fail, Usage("fake"))
        lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
        found = [c["id"] for c in contacts if c["name"].lower() in text.lower()]
        return {"summary": lines[0][:300] if lines else "", "type": "note", "happened_at": None,
                "next_step": None, "next_step_due": None, "contact_ids": found}, Usage("fake")


def from_settings(settings: Settings) -> Any:
    """The AI the app uses, or None when it is off."""
    if settings.ai == "fake":
        return FakeAI()
    if settings.ai == "anthropic":
        return AnthropicAI()
    return None
