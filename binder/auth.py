"""Who is calling.

Header mode trusts X-Offdesk-Email / -Name / -Teams because the app listens
on loopback only and nginx, which asks the Offdesk sign-in service, is the
only caller. Every non-GET request must also carry `X-Binder: 1`: a form on
another site can post with the visitor's cookie but cannot set that header.
"""

from dataclasses import dataclass
from typing import Mapping, Tuple
from urllib.parse import unquote

from fastapi import HTTPException, Request

from .config import Settings

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


@dataclass(frozen=True)
class Identity:
    email: str
    name: str
    teams: Tuple[str, ...]


DEV_IDENTITY = Identity("dev@binder.local", "Dev", ("offdesk",))


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


def guard(request: Request) -> Identity:
    who = identity_from_headers(request.headers, request.app.state.settings)
    if request.method not in SAFE_METHODS and request.headers.get("x-binder") != "1":
        raise HTTPException(403, "Missing X-Binder header")
    return who
