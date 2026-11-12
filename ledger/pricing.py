"""What a run cost, in US dollars, from its token counts. Prices are per
million tokens, (input, output). A model not listed shows no cost, rather
than a wrong one: a server-side fallback can answer on another model."""

from typing import Optional

PRICES = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "fake": (0.0, 0.0),
}
WEB_SEARCH = 0.01  # each search: $10 per 1,000


def cost_usd(model: Optional[str], input_tokens: Optional[int], output_tokens: Optional[int],
             web_searches: Optional[int]) -> Optional[float]:
    price = PRICES.get(model or "")
    if price is None or input_tokens is None or output_tokens is None:
        return None
    total = input_tokens * price[0] / 1e6 + output_tokens * price[1] / 1e6 + (web_searches or 0) * WEB_SEARCH
    return round(total, 4)
