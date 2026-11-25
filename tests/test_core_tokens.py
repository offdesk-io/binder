"""Tokens from the Offdesk core: Binder checks them with its own code, which must match the core's exactly.
The vectors below were made by the core's Tokens with KEY, for 1000 seconds after 1970 and a life of 300."""

import base64
import hashlib
import hmac
import json

import pytest

from binder.config import ConfigError, load_settings
from binder.tokens import TokenError, verify

KEY_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
KEY = bytes.fromhex(KEY_HEX)
PERSON = ("eyJzdWIiOiJhbmFAZXhhbXBsZS5jb20iLCJhZ2VudCI6InBhIiwiZXhwIjoxMzAwfQ"
          ".-gGkCXnslvXniIar1FnH85x4hhOFFTzJUFf9iETjr0A")
AGENT = ("eyJzdWIiOiJhZ2VudDpkaWdlc3QiLCJhZ2VudCI6ImRpZ2VzdCIsImV4cCI6MTMwMH0"
         ".Ay0_EI211cPjiL81Dz4LJlJo1csOrgMeMjWfwG9ZlVw")


def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make(claims, key=KEY) -> str:
    """The core's algorithm, written out here: base64url JSON, a dot, base64url HMAC-SHA256 of the first part."""
    body = b64(json.dumps(claims, separators=(",", ":")).encode())
    return body + "." + b64(hmac.new(key, body.encode(), hashlib.sha256).digest())


def test_the_core_vectors_verify():
    assert verify(KEY, PERSON, now=1001) == {"sub": "ana@example.com", "agent": "pa", "exp": 1300}
    assert verify(KEY, AGENT, now=1300)["sub"] == "agent:digest"


def test_the_algorithm_written_here_makes_the_core_vector():
    assert make({"sub": "ana@example.com", "agent": "pa", "exp": 1300}) == PERSON


def test_an_expired_token_is_refused():
    with pytest.raises(TokenError, match="expired"):
        verify(KEY, PERSON, now=1301)


def test_a_token_signed_with_another_key_is_refused():
    with pytest.raises(TokenError, match="signature"):
        verify(KEY, make({"sub": "ana@example.com", "agent": "pa", "exp": 1300}, key=b"x" * 32), now=1000)


def test_a_changed_body_is_refused():
    body, sig = PERSON.split(".")
    forged = b64(json.dumps({"sub": "rui@example.com", "agent": "pa", "exp": 1300}).encode()) + "." + sig
    with pytest.raises(TokenError, match="signature"):
        verify(KEY, forged, now=1000)


@pytest.mark.parametrize("token", ["", "abc", "a.b.c", "é.é"])
def test_malformed_tokens_are_refused(token):
    with pytest.raises(TokenError):
        verify(KEY, token, now=1000)


@pytest.mark.parametrize("claims", [{"sub": "ana@example.com"}, [1, 2], {"sub": "", "exp": 1300},
                                    {"exp": 1300}, {"sub": 5, "exp": 1300}, {"sub": "  ", "exp": 1300}])
def test_signed_tokens_with_bad_claims_are_refused(claims):
    with pytest.raises(TokenError, match="malformed"):
        verify(KEY, make(claims), now=1000)


def test_the_key_comes_from_the_environment_as_hex():
    assert load_settings({"BINDER_CORE_TOKEN_KEY": KEY_HEX}).core_token_key == KEY
    assert load_settings({}).core_token_key == b""
    assert KEY_HEX not in repr(load_settings({"BINDER_CORE_TOKEN_KEY": KEY_HEX}))


@pytest.mark.parametrize("bad", ["zz" * 32, "00" * 16])
def test_a_bad_key_refuses_to_start(bad):
    with pytest.raises(ConfigError, match="BINDER_CORE_TOKEN_KEY"):
        load_settings({"BINDER_CORE_TOKEN_KEY": bad})


def test_admins_are_read_lowercased():
    s = load_settings({"BINDER_ADMINS": "Ana@Example.com, rui@example.com"})
    assert s.admins == ("ana@example.com", "rui@example.com")
    with pytest.raises(ConfigError, match="BINDER_ADMINS"):
        load_settings({"BINDER_ADMINS": "not-an-email"})
