"""Runtime settings, read from the environment.

LEDGER_AUTH unset or empty is local development: one fixed identity, no
sign-in. LEDGER_AUTH=header is the server behind nginx and the Offdesk
sign-in, which passes X-Offdesk-* headers. Any other value refuses to start,
so a typo cannot leave the app open. Ledger always listens on loopback only:
dev mode has no sign-in at all, and the header mode's headers are only
trustworthy when nginx is the only caller. Header mode also needs LEDGER_DB
set explicitly to an absolute path.
"""

import os
import zoneinfo
from dataclasses import dataclass
from typing import Mapping

LOOPBACK = ("127.0.0.1", "::1")


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
    return Settings(
        auth=auth,
        db_path=db_path,
        host=host,
        port=port,
        team=env.get("LEDGER_TEAM", "offdesk"),
        tz=tz,
    )
