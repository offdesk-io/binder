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
BINDER_BENCH_TOKEN is Binder's sign-in token for reading the Bench board
named by BINDER_BENCH_BOARD (default work) at BINDER_BENCH_URL (default
https://bench.offdesk.io). BINDER_BENCH_FILE reads a todo.md from disk
instead, for local development and tests only. Either one needs
BINDER_BENCH_CORE, the core folder of a Bench checkout, whose todo.py
parses the board. With neither, Bench is off.
BINDER_OWNERS lists who an organisation can be handled by, as
`email=Name` pairs separated by commas. It is kept out of the repo, since the
names are real people's. Unset, the list is empty and only "nobody" can be
chosen.
"""

import os
import zoneinfo
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Tuple
from urllib.parse import urlsplit

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
    tz: str = "Europe/Lisbon"  # the zone that decides what "today" is
    web_dir: str = DEFAULT_WEB  # the built frontend, see binder/web.py
    ai: str = "off"  # anthropic, fake or off; see binder/ai.py
    bench_url: str = "https://bench.offdesk.io"
    bench_token: str = field(default="", repr=False)  # a secret: kept out of repr and logs
    bench_board: str = "work"
    bench_core: str = ""  # the core/ folder of a Bench checkout, for todo.py
    bench_file: str = ""  # a todo.md to read instead of Bench, for local development
    owners: Tuple[Tuple[str, str], ...] = ()  # (email, name) pairs a record can be handled by


def parse_owners(raw: str) -> Tuple[Tuple[str, str], ...]:
    out = []
    for part in raw.split(","):
        if not part.strip():
            continue
        email, sep, name = part.partition("=")
        email, name = email.strip().lower(), name.strip()
        if not sep or "@" not in email or not name:
            raise ConfigError("BINDER_OWNERS needs email=Name pairs separated by commas, not %r." % part.strip())
        if email in (e for e, _ in out):
            raise ConfigError("BINDER_OWNERS names %s twice." % email)
        out.append((email, name))
    return tuple(out)


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
    tz = env.get("BINDER_TZ", "Europe/Lisbon")
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
    bench_token = env.get("BINDER_BENCH_TOKEN", "")
    bench_file = env.get("BINDER_BENCH_FILE", "")
    bench_core = env.get("BINDER_BENCH_CORE", "")
    bench_url = env.get("BINDER_BENCH_URL", "https://bench.offdesk.io").rstrip("/")
    if bench_file and auth == "header":
        raise ConfigError("BINDER_BENCH_FILE is for local development and tests, not the server.")
    if bench_token or bench_file:
        if not bench_core:
            raise ConfigError("Reading Bench needs BINDER_BENCH_CORE, the core folder of a Bench checkout.")
        if not os.path.isfile(os.path.join(bench_core, "todo.py")):
            raise ConfigError("BINDER_BENCH_CORE=%r has no todo.py." % bench_core)
    if bench_token:
        parts = urlsplit(bench_url)
        loopback = parts.scheme == "http" and parts.hostname in LOOPBACK  # literal addresses only
        if not (parts.scheme == "https" or loopback):
            raise ConfigError("BINDER_BENCH_URL must be https (or loopback), so the token is never sent in clear.")
    return Settings(
        auth=auth,
        db_path=db_path,
        host=host,
        port=port,
        team=env.get("BINDER_TEAM", "offdesk"),
        tz=tz,
        web_dir=env.get("BINDER_WEB", DEFAULT_WEB),
        ai=ai,
        bench_url=bench_url,
        bench_token=bench_token,
        bench_board=env.get("BINDER_BENCH_BOARD", "work"),
        bench_core=bench_core,
        bench_file=bench_file,
        owners=parse_owners(env.get("BINDER_OWNERS", "")),
    )
