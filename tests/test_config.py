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
    assert load_settings({}).tz == "Europe/London"
    assert load_settings({"BINDER_TZ": "Europe/Lisbon"}).tz == "Europe/Lisbon"


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
