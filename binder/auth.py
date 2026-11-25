"""Who is calling.

Header mode trusts X-Offdesk-Email / -Name / -Teams because the app listens
on loopback only and nginx, which asks the Offdesk sign-in service, is the
only caller. Every non-GET request must also carry `X-Binder: 1`: a form on
another site can post with the visitor's cookie but cannot set that header.

The Offdesk core calls Binder with its own signed token instead, as
`Authorization: Bearer <token>`, checked with BINDER_CORE_TOKEN_KEY
(binder/tokens.py). Such a request acts for the person the token names and
never reads the sign-in headers; a token for `agent:<name>` or
`routine:<id>` acts for the team and is recorded as that agent. Without the
key set, every token is refused. Writes still need `X-Binder: 1`.
"""

from dataclasses import dataclass
from typing import Mapping, Tuple
from urllib.parse import unquote

from fastapi import HTTPException, Request

from .config import Settings
from .tokens import TokenError, verify

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


@dataclass(frozen=True)
class Identity:
    email: str
    name: str
    teams: Tuple[str, ...]
    token: bool = False  # came with the core's token, not the sign-in

    @property
    def agent(self) -> bool:
        return self.email.startswith(AGENT_PREFIXES)


DEV_IDENTITY = Identity("dev@binder.local", "Dev", ("offdesk",))
AGENT_PREFIXES = ("agent:", "routine:")


def identity_from_headers(headers: Mapping[str, str], settings: Settings) -> Identity:
    if not settings.auth:
        return DEV_IDENTITY
    email = (headers.get("x-offdesk-email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Not signed in")
    name = unquote(headers.get("x-offdesk-name") or "").strip() or email
    teams = tuple(t.strip() for t in (headers.get("x-offdesk-teams") or "").split(",") if t.strip())
    if settings.team not in teams:
        raise HTTPException(403, "Binder is for the %s team" % settings.team)
    return Identity(email, name, teams)


def identity_from_token(authorization: str, settings: Settings) -> Identity:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(401, "Only the core's token is accepted in Authorization")
    if not settings.core_token_key:
        raise HTTPException(401, "This Binder does not accept the core's token")
    try:
        claims = verify(settings.core_token_key, token.strip())
    except TokenError as e:
        raise HTTPException(401, "Bad token: %s" % e)
    sub = claims["sub"].strip()
    if sub.startswith(AGENT_PREFIXES):
        kind, _, name = sub.partition(":")
        return Identity(sub, "%s: %s" % (kind, name), (settings.team,), token=True)
    return Identity(sub.lower(), sub.lower(), (settings.team,), token=True)


def guard(request: Request) -> Identity:
    settings = request.app.state.settings
    authorization = request.headers.get("authorization")
    if authorization is not None:
        who = identity_from_token(authorization, settings)
    else:
        who = identity_from_headers(request.headers, settings)
    if request.method not in SAFE_METHODS and request.headers.get("x-binder") != "1":
        raise HTTPException(403, "Missing X-Binder header")
    return who
