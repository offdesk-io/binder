import pytest
from fastapi.testclient import TestClient

from binder.ai import FakeAI
from binder.app import create_app
from binder.config import load_settings

TEAM = {"x-offdesk-email": "ana@example.com", "x-offdesk-name": "Ana", "x-offdesk-teams": "offdesk"}
WRITE = dict(TEAM, **{"x-binder": "1"})


@pytest.fixture
def make_client(tmp_path):
    def _make(auth="header", ai=None, run_job=None):
        env = {"BINDER_DB": str(tmp_path / "t.db"), "BINDER_WEB": str(tmp_path / "no-web")}  # never the real build
        if auth:
            env["BINDER_AUTH"] = auth
        return TestClient(create_app(load_settings(env), ai=ai, run_job=run_job))
    return _make


@pytest.fixture
def client(make_client):
    """Header mode, signed in as Ana, X-Binder set on every request."""
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
