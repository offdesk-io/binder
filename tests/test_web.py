import os

import pytest
from fastapi.testclient import TestClient

from ledger.app import create_app
from ledger.config import load_settings

from tests.conftest import TEAM


@pytest.fixture
def web(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>")
    (dist / "assets" / "app-abc.js").write_text("console.log(1)")
    (dist / "manifest.webmanifest").write_text('{"name": "Ledger"}')
    (tmp_path / "secret.txt").write_text("not for you")
    env = {"LEDGER_DB": str(tmp_path / "t.db"), "LEDGER_WEB": str(dist), "LEDGER_AUTH": "header"}
    c = TestClient(create_app(load_settings(env)))
    c.headers.update(TEAM)
    return c


def test_web_dir_defaults_to_web_dist():
    assert load_settings({}).web_dir.endswith(os.path.join("web", "dist"))


def test_app_paths_get_index(web):
    for path in ("/", "/o/acme-studio", "/pipeline"):
        r = web.get(path)
        assert r.status_code == 200, path
        assert "id=root" in r.text
        assert r.headers["cache-control"] == "no-cache"


def test_built_assets_are_served_and_cached(web):
    r = web.get("/assets/app-abc.js")
    assert r.status_code == 200 and r.text == "console.log(1)"
    assert "immutable" in r.headers["cache-control"]


def test_manifest_has_its_media_type(web):
    r = web.get("/manifest.webmanifest")
    assert r.headers["content-type"].startswith("application/manifest+json")


def test_unknown_api_path_is_a_json_404(web):
    r = web.get("/api/nope")
    assert r.status_code == 404
    assert isinstance(r.json()["detail"], str)


def test_api_routes_still_answer(web):
    assert web.get("/api/whoami").json()["email"] == "ana@example.com"


def test_a_route_added_later_still_answers(web):
    @web.app.get("/later")
    def later():
        return {"ok": True}

    assert web.get("/later").json() == {"ok": True}


def test_no_file_outside_the_build_is_served(web):
    for path in ("/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/../../secret.txt"):
        r = web.get(path)
        assert "not for you" not in r.text, path


def test_a_null_byte_in_the_path_is_not_a_server_error(web):
    r = web.get("/%00")
    assert r.status_code == 200 and "id=root" in r.text


def test_a_very_long_path_is_not_a_server_error(web):
    r = web.get("/" + "a" * 5000)
    assert r.status_code == 200 and "id=root" in r.text


def test_a_missing_asset_is_a_json_404(web):
    r = web.get("/assets/gone-123.js")
    assert r.status_code == 404
    assert r.json() == {"detail": "Not found"}


def test_unbuilt_frontend_says_so(tmp_path):
    env = {"LEDGER_DB": str(tmp_path / "t.db"), "LEDGER_WEB": str(tmp_path / "missing")}
    r = TestClient(create_app(load_settings(env))).get("/")
    assert r.status_code == 404
    assert "npm run build" in r.json()["detail"]
