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
