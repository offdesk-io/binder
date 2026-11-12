"""Runtime settings, read from the environment.

BINDER_AUTH unset or empty is local development: one fixed identity, no
sign-in. BINDER_AUTH=header is the server behind nginx and the Offdesk
sign-in, which passes X-Offdesk-* headers. Any other value refuses to start,
so a typo cannot leave the app open. Binder always listens on loopback only:
dev mode has no sign-in at all, and the header mode's headers are only
trustworthy when nginx is the only caller. Header mode also needs BINDER_DB
set explicitly to an absolute path.
BINDER_WEB is the built frontend folder (default: web/dist in the repo).
BINDER_AI picks what answers research and summarise: anthropic (the default
when ANTHROPIC_API_KEY is set), fake (canned answers for local development
and tests, refused in header mode) or off (the default without a key).
"""

import os
import zoneinfo
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

LOOPBACK = ("127.0.0.1", "::1")
AI_MODES = ("anthropic", "fake", "off")
DEFAULT_WEB = str(Path(__file__).resolve().parent.parent / "web" / "dist")


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    auth: str
    db_path: str
    host: str
    port: int
    team: str
    tz: str = "Europe/London"  # the zone that decides what "today" is
    web_dir: str = DEFAULT_WEB  # the built frontend, see binder/web.py
    ai: str = "off"  # anthropic, fake or off; see binder/ai.py


def load_settings(env: Mapping[str, str]) -> Settings:
    auth = env.get("BINDER_AUTH", "")
    if auth not in ("", "header"):
        raise ConfigError("BINDER_AUTH=%r is not a known mode; use 'header' or leave it unset." % auth)
    host = env.get("BINDER_HOST", "127.0.0.1")
    if host not in LOOPBACK:
        raise ConfigError("Binder listens on loopback only (127.0.0.1 or ::1), not %s." % host)
    raw_port = env.get("BINDER_PORT", "8770")
    try:
        port = int(raw_port)
    except ValueError:
        raise ConfigError("BINDER_PORT=%r is not a number" % raw_port)
    db_path = env.get("BINDER_DB", "binder.db")
    if auth == "header" and not ("BINDER_DB" in env and os.path.isabs(db_path)):
        raise ConfigError("BINDER_AUTH=header needs BINDER_DB set to an absolute path.")
    tz = env.get("BINDER_TZ", "Europe/London")
    try:
        zoneinfo.ZoneInfo(tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise ConfigError("BINDER_TZ=%r is not a known time zone" % tz)
    ai = env.get("BINDER_AI", "")
    if ai not in ("",) + AI_MODES:
        raise ConfigError("BINDER_AI=%r is not a known mode; use anthropic, fake or off." % ai)
    if not ai:
        ai = "anthropic" if env.get("ANTHROPIC_API_KEY") else "off"
    if ai == "anthropic" and not env.get("ANTHROPIC_API_KEY"):
        raise ConfigError("BINDER_AI=anthropic needs ANTHROPIC_API_KEY.")
    if ai == "fake" and auth == "header":
        raise ConfigError("BINDER_AI=fake is for local development and tests, not the server.")
    return Settings(
        auth=auth,
        db_path=db_path,
        host=host,
        port=port,
        team=env.get("BINDER_TEAM", "offdesk"),
        tz=tz,
        web_dir=env.get("BINDER_WEB", DEFAULT_WEB),
        ai=ai,
    )
