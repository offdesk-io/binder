import pytest
from ledger.config import load_settings, ConfigError


def test_defaults_are_local_dev():
    s = load_settings({})
    assert s.auth == ""
    assert s.host == "127.0.0.1"
    assert s.port == 8770
    assert s.team == "offdesk"
    assert s.db_path == "ledger.db"


def test_header_mode_accepted_on_loopback():
    s = load_settings({"LEDGER_AUTH": "header", "LEDGER_DB": "/x/l.db", "LEDGER_PORT": "9000"})
    assert s.auth == "header"
    assert s.db_path == "/x/l.db"
    assert s.port == 9000


def test_unknown_auth_mode_refuses():
    with pytest.raises(ConfigError):
        load_settings({"LEDGER_AUTH": "heder"})


def test_header_mode_refuses_public_host():
    with pytest.raises(ConfigError):
        load_settings({"LEDGER_AUTH": "header", "LEDGER_HOST": "0.0.0.0"})


def test_dev_mode_refuses_public_host():
    with pytest.raises(ConfigError):
        load_settings({"LEDGER_HOST": "0.0.0.0"})


def test_port_must_be_a_number():
    with pytest.raises(ConfigError, match="LEDGER_PORT"):
        load_settings({"LEDGER_PORT": "abc"})


def test_header_mode_requires_explicit_absolute_db():
    with pytest.raises(ConfigError):
        load_settings({"LEDGER_AUTH": "header"})
    with pytest.raises(ConfigError):
        load_settings({"LEDGER_AUTH": "header", "LEDGER_DB": "rel/l.db"})


def test_tz_defaults_to_london_and_can_be_set():
    assert load_settings({}).tz == "Europe/London"
    assert load_settings({"LEDGER_TZ": "Europe/Lisbon"}).tz == "Europe/Lisbon"


def test_unknown_tz_refuses():
    with pytest.raises(ConfigError, match="LEDGER_TZ"):
        load_settings({"LEDGER_TZ": "Mars/Olympus"})
