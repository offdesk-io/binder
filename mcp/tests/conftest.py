"""Binder's own app, in process, behind the MCP server, with the server driven by an in-process MCP client.
Tokens are made here with the core's algorithm (nothing is imported from the core)."""

import base64
import hashlib
import hmac
import json
import time

import httpx
import pytest

from binder.app import create_app
from binder.config import load_settings
from binder_mcp.server import make_server

KEY = bytes(range(32))
OWNERS = "ana@example.com=Ana,rui@example.com=Rui"


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def token(sub: str = "ana@example.com", agent: str = "pa", exp=None, key: bytes = KEY) -> str:
    body = b64(json.dumps({"sub": sub, "agent": agent, "exp": exp or int(time.time()) + 300},
                          separators=(",", ":")).encode())
    return body + "." + b64(hmac.new(key, body.encode(), hashlib.sha256).digest())


def meta(sub: str = "ana@example.com", **kw):
    return {"offdesk/token": token(sub, **kw)}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def binder_app(tmp_path):
    env = {"BINDER_DB": str(tmp_path / "t.db"), "BINDER_WEB": str(tmp_path / "no-web"), "BINDER_AUTH": "header",
           "BINDER_OWNERS": OWNERS, "BINDER_CORE_TOKEN_KEY": KEY.hex()}
    return create_app(load_settings(env), ai=None, bench=None, hooks=None)


@pytest.fixture
def seen():
    """Every request the MCP server made to Binder."""
    return []


@pytest.fixture
def server(binder_app, seen):
    async def record(request):
        seen.append(request)

    http = httpx.AsyncClient(transport=httpx.ASGITransport(app=binder_app), base_url="http://binder",
                             event_hooks={"request": [record]})
    return make_server(http)


@pytest.fixture
def direct(binder_app):
    """Binder itself, to set records up as a team member through its own sign-in."""
    from fastapi.testclient import TestClient
    c = TestClient(binder_app)
    c.headers.update({"x-offdesk-email": "ana@example.com", "x-offdesk-name": "Ana", "x-offdesk-teams": "offdesk",
                      "x-binder": "1"})
    return c
