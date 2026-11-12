import pytest
from fastapi.testclient import TestClient

from ledger.ai import FakeAI
from ledger.app import create_app
from ledger.config import load_settings

TEAM = {"x-offdesk-email": "ana@example.com", "x-offdesk-name": "Ana", "x-offdesk-teams": "offdesk"}
WRITE = dict(TEAM, **{"x-ledger": "1"})


@pytest.fixture
def make_client(tmp_path):
    def _make(auth="header", ai=None, run_job=None):
        env = {"LEDGER_DB": str(tmp_path / "t.db"), "LEDGER_WEB": str(tmp_path / "no-web")}  # never the real build
        if auth:
            env["LEDGER_AUTH"] = auth
        return TestClient(create_app(load_settings(env), ai=ai, run_job=run_job))
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


def run_now(job):
    job()


@pytest.fixture
def fake_ai():
    return FakeAI()


@pytest.fixture
def ai_client(make_client, fake_ai):
    """Like `client`, with FakeAI behind the AI routes and background jobs run at once."""
    c = make_client(ai=fake_ai, run_job=run_now)
    c.headers.update(WRITE)
    return c
