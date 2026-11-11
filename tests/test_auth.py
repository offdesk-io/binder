import pytest
from fastapi import HTTPException
from ledger.auth import identity_from_headers, DEV_IDENTITY
from ledger.config import load_settings

HEADER = load_settings({"LEDGER_AUTH": "header", "LEDGER_DB": "/tmp/ledger-test.db"})
LOCAL = load_settings({})


def test_local_mode_is_dev_identity():
    assert identity_from_headers({}, LOCAL) == DEV_IDENTITY


def test_header_mode_reads_identity():
    who = identity_from_headers({
        "x-offdesk-email": "A@Example.com",
        "x-offdesk-name": "Ana%20S%C3%A1",
        "x-offdesk-teams": "offdesk, other",
    }, HEADER)
    assert who.email == "a@example.com"
    assert who.name == "Ana Sá"
    assert who.teams == ("offdesk", "other")


def test_no_email_is_401():
    with pytest.raises(HTTPException) as e:
        identity_from_headers({"x-offdesk-teams": "offdesk"}, HEADER)
    assert e.value.status_code == 401


def test_wrong_team_is_403():
    with pytest.raises(HTTPException) as e:
        identity_from_headers({"x-offdesk-email": "a@example.com", "x-offdesk-teams": "other"}, HEADER)
    assert e.value.status_code == 403


def test_name_falls_back_to_email():
    who = identity_from_headers({"x-offdesk-email": "a@example.com", "x-offdesk-teams": "offdesk"}, HEADER)
    assert who.name == "a@example.com"
