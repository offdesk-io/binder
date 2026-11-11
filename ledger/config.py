"""Runtime settings, read from the environment.

LEDGER_AUTH unset or empty is local development: one fixed identity, no
sign-in. LEDGER_AUTH=header is the server behind nginx and the Offdesk
sign-in, which passes X-Offdesk-* headers. Any other value refuses to start,
so a typo cannot leave the app open. Header mode listens on loopback only,
because the headers are only trustworthy when nginx is the only caller.
"""

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


def load_settings(env: Mapping[str, str]) -> Settings:
    auth = env.get("LEDGER_AUTH", "")
    if auth not in ("", "header"):
        raise ConfigError("LEDGER_AUTH=%r is not a known mode; use 'header' or leave it unset." % auth)
    host = env.get("LEDGER_HOST", "127.0.0.1")
    if auth == "header" and host not in LOOPBACK:
        raise ConfigError("LEDGER_AUTH=header listens on 127.0.0.1 only, not %s." % host)
    return Settings(
        auth=auth,
        db_path=env.get("LEDGER_DB", "ledger.db"),
        host=host,
        port=int(env.get("LEDGER_PORT", "8770")),
        team=env.get("LEDGER_TEAM", "offdesk"),
    )
