"""Runtime settings, read from the environment.

LEDGER_AUTH unset or empty is local development: one fixed identity, no
sign-in. LEDGER_AUTH=header is the server behind nginx and the Offdesk
sign-in, which passes X-Offdesk-* headers. Any other value refuses to start,
so a typo cannot leave the app open. Ledger always listens on loopback only:
dev mode has no sign-in at all, and the header mode's headers are only
trustworthy when nginx is the only caller. Header mode also needs LEDGER_DB
set explicitly to an absolute path.
LEDGER_WEB is the built frontend folder (default: web/dist in the repo).
LEDGER_AI picks what answers research and summarise: anthropic (the default
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
    web_dir: str = DEFAULT_WEB  # the built frontend, see ledger/web.py
    ai: str = "off"  # anthropic, fake or off; see ledger/ai.py


def load_settings(env: Mapping[str, str]) -> Settings:
    auth = env.get("LEDGER_AUTH", "")
    if auth not in ("", "header"):
        raise ConfigError("LEDGER_AUTH=%r is not a known mode; use 'header' or leave it unset." % auth)
    host = env.get("LEDGER_HOST", "127.0.0.1")
    if host not in LOOPBACK:
        raise ConfigError("Ledger listens on loopback only (127.0.0.1 or ::1), not %s." % host)
    raw_port = env.get("LEDGER_PORT", "8770")
    try:
        port = int(raw_port)
    except ValueError:
        raise ConfigError("LEDGER_PORT=%r is not a number" % raw_port)
    db_path = env.get("LEDGER_DB", "ledger.db")
    if auth == "header" and not ("LEDGER_DB" in env and os.path.isabs(db_path)):
        raise ConfigError("LEDGER_AUTH=header needs LEDGER_DB set to an absolute path.")
    tz = env.get("LEDGER_TZ", "Europe/London")
    try:
        zoneinfo.ZoneInfo(tz)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        raise ConfigError("LEDGER_TZ=%r is not a known time zone" % tz)
    ai = env.get("LEDGER_AI", "")
    if ai not in ("",) + AI_MODES:
        raise ConfigError("LEDGER_AI=%r is not a known mode; use anthropic, fake or off." % ai)
    if not ai:
        ai = "anthropic" if env.get("ANTHROPIC_API_KEY") else "off"
    if ai == "anthropic" and not env.get("ANTHROPIC_API_KEY"):
        raise ConfigError("LEDGER_AI=anthropic needs ANTHROPIC_API_KEY.")
    if ai == "fake" and auth == "header":
        raise ConfigError("LEDGER_AI=fake is for local development and tests, not the server.")
    return Settings(
        auth=auth,
        db_path=db_path,
        host=host,
        port=port,
        team=env.get("LEDGER_TEAM", "offdesk"),
        tz=tz,
        web_dir=env.get("LEDGER_WEB", DEFAULT_WEB),
        ai=ai,
    )
