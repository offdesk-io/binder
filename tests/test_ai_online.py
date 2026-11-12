"""Real calls to the Anthropic API, about a made-up company. They cost money,
so they run only with `pytest -m online` and never in CI. They need
ANTHROPIC_API_KEY."""

import os

import pytest

from binder.ai import AnthropicAI

pytestmark = [
    pytest.mark.online,
    pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="needs ANTHROPIC_API_KEY"),
]

SUBJECT = {
    "organisation": {"name": "Quillmere Kilnworks", "website": None, "sector": "Ceramics", "size": None,
                     "location": "a made-up town", "kind": "lead", "status": "lead", "source": None, "tags": [],
                     "summary": "A fictional company, used to test Binder.", "next_step": None},
    "contacts": [{"id": 1, "name": "Rowan Example", "role": "Founder", "relationship": "warm",
                  "is_primary": True, "notes": None}],
    "interactions": [],
    "previous_brief": None,
}
KEYS = {"overview", "what_they_do", "size_and_funding", "people", "recent_news", "likely_needs", "offdesk_angle",
        "open_questions"}


def test_research_returns_a_brief():
    out = AnthropicAI().research(SUBJECT)
    assert set(out.brief) == KEYS
    assert out.usage.output_tokens > 0


def test_summarise_fills_a_log():
    text = ("From: Rowan Example\nSubject: Next week\n\nThanks for the call today. "
            "Let's meet on 20 November 2026 to look at the kiln designs.")
    fields, usage = AnthropicAI().summarise(text, "Quillmere Kilnworks", [{"id": 1, "name": "Rowan Example",
                                            "role": "Founder"}], "2026-11-11T10:00+00:00 (Europe/London)")
    assert fields["contact_ids"] == [1]
    assert fields["next_step_due"] == "2026-11-20"
    assert usage.output_tokens > 0
