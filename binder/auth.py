"""Who is calling.

Header mode trusts X-Offdesk-Email / -Name / -Teams because the app listens
on loopback only and nginx, which asks the Offdesk sign-in service, is the
only caller. Every non-GET request must also carry `X-Binder: 1`: a form on
another site can post with the visitor's cookie but cannot set that header.

The Offdesk core calls Binder with its own signed token instead, as
`Authorization: Bearer <token>`, checked with BINDER_CORE_TOKEN_KEY
(binder/tokens.py). Such a request acts for the person the token names and
never reads the sign-in headers. The core sends two shapes: `sub` is a
person's email and `agent` is who acts for them (`pa`, a person's own agent,
or `routine:<id>`); or `sub` is `agent:<name>`, an agent of the team. Writes
are recorded (`by`) as the person when the PA acts, as `agent:<name>` for an
agent of the team, and as `<email> via <agent>` otherwise, for example
`ana@example.com via routine:r1` or `ana@example.com via agent:helper`.
Without the key set, every token is refused. Writes still need `X-Binder: 1`.
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
    via: str = ""  # the token's `agent` claim: who acts for them ("pa", an agent's name, "routine:<id>")

    @property
    def agent(self) -> bool:
        """An agent of the team, not a person."""
        return self.email.startswith(AGENT_PREFIX)

    @property
    def by(self) -> str:
        """How a write is recorded: the person, the team's agent, or `<email> via <agent>`."""
        if self.agent or not self.via or self.via == "pa":
            return self.email
        return "%s via %s" % (self.email, self.via if ":" in self.via else AGENT_PREFIX + self.via)


DEV_IDENTITY = Identity("dev@binder.local", "Dev", ("offdesk",))
AGENT_PREFIX = "agent:"


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
    via = claims.get("agent") if isinstance(claims.get("agent"), str) else ""
    if sub.startswith(AGENT_PREFIX):
        return Identity(sub, "agent: %s" % sub[len(AGENT_PREFIX):], (settings.team,), token=True, via=via)
    return Identity(sub.lower(), sub.lower(), (settings.team,), token=True, via=via)


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
