"""A request with the core's token acts for the person (or agent) it names, and never reads the sign-in headers."""

import time

import pytest
from fastapi.testclient import TestClient

from binder.app import create_app
from binder.config import load_settings
from tests.conftest import OWNERS, TEAM, WRITE
from tests.test_core_tokens import KEY, KEY_HEX, make


def bearer(sub, agent="pa", exp=None, key=KEY):
    exp = int(time.time()) + 300 if exp is None else exp
    return {"authorization": "Bearer " + make({"sub": sub, "agent": agent, "exp": exp}, key=key)}


@pytest.fixture
def make_app(tmp_path):
    def _make(key=KEY_HEX, auth="header", admins=None):
        env = {"BINDER_DB": str(tmp_path / "t.db"), "BINDER_WEB": str(tmp_path / "no-web"), "BINDER_OWNERS": OWNERS}
        if auth:
            env["BINDER_AUTH"] = auth
        if key:
            env["BINDER_CORE_TOKEN_KEY"] = key
        if admins:
            env["BINDER_ADMINS"] = admins
        return TestClient(create_app(load_settings(env), ai=None, bench=None))
    return _make


def test_a_token_names_the_person(make_app):
    r = make_app().get("/api/whoami", headers=bearer("rui@example.com"))
    assert r.status_code == 200
    assert r.json() == {"email": "rui@example.com", "name": "rui@example.com", "teams": ["offdesk"]}


def test_a_token_wins_over_the_sign_in_headers(make_app):
    r = make_app().get("/api/whoami", headers=dict(TEAM, **bearer("rui@example.com")))
    assert r.json()["email"] == "rui@example.com"


def test_a_bad_token_is_refused_even_with_good_headers(make_app):
    r = make_app().get("/api/whoami", headers=dict(TEAM, **bearer("rui@example.com", key=b"x" * 32)))
    assert r.status_code == 401
    assert "token" in r.json()["detail"]


def test_an_expired_token_is_refused(make_app):
    r = make_app().get("/api/whoami", headers=bearer("rui@example.com", exp=int(time.time()) - 5))
    assert r.status_code == 401
    assert "expired" in r.json()["detail"]


def test_tokens_are_refused_when_no_key_is_set(make_app):
    for auth in ("header", ""):
        r = make_app(key="", auth=auth).get("/api/whoami", headers=dict(TEAM, **bearer("rui@example.com")))
        assert r.status_code == 401


def test_other_authorization_schemes_are_refused(make_app):
    r = make_app().get("/api/whoami", headers=dict(TEAM, authorization="Basic YTpi"))
    assert r.status_code == 401


def test_an_agent_token_acts_for_the_team_and_is_recorded_as_the_agent(make_app):
    c = make_app()
    who = c.get("/api/whoami", headers=bearer("agent:digest", agent="digest")).json()
    assert who == {"email": "agent:digest", "name": "agent: digest", "teams": ["offdesk"]}
    r = c.post("/api/orgs", json={"name": "Acme Studio"}, headers=dict(bearer("agent:digest", "digest"), **{"x-binder": "1"}))
    assert r.status_code == 201
    assert r.json()["updated_by"] == "agent:digest"
    assert r.json()["owner_email"] is None   # an agent is not on the owners list, so nobody handles it


@pytest.mark.parametrize("agent, by", [("routine:r1", "rui@example.com via routine:r1"),
                                       ("helper", "rui@example.com via agent:helper")])
def test_a_routine_or_personal_agent_is_recorded_as_the_person_via_it(make_app, agent, by):
    # What the core sends: a routine or a person's own agent names the person, and itself in `agent`.
    c = make_app()
    assert c.get("/api/whoami", headers=bearer("rui@example.com", agent=agent)).json()["email"] == "rui@example.com"
    r = c.post("/api/orgs", json={"name": "Acme Studio"}, headers=dict(bearer("rui@example.com", agent), **{"x-binder": "1"}))
    assert r.status_code == 201
    assert r.json()["updated_by"] == by
    i = c.post("/api/orgs/%d/interactions" % r.json()["id"], json={"type": "note", "summary": "x"},
               headers=dict(bearer("rui@example.com", agent), **{"x-binder": "1"}))
    assert i.json()["author_email"] == by


def test_the_pa_is_recorded_as_the_person(make_app):
    r = make_app().post("/api/orgs", json={"name": "Acme Studio"},
                        headers=dict(bearer("rui@example.com", "pa"), **{"x-binder": "1"}))
    assert r.json()["updated_by"] == "rui@example.com"


def test_a_token_whose_subject_is_blank_is_refused(make_app):
    r = make_app().get("/api/whoami", headers={"authorization": "Bearer " + make(
        {"sub": "   ", "agent": "pa", "exp": int(time.time()) + 60})})
    assert r.status_code == 401


def test_writes_with_a_token_still_need_x_binder(make_app):
    c = make_app()
    r = c.post("/api/orgs", json={"name": "Acme Studio"}, headers=bearer("ana@example.com"))
    assert r.status_code == 403
    r = c.post("/api/orgs", json={"name": "Acme Studio"}, headers=dict(bearer("ana@example.com"), **{"x-binder": "1"}))
    assert r.status_code == 201
    assert r.json()["updated_by"] == "ana@example.com"
    assert r.json()["owner_email"] == "ana@example.com"


def test_the_sign_in_headers_still_work_without_a_token(make_app):
    r = make_app().post("/api/orgs", json={"name": "Acme Studio"}, headers=WRITE)
    assert r.status_code == 201
