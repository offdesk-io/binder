"""Only a page on Binder's own origin (the Offdesk shell) may frame it."""


def test_the_api_and_the_frontend_carry_the_framing_rules(client):
    for path in ("/api/health", "/o/some-org"):
        r = client.get(path)
        assert "frame-ancestors 'self'" in r.headers["content-security-policy"], path
        assert r.headers["x-frame-options"] == "SAMEORIGIN", path
