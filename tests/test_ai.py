import json
from types import SimpleNamespace as NS

import anthropic
import httpx
import pytest

from binder.ai import BETAS, MODEL, WEB_TOOLS, AIError, AnthropicAI, FakeAI, Usage

BRIEF = {
    "overview": "A pottery.", "what_they_do": "Kilns.", "size_and_funding": "Unknown.",
    "people": [], "recent_news": [], "likely_needs": [], "offdesk_angle": "Help.", "open_questions": [],
    "sources": [{"url": "https://example.com", "title": "Home"}],
}
SUBJECT = {"organisation": {"name": "Quillmere Kilnworks"}, "contacts": [], "interactions": [], "previous_brief": None}


def message(stop="end_turn", text=None, content=None, inp=100, out=50, searches=0, category=None, model=MODEL):
    blocks = content if content is not None else ([NS(type="text", text=text)] if text is not None else [])
    return NS(
        stop_reason=stop, content=blocks, model=model,
        stop_details=NS(category=category) if stop == "refusal" else None,
        usage=NS(input_tokens=inp, output_tokens=out,
                 server_tool_use=NS(web_search_requests=searches) if searches else None),
    )


class Stream:
    def __init__(self, msg):
        self.msg = msg

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.msg


class Client:
    """Answers each stream() call with the next answer, raising it if it is an exception."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []
        self.beta = NS(messages=NS(stream=self.stream))

    def stream(self, **kw):
        self.calls.append(dict(kw, messages=list(kw["messages"])))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return Stream(answer)


REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def test_research_sends_the_planned_request():
    client = Client(message(text=json.dumps(BRIEF), searches=3))
    out = AnthropicAI(client).research(SUBJECT)
    kw = client.calls[0]
    assert kw["model"] == MODEL
    assert kw["thinking"] == {"type": "adaptive"}
    assert kw["output_config"]["effort"] == "high"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["tools"] == WEB_TOOLS
    assert kw["betas"] == BETAS
    assert kw["fallbacks"] == "default"
    assert "Quillmere Kilnworks" in kw["messages"][0]["content"]
    assert out.sources == BRIEF["sources"]
    assert "sources" not in out.brief
    assert out.usage == Usage(MODEL, 100, 50, 3)


def test_a_paused_turn_is_resumed_with_the_answer_so_far():
    paused = message(stop="pause_turn", content=[NS(type="server_tool_use")])
    client = Client(paused, message(text=json.dumps(BRIEF)))
    out = AnthropicAI(client).research(SUBJECT)
    assert len(client.calls) == 2
    assert client.calls[1]["messages"][1] == {"role": "assistant", "content": paused.content}
    assert out.usage.input_tokens == 200


def test_too_many_pauses_give_up():
    client = Client(*[message(stop="pause_turn", content=[]) for _ in range(6)])
    with pytest.raises(AIError, match="too many steps"):
        AnthropicAI(client).research(SUBJECT)


def test_a_refusal_says_so_and_keeps_the_usage():
    client = Client(message(stop="refusal", category="cyber"))
    with pytest.raises(AIError, match=r"declined this request \(cyber\)") as e:
        AnthropicAI(client).research(SUBJECT)
    assert e.value.usage.input_tokens == 100


def test_an_answer_split_across_text_blocks_after_a_web_search_parses():
    text = json.dumps(BRIEF)
    split = [NS(type="text", text=text[:40]), NS(type="text", text=text[40:])]
    content = [NS(type="server_tool_use"), NS(type="web_search_tool_result")] + split
    client = Client(message(content=content, searches=1))
    out = AnthropicAI(client).research(SUBJECT)
    assert out.brief["overview"] == "A pottery."
    assert out.sources == BRIEF["sources"]


def test_a_cut_off_or_misshapen_answer_is_an_error():
    with pytest.raises(AIError, match="cut off"):
        AnthropicAI(Client(message(stop="max_tokens", text="{"))).research(SUBJECT)
    with pytest.raises(AIError, match="expected shape"):
        AnthropicAI(Client(message(text="not json"))).research(SUBJECT)


def test_api_errors_become_sentences():
    gone = anthropic.APIConnectionError(request=REQUEST)
    busy = anthropic.RateLimitError("slow down", response=httpx.Response(429, request=REQUEST), body=None)
    with pytest.raises(AIError, match="Could not reach"):
        AnthropicAI(Client(gone)).research(SUBJECT)
    with pytest.raises(AIError, match="busy"):
        AnthropicAI(Client(busy)).research(SUBJECT)


def test_summarise_is_quick_and_has_no_tools():
    answer = {"summary": "Met", "type": "meeting", "happened_at": None, "next_step": None,
              "next_step_due": None, "contact_ids": [5]}
    client = Client(message(text=json.dumps(answer)))
    fields, usage = AnthropicAI(client).summarise(
        "Met Bo for coffee", "Acme", [{"id": 5, "name": "Bo", "role": None}], "2026-11-11T10:00+00:00 (Europe/Lisbon)")
    kw = client.calls[0]
    assert kw["output_config"]["effort"] == "low"
    assert "tools" not in kw
    prompt = kw["messages"][0]["content"]
    assert "Met Bo for coffee" in prompt and '"name": "Bo"' in prompt and "Europe/Lisbon" in prompt
    assert fields == answer
    assert usage.output_tokens == 50


def test_the_fake_matches_known_people_and_suggests_one_more():
    ai = FakeAI()
    out = ai.research(dict(SUBJECT, contacts=[{"id": 5, "name": "Bo", "role": "CEO"}]))
    assert [(p["name"], p["contact_id"]) for p in out.brief["people"]] == [("Bo", 5), ("Sam Example", None)]
    assert out.brief["overview"].startswith("Quillmere Kilnworks")
    assert ai.calls[0][0] == "research"


def test_the_fake_can_fail():
    with pytest.raises(AIError, match="nope"):
        FakeAI(fail="nope").research(SUBJECT)
