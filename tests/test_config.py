import pytest
from binder.config import load_settings, ConfigError


def test_defaults_are_local_dev():
    s = load_settings({})
    assert s.auth == ""
    assert s.host == "127.0.0.1"
    assert s.port == 8770
    assert s.team == "offdesk"
    assert s.db_path == "binder.db"


def test_header_mode_accepted_on_loopback():
    s = load_settings({"BINDER_AUTH": "header", "BINDER_DB": "/x/l.db", "BINDER_PORT": "9000"})
    assert s.auth == "header"
    assert s.db_path == "/x/l.db"
    assert s.port == 9000


def test_unknown_auth_mode_refuses():
    with pytest.raises(ConfigError):
        load_settings({"BINDER_AUTH": "heder"})


def test_header_mode_refuses_public_host():
    with pytest.raises(ConfigError):
        load_settings({"BINDER_AUTH": "header", "BINDER_HOST": "0.0.0.0"})


def test_dev_mode_refuses_public_host():
    with pytest.raises(ConfigError):
        load_settings({"BINDER_HOST": "0.0.0.0"})


def test_port_must_be_a_number():
    with pytest.raises(ConfigError, match="BINDER_PORT"):
        load_settings({"BINDER_PORT": "abc"})


def test_header_mode_requires_explicit_absolute_db():
    with pytest.raises(ConfigError):
        load_settings({"BINDER_AUTH": "header"})
    with pytest.raises(ConfigError):
        load_settings({"BINDER_AUTH": "header", "BINDER_DB": "rel/l.db"})


def test_tz_defaults_to_london_and_can_be_set():
    assert load_settings({}).tz == "Europe/Lisbon"
    assert load_settings({"BINDER_TZ": "Europe/Paris"}).tz == "Europe/Paris"


def test_unknown_tz_refuses():
    with pytest.raises(ConfigError, match="BINDER_TZ"):
        load_settings({"BINDER_TZ": "Mars/Olympus"})


def test_ai_is_off_without_a_key():
    assert load_settings({}).ai == "off"


def test_ai_uses_anthropic_when_a_key_is_set():
    assert load_settings({"ANTHROPIC_API_KEY": "k"}).ai == "anthropic"


def test_ai_can_be_switched_off_or_faked():
    assert load_settings({"ANTHROPIC_API_KEY": "k", "BINDER_AI": "off"}).ai == "off"
    assert load_settings({"BINDER_AI": "fake"}).ai == "fake"


def test_ai_anthropic_needs_a_key():
    with pytest.raises(ConfigError, match="ANTHROPIC_API_KEY"):
        load_settings({"BINDER_AI": "anthropic"})


def test_unknown_ai_mode_refuses_to_start():
    with pytest.raises(ConfigError, match="BINDER_AI"):
        load_settings({"BINDER_AI": "openai"})


def test_fake_ai_is_refused_on_the_server():
    with pytest.raises(ConfigError, match="fake"):
        load_settings({"BINDER_AUTH": "header", "BINDER_DB": "/x/l.db", "BINDER_AI": "fake"})


def test_bench_is_off_by_default():
    s = load_settings({})
    assert (s.bench_token, s.bench_file, s.bench_core) == ("", "", "")
    assert s.bench_board == "work"
    assert s.bench_url == "https://bench.offdesk.io"


def test_bench_token_needs_the_bench_core(tmp_path):
    with pytest.raises(ConfigError, match="BINDER_BENCH_CORE"):
        load_settings({"BINDER_BENCH_TOKEN": "t0ken"})


def test_bench_core_must_hold_todo_py(tmp_path):
    with pytest.raises(ConfigError, match="todo.py"):
        load_settings({"BINDER_BENCH_TOKEN": "t0ken", "BINDER_BENCH_CORE": str(tmp_path)})


def test_bench_over_http(tmp_path):
    (tmp_path / "todo.py").write_text("")
    s = load_settings({"BINDER_BENCH_TOKEN": "t0ken", "BINDER_BENCH_CORE": str(tmp_path),
                       "BINDER_BENCH_BOARD": "other", "BINDER_BENCH_URL": "https://bench.example.com/"})
    assert (s.bench_token, s.bench_board, s.bench_url) == ("t0ken", "other", "https://bench.example.com")
    assert "t0ken" not in repr(s)  # the token never reaches a log line


def test_bench_url_must_be_https_unless_loopback(tmp_path):
    (tmp_path / "todo.py").write_text("")
    base = {"BINDER_BENCH_TOKEN": "t", "BINDER_BENCH_CORE": str(tmp_path)}
    with pytest.raises(ConfigError, match="https"):
        load_settings(dict(base, BINDER_BENCH_URL="http://bench.example.com"))
    with pytest.raises(ConfigError, match="https"):
        load_settings(dict(base, BINDER_BENCH_URL="http://localhost.example.com"))
    with pytest.raises(ConfigError, match="https"):
        load_settings(dict(base, BINDER_BENCH_URL="http://localhost:8765"))  # a name, not a literal loopback address
    assert load_settings(dict(base, BINDER_BENCH_URL="http://127.0.0.1:8765")).bench_url == "http://127.0.0.1:8765"
    assert load_settings(dict(base, BINDER_BENCH_URL="http://[::1]:8765")).bench_url == "http://[::1]:8765"


def test_bench_file_is_for_local_development_only(tmp_path):
    (tmp_path / "todo.py").write_text("")
    s = load_settings({"BINDER_BENCH_FILE": "board.md", "BINDER_BENCH_CORE": str(tmp_path)})
    assert s.bench_file == "board.md"
    with pytest.raises(ConfigError, match="BINDER_BENCH_FILE"):
        load_settings({"BINDER_AUTH": "header", "BINDER_DB": "/x/b.db", "BINDER_BENCH_FILE": "board.md",
                       "BINDER_BENCH_CORE": str(tmp_path)})


def test_owners_default_to_none():
    assert load_settings({}).owners == ()


def test_owners_are_email_name_pairs():
    s = load_settings({"BINDER_OWNERS": " Ana@Example.com=Ana , rui@example.com=Rui Sá,"})
    assert s.owners == (("ana@example.com", "Ana"), ("rui@example.com", "Rui Sá"))


@pytest.mark.parametrize("raw", ["ana@example.com", "ana@example.com=", "ana=Ana",
                                 "ana@example.com=Ana,ana@example.com=Ana B"])
def test_bad_owners_refuse_to_start(raw):
    with pytest.raises(ConfigError, match="BINDER_OWNERS"):
        load_settings({"BINDER_OWNERS": raw})
