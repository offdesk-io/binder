from binder.pricing import cost_usd


def test_cost_counts_tokens_and_searches():
    # 1M in at $4, 0.5M out at $20, 3 searches at $0.01
    assert cost_usd("claude-opus-5-5", 1_000_000, 500_000, 3) == 14.03


def test_unknown_model_or_missing_counts_have_no_cost():
    assert cost_usd("some-other-model", 10, 10, 0) is None
    assert cost_usd(None, None, None, None) is None


def test_the_fake_costs_nothing():
    assert cost_usd("fake", 0, 0, 0) == 0.0
