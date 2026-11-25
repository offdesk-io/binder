"""Tokens the Offdesk core signs for each tool call, checked here with Binder's own code.

The core's format: base64url (no padding) of compact JSON `{"sub", "agent", "exp"}`, a dot, and
base64url of the HMAC-SHA256 of that first part, keyed by the core's CORE_TOKEN_KEY. Binder holds the
same key as BINDER_CORE_TOKEN_KEY. `sub` is a person's email, or `agent:<name>` / `routine:<id>` for
an agent of the team. `exp` is seconds since 1970; a token is good up to and including that second."""

import base64
import binascii
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional


class TokenError(Exception):
    pass


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify(key: bytes, token: str, now: Optional[float] = None) -> Dict[str, Any]:
    try:
        body, sig = token.split(".")
    except ValueError:
        raise TokenError("malformed") from None
    good = _b64(hmac.new(key, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig.encode(), good.encode()):
        raise TokenError("bad signature")
    try:
        claims = json.loads(_unb64(body))
        exp = int(claims["exp"])
        sub = claims["sub"]
    except (ValueError, KeyError, TypeError, binascii.Error):  # bad base64 or JSON, a missing claim, not an object
        raise TokenError("malformed") from None
    if not isinstance(sub, str) or not sub:
        raise TokenError("malformed")
    if exp < int(now if now is not None else time.time()):
        raise TokenError("expired")
    return claims
