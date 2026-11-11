import pytest
from fastapi.testclient import TestClient

from ledger.app import create_app
from ledger.config import load_settings

TEAM = {"x-offdesk-email": "ana@example.com", "x-offdesk-name": "Ana", "x-offdesk-teams": "offdesk"}
WRITE = dict(TEAM, **{"x-ledger": "1"})


@pytest.fixture
def make_client(tmp_path):
    def _make(auth="header"):
        env = {"LEDGER_DB": str(tmp_path / "t.db"), "LEDGER_WEB": str(tmp_path / "no-web")}  # never the real build
        if auth:
            env["LEDGER_AUTH"] = auth
        return TestClient(create_app(load_settings(env)))
    return _make


@pytest.fixture
def client(make_client):
    """Header mode, signed in as Ana, X-Ledger set on every request."""
    c = make_client()
    c.headers.update(WRITE)
    return c


@pytest.fixture
def org(client):
    r = client.post("/api/orgs", json={"name": "Acme Studio"})
    assert r.status_code == 201, r.text
    return r.json()
