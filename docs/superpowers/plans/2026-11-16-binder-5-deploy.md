# Binder 5: Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Binder runs on the Hetzner server behind the Offdesk sign-in, and every merge to `main` that passes CI deploys itself, with a health check and a rollback.

**Architecture:** This copies Bench's pipeline (`bench/.github/workflows/deploy.yml`, `bench/scripts/deploy-*.sh`, design in `bench/docs/superpowers/specs/2026-10-29-deploy-pipeline-design.md`), cut down to one repo.
- **CI:** a GitHub Actions `test` job runs on every PR and every push. A `deploy` job runs after it on `main`. It sshes to the server with a key that can run only one command, and passes the commit id.
- **The server side:** that command checks the id and runs `deploy-on-server.sh`. The script fetches, refuses anything `origin/main` hasn't reached, and snapshots the database. It then checks out and builds the commit, restarts `binder.service`, waits for `/api/health`, and rolls back the code (and the database, if the new code migrated it) on failure.
- **Set-up and verification:** `setup-server.sh`, run by the owner, creates everything once and is safe to re-run. `check-live.sh` proves from outside that only signed-in people get in, and that forged sign-in headers do nothing.

**Tech Stack:** bash (kept compatible with bash 3.2, so the tests also run on a Mac), Python 3.9+ stdlib `sqlite3` for backups, systemd, nginx `auth_request`, certbot, GitHub Actions, and the GitHub rulesets API. Tests are pytest suites that run the real scripts over throwaway git repos, with system commands stubbed on the `PATH`.

---

## Facts this plan rests on

These were read from the server on 2026-11-17 and from both repos. Don't re-derive them.

**The server:**
- Ubuntu 26.04.1, Python 3.14.4, Node 22.22.1, nginx 1.28.3.
- Loopback ports in use: 3000 (the Offdesk sign-in service, node), 5432 (postgres), 8765 (Bench) and 3100 (stats). Binder's default port, **8770**, is free.
- `/opt/agency` is the `bench` user's home, mode `drwxr-x---`. **Binder can't live under it.** Binder gets its own system user, `binder`, with home `/opt/binder`. The code is at `/opt/binder/app`, the data at `/var/lib/binder` and the settings at `/etc/binder/binder.env`. This replaces `/opt/agency/binder` from the approved design.
- `/etc/nginx/sites-enabled/bench` is the sign-in pattern to copy:
  - `/auth/` is proxied to `127.0.0.1:3000`.
  - An internal `location = /_offdesk_check` calls `127.0.0.1:3000/auth/check`. It answers 200 with `X-Offdesk-Email`, `-Name`, `-Teams` (and `-Board` for a PA token), or 401.
  - `error_page 401 = @login` returns a 302 to `/auth/login?next=$request_uri`.
  - `location /` copies the identity headers with `auth_request_set` and then **sets every `X-Offdesk-*` header itself**, so a browser's own copies never reach the app.
  - Certbot added the 443 lines and an http-to-https block afterwards.
- The sign-in service's code isn't in Bench or `PACKAGES`. It lives in another repo. This plan uses it unchanged.

**Binder:**
- `python -m binder` reads its settings from the environment (`binder/config.py`).
  - With `BINDER_AUTH=header`, `BINDER_DB` must be absolute, `BINDER_AI=fake` is refused, and `BINDER_BENCH_FILE` is refused.
  - With `BINDER_AI` unset, AI is `anthropic` if `ANTHROPIC_API_KEY` is set and `off` otherwise, so Binder starts without a key.
  - `BINDER_WEB` defaults to `web/dist`, relative to the working directory.
  - `Settings` fields include `auth`, `db_path`, `host`, `port` and `team`.
- `GET /api/health` sits outside `guard()` and answers 200 with no headers. `GET /api/whoami` returns `{"email", "name", "teams"}`.
- `binder/db.py` raises `"database is newer than this code"` when the schema is ahead of the code. So rolling back code after a migration ran **also needs the database put back**, or the old code won't start.
- The Python 3.9 rule stays, because the owner's Mac runs 3.9. The server runs 3.14, so CI runs the suite on both.
- Tenon (`github:tiagopedras/tenon#v0.17.0`) is a public repo, so `npm ci` on the server needs no credentials. Binder is public too, so the server clones over https with no deploy key.
- `scripts/` is a Python package (`scripts/__init__.py`, `import_from_bench.py`). The deploy files go in a new top-level **`deploy/`** folder instead.

**Bench:**
- Bench's ruleset "main" is: deletion, non_fast_forward, pull_request (1 approval), required status check `test` (integration_id 15368, GitHub Actions). Its `ref_name.include` is `[]`. Binder's ruleset targets `~DEFAULT_BRANCH` explicitly.

**Modular-system rule:**
- Don't hard-code Offdesk's domain in tracked files Binder ships. The nginx template uses `@DOMAIN@`, and `setup-server.sh` takes `--domain`. The README names `binder.offdesk.io` as Offdesk's own install.
- The server's IP is never written in a tracked file. It lives only in the `DEPLOY_HOST` secret.

## Files

| Path | Role |
|---|---|
| `binder/backup.py` (new) | `python -m binder.backup <db> <dir> --prefix P (--keep-days N \| --keep N)`: an online SQLite copy, plus pruning |
| `tests/test_backup.py` (new) | its tests |
| `deploy/deploy-forced-command.sh` (new) | the only thing the pipeline's key can run: one 40-hex id, then `deploy-on-server.sh` |
| `deploy/deploy-on-server.sh` (new) | lock, checks, fetch, main-only, snapshot, checkout, build, restart, health, rollback |
| `deploy/set-deploy-key.sh` (new) | writes Binder's `restrict,command=` line in `authorized_keys` and leaves every other line alone |
| `deploy/binder.service`, `deploy/binder-backup.service`, `deploy/binder-backup.timer` (new) | the systemd units |
| `deploy/nginx-binder.conf` (new) | the nginx template, with `@DOMAIN@` |
| `deploy/binder.env.example` (new) | the template for `/etc/binder/binder.env` |
| `deploy/setup-server.sh` (new) | one-time, re-runnable set-up. Dry run unless `--apply` |
| `deploy/check-live.sh` (new) | checks from outside: sign-in required, forged headers ignored |
| `deploy/ruleset.json` (new) | the ruleset for `main` |
| `tests/test_deploy_forced.py`, `tests/test_deploy_on_server.py`, `tests/test_set_deploy_key.py`, `tests/test_deploy_files.py`, `tests/test_setup_server.py` (new) | tests for the above |
| `.github/workflows/deploy.yml` (new) | the test and deploy jobs |
| `README.md`, `CLAUDE.md` (modify) | the deploy section and rules |

All work is on branch `feature/deploy`. Run `.venv/bin/pytest -q` before each commit. Commit messages are plain, with no attribution lines.

---

### Task 1: Database backups (`binder/backup.py`)

**Files:**
- Create: `binder/backup.py`
- Test: `tests/test_backup.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_backup.py`:

```python
import os
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from binder import backup as b

NOW = datetime(2026, 11, 17, 3, 30, 0, 123456, tzinfo=timezone.utc)


def make_db(path):
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE t(x)")
    conn.execute("INSERT INTO t VALUES (1), (2)")
    conn.commit()
    return conn


def stamp_name(prefix, when):
    return "%s-%s.db" % (prefix, when.strftime(b.STAMP))


def test_the_copy_holds_every_row_while_the_app_still_has_the_database_open(tmp_path):
    conn = make_db(tmp_path / "binder.db")
    out = b.backup(tmp_path / "binder.db", tmp_path / "nightly", "nightly")
    rows = sqlite3.connect(str(out)).execute("SELECT x FROM t ORDER BY x").fetchall()
    assert rows == [(1,), (2,)]
    conn.close()


def test_the_copy_is_named_by_prefix_and_utc_time_and_only_the_owner_can_read_it(tmp_path):
    make_db(tmp_path / "binder.db").close()
    out = b.backup(tmp_path / "binder.db", tmp_path / "d", "deploy", now=NOW)
    assert out.name == "deploy-20261117T033000123456Z.db"
    assert out.stat().st_mode & 0o777 == 0o600
    assert [p.name for p in (tmp_path / "d").iterdir()] == [out.name]


def test_a_missing_database_is_an_error_and_is_not_created(tmp_path):
    with pytest.raises(FileNotFoundError):
        b.backup(tmp_path / "none.db", tmp_path / "d", "nightly")
    assert not (tmp_path / "none.db").exists()


def test_keep_days_removes_only_copies_older_than_that(tmp_path):
    for days in (0, 29, 31, 40):
        (tmp_path / stamp_name("nightly", NOW - timedelta(days=days))).write_bytes(b"")
    (tmp_path / stamp_name("deploy", NOW - timedelta(days=90))).write_bytes(b"")
    (tmp_path / "notes.txt").write_text("not a copy")
    removed = b.prune(tmp_path, "nightly", keep_days=30, now=NOW)
    assert sorted(p.name for p in removed) == sorted(
        stamp_name("nightly", NOW - timedelta(days=d)) for d in (31, 40))
    left = sorted(p.name for p in tmp_path.iterdir())
    assert stamp_name("deploy", NOW - timedelta(days=90)) in left
    assert "notes.txt" in left
    assert len(left) == 4


def test_keep_n_keeps_the_newest_n(tmp_path):
    for hours in range(5):
        (tmp_path / stamp_name("deploy", NOW - timedelta(hours=hours))).write_bytes(b"")
    b.prune(tmp_path, "deploy", keep=2, now=NOW)
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted(
        stamp_name("deploy", NOW - timedelta(hours=h)) for h in (0, 1))


def test_the_command_prints_the_copy_and_prunes(tmp_path, capsys):
    make_db(tmp_path / "binder.db").close()
    old = tmp_path / "n" / stamp_name("nightly", datetime.now(timezone.utc) - timedelta(days=60))
    old.parent.mkdir()
    old.write_bytes(b"")
    rc = b.main([str(tmp_path / "binder.db"), str(tmp_path / "n"), "--prefix", "nightly", "--keep-days", "30"])
    assert rc == 0
    printed = capsys.readouterr().out.strip()
    assert os.path.isfile(printed) and printed.startswith(str(tmp_path / "n" / "nightly-"))
    assert not old.exists()


def test_the_command_exits_2_without_a_database(tmp_path, capsys):
    assert b.main([str(tmp_path / "none.db"), str(tmp_path / "n")]) == 2
    assert "no database" in capsys.readouterr().err
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_backup.py -q`
Expected: FAIL with `ImportError: cannot import name 'backup' from 'binder'`.

- [ ] **Step 3: Write `binder/backup.py`**

```python
"""Copy Binder's SQLite database while the app runs, and prune old copies.

    python -m binder.backup <db> <dir> [--prefix nightly] [--keep-days N | --keep N]

Prints the path of the new copy. It uses SQLite's online backup, so a copy
taken in the middle of a write is still a consistent database. Copies are
named <prefix>-<UTC time>.db and only the owner can read them. Pruning only
looks at files with this prefix and a time it can read, so the migration
copies db.py writes, and anything else in the folder, are left alone.

The nightly timer keeps 30 days of nightly copies. A deploy keeps its last
10 deploy copies, so a failed deploy that migrated the database can be put back.
"""

import argparse
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

STAMP = "%Y%m%dT%H%M%S%fZ"


def backup(db: Path, folder: Path, prefix: str, now: Optional[datetime] = None) -> Path:
    if not db.is_file():
        raise FileNotFoundError(str(db))
    now = now or datetime.now(timezone.utc)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / ("%s-%s.db" % (prefix, now.strftime(STAMP)))
    part = folder / (target.name + ".part")
    src = sqlite3.connect(str(db))
    try:
        dst = sqlite3.connect(str(part))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    part.chmod(0o600)
    part.replace(target)
    return target


def _stamp(path: Path, prefix: str) -> Optional[datetime]:
    name = path.name
    if not (name.startswith(prefix + "-") and name.endswith(".db")):
        return None
    try:
        return datetime.strptime(name[len(prefix) + 1:-3], STAMP).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def prune(folder: Path, prefix: str, keep_days: Optional[int] = None,
          keep: Optional[int] = None, now: Optional[datetime] = None) -> List[Path]:
    copies = []
    for path in folder.glob(prefix + "-*.db"):
        when = _stamp(path, prefix)
        if when is not None:
            copies.append((when, path))
    copies.sort()
    if keep is not None:
        old = copies[:-keep] if keep > 0 else copies
    elif keep_days is not None:
        cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=keep_days)
        old = [c for c in copies if c[0] < cutoff]
    else:
        old = []
    for _, path in old:
        path.unlink()
    return [path for _, path in old]


def _positive(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("must be 1 or more")
    return value


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m binder.backup", description=__doc__.splitlines()[0])
    parser.add_argument("db")
    parser.add_argument("folder")
    parser.add_argument("--prefix", default="nightly")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--keep-days", type=_positive)
    group.add_argument("--keep", type=_positive)
    args = parser.parse_args(argv)
    try:
        path = backup(Path(args.db), Path(args.folder), args.prefix)
    except FileNotFoundError:
        print("no database at %s" % args.db, file=sys.stderr)
        return 2
    prune(Path(args.folder), args.prefix, keep_days=args.keep_days, keep=args.keep)
    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `.venv/bin/pytest tests/test_backup.py -q`
Expected: `7 passed`.

- [ ] **Step 5: Run the whole suite and commit**

```bash
.venv/bin/pytest -q
git add binder/backup.py tests/test_backup.py
git commit -m "Backups: online SQLite copy with pruning by age or count"
```

---

### Task 2: The forced command (`deploy/deploy-forced-command.sh`)

**Files:**
- Create: `deploy/deploy-forced-command.sh`
- Test: `tests/test_deploy_forced.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_deploy_forced.py`:

```python
"""deploy-forced-command.sh, the only thing the pipeline's deploy key can run,
deploys one full commit id and refuses everything else. BINDER_DEPLOY_SCRIPT
points it at a stub that records its arguments, so nothing is deployed;
sshd's `restrict` stops a real client from setting that variable."""

import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FORCED = ROOT / "deploy" / "deploy-forced-command.sh"
SHA = "0123456789abcdef0123456789abcdef01234567"


def run(tmp_path, original_command):
    out = tmp_path / "args"
    stub = tmp_path / "stub.sh"
    stub.write_text('#!/usr/bin/env bash\nprintf "%%s\\n" "$*" > "%s"\n' % out)
    env = dict(os.environ, BINDER_DEPLOY_SCRIPT=str(stub))
    env.pop("SSH_ORIGINAL_COMMAND", None)
    if original_command is not None:
        env["SSH_ORIGINAL_COMMAND"] = original_command
    rc = subprocess.run(["bash", str(FORCED)], env=env, capture_output=True).returncode
    return rc, (out.read_text().strip() if out.exists() else None)


def test_a_full_commit_id_is_deployed(tmp_path):
    assert run(tmp_path, SHA) == (0, SHA)


@pytest.mark.parametrize("command", [
    None,                     # an interactive login
    "",
    "bash",
    "main",
    SHA[:9],
    SHA.upper(),
    SHA + " x",
    SHA + ";id",
    "x" + SHA,
    SHA + "\n" + SHA,
])
def test_anything_else_is_refused_and_nothing_runs(tmp_path, command):
    assert run(tmp_path, command) == (2, None)
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_deploy_forced.py -q`
Expected: FAIL, since bash can't open `deploy/deploy-forced-command.sh` (exit 127, not 0 or 2).

- [ ] **Step 3: Write `deploy/deploy-forced-command.sh`**

```bash
#!/usr/bin/env bash
# The only thing the pipeline's deploy key can run. root's authorized_keys
# names it with `restrict,command="..."` (see set-deploy-key.sh), so whatever
# the client asks for arrives here as SSH_ORIGINAL_COMMAND and is never run
# as a command.
#
# It passes one full 40-character commit id to the installed copy of
# deploy-on-server.sh and refuses everything else. That script refuses,
# after its fetch, a commit that origin/main has not reached.
set -uo pipefail
DEPLOY_SCRIPT="${BINDER_DEPLOY_SCRIPT:-/usr/local/lib/binder-deploy/deploy-on-server.sh}"
ref="${SSH_ORIGINAL_COMMAND-}"

if ! [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refused: this key only deploys one full commit id." >&2
  exit 2
fi

exec bash "$DEPLOY_SCRIPT" "$ref"
```

Then: `chmod 755 deploy/deploy-forced-command.sh`

- [ ] **Step 4: Run the tests to see them pass**

Run: `.venv/bin/pytest tests/test_deploy_forced.py -q`
Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add deploy/deploy-forced-command.sh tests/test_deploy_forced.py
git commit -m "Deploy: forced command that accepts one full commit id"
```

---

### Task 3: The server half of a deploy (`deploy/deploy-on-server.sh`)

**Files:**
- Create: `deploy/deploy-on-server.sh`
- Test: `tests/test_deploy_on_server.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_deploy_on_server.py`:

```python
"""deploy-on-server.sh over throwaway git repos, with runuser, getent, flock,
npm, systemctl, curl and sleep stubbed on the PATH, so nothing is built or
restarted for real.

The origin's main runs A, B, "B BAD", "B BAD MIGRATE"; a side branch holds C,
off A. The server checkout starts on A. The stubbed health check fails while
the checked-out f.txt says BAD, and the stubbed service start moves the
database to version 5 while it says MIGRATE, as a real migration would."""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "deploy" / "deploy-on-server.sh"

MIGRATE = ("import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); "
           "c.execute('PRAGMA user_version = 5'); c.execute('CREATE TABLE added(x)'); c.commit()")

STUBS = {
    # runuser -u binder -- env HOME=... cmd: run the command as whoever we are.
    "runuser": 'while [ "$1" != -- ]; do shift; done; shift; exec "$@"',
    "getent": 'echo "binder:x:1000:1000::$STUB_HOME:/bin/bash"',
    "flock": "exit 0",
    "sleep": "exit 0",
    "npm": 'echo "npm $*" >> "$STUB_LOG"',
    "curl": 'if grep -q BAD "$STUB_APP/f.txt"; then printf 500; else printf 200; fi',
    "systemctl": (
        'echo "systemctl $*" >> "$STUB_LOG"\n'
        'case "$1" in restart|start)\n'
        '  if grep -q MIGRATE "$STUB_APP/f.txt"; then "$STUB_PY" -c "$STUB_MIGRATE" "$STUB_DB"; fi ;;\n'
        'esac'),
}


def git(cwd, *args):
    return subprocess.run(["git", "-C", str(cwd), *args], check=True,
                          capture_output=True, text=True).stdout.strip()


def commit(repo, text):
    (repo / "f.txt").write_text(text + "\n")
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", text)
    return git(repo, "rev-parse", "HEAD")


def write_exe(path, body):
    path.write_text("#!/bin/sh\n" + body + "\n")
    path.chmod(0o755)


def db_version(path):
    conn = sqlite3.connect(str(path))
    try:
        return conn.execute("PRAGMA user_version").fetchone()[0]
    finally:
        conn.close()


@pytest.fixture
def world(tmp_path):
    w = SimpleNamespace()
    work = tmp_path / "work"
    (work / "web").mkdir(parents=True)
    (work / "web" / ".keep").write_text("")
    git(work, "init", "-q", "-b", "main")
    w.a = commit(work, "A")
    w.b = commit(work, "B")
    w.bad = commit(work, "B BAD")
    w.bad_migrate = commit(work, "B BAD MIGRATE")
    git(work, "switch", "-q", "-c", "side", w.a)
    w.c = commit(work, "C")
    git(work, "switch", "-q", "main")
    origin = tmp_path / "origin.git"
    subprocess.run(["git", "clone", "-q", "--bare", str(work), str(origin)], check=True)
    w.app = tmp_path / "app"
    subprocess.run(["git", "clone", "-q", str(origin), str(w.app)], check=True)
    git(w.app, "checkout", "-q", "--detach", w.a)

    venv = w.app / ".venv" / "bin"
    venv.mkdir(parents=True)
    write_exe(venv / "python", 'PYTHONPATH="%s" exec "%s" "$@"' % (ROOT, sys.executable))
    write_exe(venv / "pip", 'echo "pip $*" >> "$STUB_LOG"')

    stubs = tmp_path / "stubs"
    stubs.mkdir()
    for name, body in STUBS.items():
        write_exe(stubs / name, body)

    data = tmp_path / "data"
    data.mkdir()
    w.db = data / "binder.db"
    conn = sqlite3.connect(str(w.db))
    conn.execute("CREATE TABLE t(x)")
    conn.execute("INSERT INTO t VALUES (42)")
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    conn.close()
    w.snaps = data / "deploys"
    w.log = tmp_path / "log"
    w.log.write_text("")

    env = dict(os.environ)
    env.update({
        "PATH": "%s:%s" % (stubs, os.environ["PATH"]),
        "STUB_HOME": str(tmp_path), "STUB_LOG": str(w.log), "STUB_APP": str(w.app),
        "STUB_DB": str(w.db), "STUB_PY": sys.executable, "STUB_MIGRATE": MIGRATE,
        "BINDER_APP": str(w.app), "BINDER_DB_PATH": str(w.db), "BINDER_SNAPSHOTS": str(w.snaps),
        "BINDER_DEPLOY_LOCK": str(tmp_path / "lock"), "BINDER_HEALTH_WAIT": "2",
    })
    w.run = lambda ref: subprocess.run(["bash", str(SCRIPT), ref], env=env,
                                       capture_output=True, text=True)
    w.head = lambda: git(w.app, "rev-parse", "HEAD")
    w.calls = lambda: w.log.read_text()
    return w


def test_deploys_a_commit_on_main_builds_restarts_and_snapshots_the_database(world):
    r = world.run(world.b)
    assert r.returncode == 0, r.stdout + r.stderr
    assert world.head() == world.b
    calls = world.calls()
    assert "pip install" in calls
    assert "npm ci" in calls and "npm run build" in calls
    assert "systemctl restart binder.service" in calls
    assert len(list(world.snaps.glob("deploy-*.db"))) == 1


def test_refuses_a_commit_main_has_not_reached(world):
    r = world.run(world.c)
    assert r.returncode != 0
    assert "not on origin/main" in r.stderr
    assert world.head() == world.a
    assert "systemctl" not in world.calls()


@pytest.mark.parametrize("ref", ["", "main", "abc1234", "B; true"])
def test_refuses_anything_but_a_full_commit_id(world, ref):
    r = world.run(ref)
    assert r.returncode != 0
    assert world.head() == world.a
    assert world.calls() == ""


def test_refuses_a_checkout_with_edited_tracked_files(world):
    (world.app / "f.txt").write_text("edited on the server\n")
    r = world.run(world.b)
    assert r.returncode != 0
    assert "uncommitted" in r.stderr
    assert world.head() == world.a
    assert "systemctl" not in world.calls()


def test_a_failed_health_check_rolls_the_code_back(world):
    r = world.run(world.bad)
    assert r.returncode == 1
    assert world.head() == world.a
    calls = world.calls()
    assert "systemctl stop binder.service" in calls
    assert "systemctl start binder.service" in calls
    assert "Rolled back; Binder answers." in r.stdout
    assert db_version(world.db) == 1


def test_a_failed_deploy_that_migrated_puts_the_database_back(world):
    r = world.run(world.bad_migrate)
    assert r.returncode == 1
    assert world.head() == world.a
    assert "restoring" in r.stdout
    assert db_version(world.db) == 1
    conn = sqlite3.connect(str(world.db))
    assert conn.execute("SELECT x FROM t").fetchall() == [(42,)]
    assert conn.execute("SELECT name FROM sqlite_master WHERE name = 'added'").fetchall() == []
    conn.close()


def test_the_first_deploy_has_no_database_to_snapshot(world):
    world.db.unlink()
    r = world.run(world.b)
    assert r.returncode == 0, r.stdout + r.stderr
    assert not world.snaps.exists() or not list(world.snaps.iterdir())
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_deploy_on_server.py -q`
Expected: every test FAILS, since bash can't open `deploy/deploy-on-server.sh`. The parametrised refusal tests may pass by accident (exit 127 counts as non-zero), and that's fine.

- [ ] **Step 3: Write `deploy/deploy-on-server.sh`**

```bash
#!/usr/bin/env bash
# Deploys one commit of Binder on the server, as root. Called by
# deploy-forced-command.sh (the pipeline's key), or by hand:
#
#   bash /usr/local/lib/binder-deploy/deploy-on-server.sh <full commit id>
#
# Refuses a commit origin/main has not reached, and a checkout with edits
# to tracked files. Before the restart it snapshots the database. If Binder
# does not answer /api/health afterwards, it puts the previous commit back,
# and the snapshot too when the new code changed the database's version
# (old code refuses a newer database). Writes made between the snapshot and
# the rollback are lost in that case only.
#
# The paths can be overridden for the tests; on the server they never are.
# Kept to bash 3.2 so the tests run on a Mac as well.
set -uo pipefail
REF="${1-}"
APP="${BINDER_APP:-/opt/binder/app}"
DB="${BINDER_DB_PATH:-/var/lib/binder/binder.db}"
SNAPS="${BINDER_SNAPSHOTS:-/var/lib/binder/deploys}"
HEALTH="${BINDER_HEALTH_URL:-http://127.0.0.1:8770/api/health}"
LOCK="${BINDER_DEPLOY_LOCK:-/run/lock/binder-deploy.lock}"
WAIT="${BINDER_HEALTH_WAIT:-20}"
UNIT=binder.service

say() { printf '%s\n' "$*"; }
die() { say "ABORT: $*" >&2; exit 1; }

[[ "$REF" =~ ^[0-9a-f]{40}$ ]] || die "give one full 40-character commit id"

BHOME="$(getent passwd binder | cut -d: -f6)"
as_binder() { runuser -u binder -- env HOME="$BHOME" "$@"; }
git_app() { as_binder git -C "$APP" "$@"; }
py() { as_binder "$APP/.venv/bin/python" "$@"; }
db_version() {
  py -c 'import sqlite3, sys; print(sqlite3.connect(sys.argv[1]).execute("PRAGMA user_version").fetchone()[0])' "$DB"
}

# One deploy at a time. A second one waits up to ten minutes, then gives up.
exec 9>"$LOCK"
flock -w 600 9 || die "another deploy has held the lock for ten minutes"

[ -d "$APP/.git" ] || die "$APP is not a git checkout"
OLD="$(git_app rev-parse HEAD)" || die "cannot read HEAD of $APP"
[ -z "$(git_app status --porcelain --untracked-files=no)" ] \
  || die "$APP has uncommitted changes to tracked files; deploying would overwrite them"

say "== Fetch"
git_app fetch --prune origin 2>&1 | sed 's/^/  /' || die "fetch failed"
git_app cat-file -e "$REF^{commit}" 2>/dev/null || die "${REF:0:9} is not on origin"
git_app merge-base --is-ancestor "$REF" refs/remotes/origin/main \
  || die "${REF:0:9} is not on origin/main"
say "  from $OLD"
say "  to   $REF"

SNAP="" OLD_VERSION=""
if [ -f "$DB" ]; then
  say "== Snapshot"
  SNAP="$(py -m binder.backup "$DB" "$SNAPS" --prefix deploy --keep 10)" || die "could not snapshot $DB"
  OLD_VERSION="$(db_version)" || die "could not read the version of $DB"
  say "  $SNAP (version $OLD_VERSION)"
fi

build() {
  say "== Build"
  as_binder "$APP/.venv/bin/pip" install --quiet --disable-pip-version-check -e "$APP" 2>&1 | sed 's/^/  /' \
    && as_binder bash -c "cd '$APP/web' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent" 2>&1 | sed 's/^/  /'
}

health() {
  say "== Waiting for $HEALTH ($WAIT s)"
  local i code=""
  for i in $(seq 1 "$WAIT"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH" || true)"
    if [ "$code" = 200 ]; then say "  200 after $i s"; return 0; fi
    sleep 1
  done
  say "  last answer: ${code:-none}"
  return 1
}

say "== Checkout"
git_app checkout --quiet --detach "$REF" || die "checkout failed; still on $OLD"

if build && systemctl restart "$UNIT" && health; then
  say "Deployed $REF"
  exit 0
fi

say
say "== FAILED, rolling back to $OLD"
systemctl stop "$UNIT"
git_app checkout --quiet -- . && git_app checkout --quiet --detach "$OLD" \
  || say "  rollback checkout failed; check $APP by hand"
if [ -n "$SNAP" ]; then
  NOW_VERSION="$(db_version)"
  if [ "$NOW_VERSION" != "$OLD_VERSION" ]; then
    say "  the new code moved the database from version $OLD_VERSION to $NOW_VERSION; restoring $SNAP"
    as_binder cp -f "$SNAP" "$DB" && as_binder rm -f "$DB-wal" "$DB-shm" \
      || say "  restoring the snapshot failed; copy $SNAP over $DB by hand"
  fi
fi
build || say "  rebuild failed"
systemctl start "$UNIT"
if health; then
  say "Rolled back; Binder answers."
else
  say "Rolled back, but Binder is not answering. Check: journalctl -u $UNIT -n 50"
fi
exit 1
```

Then: `chmod 755 deploy/deploy-on-server.sh`

- [ ] **Step 4: Run the tests to see them pass**

Run: `.venv/bin/pytest tests/test_deploy_on_server.py -q`
Expected: `10 passed`. If a failure shows `flock` or `getent` running for real, the stub directory isn't first on the `PATH`, so check the fixture's `env["PATH"]`.

- [ ] **Step 5: Run the whole suite and commit**

```bash
.venv/bin/pytest -q
git add deploy/deploy-on-server.sh tests/test_deploy_on_server.py
git commit -m "Deploy: server script with main-only check, snapshot, health check and rollback"
```

---

### Task 4: The deploy key line (`deploy/set-deploy-key.sh`)

**Files:**
- Create: `deploy/set-deploy-key.sh`
- Test: `tests/test_set_deploy_key.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_set_deploy_key.py`:

```python
"""set-deploy-key.sh writes Binder's forced-command line into an
authorized_keys file, replaces an earlier Binder line, and leaves every
other line (people's keys, Bench's deploy key) exactly as it was."""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SETKEY = ROOT / "deploy" / "set-deploy-key.sh"
KEY1 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyOneExampleKeyOneExample binder-deploy"
KEY2 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyTwoExampleKeyTwoExample binder-deploy"
PERSON = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPerson someone@example.com"
BENCH = 'restrict,command="/usr/local/lib/bench-deploy/deploy-forced-command.sh" ssh-ed25519 AAAAbench'
LINE = 'restrict,command="/usr/local/lib/binder-deploy/deploy-forced-command.sh" '


def run(path, key):
    return subprocess.run(["bash", str(SETKEY), str(path), key], capture_output=True, text=True)


@pytest.fixture
def keys(tmp_path):
    f = tmp_path / ".ssh" / "authorized_keys"
    f.parent.mkdir()
    f.write_text(PERSON + "\n" + BENCH + "\n")
    return f


def test_adds_the_line_and_keeps_every_other_key(keys):
    r = run(keys, KEY1)
    assert r.returncode == 0, r.stderr
    assert keys.read_text().splitlines() == [PERSON, BENCH, LINE + KEY1]
    assert keys.stat().st_mode & 0o777 == 0o600


def test_running_again_replaces_the_binder_line_only(keys):
    run(keys, KEY1)
    assert run(keys, KEY2).returncode == 0
    assert keys.read_text().splitlines() == [PERSON, BENCH, LINE + KEY2]


def test_creates_the_file_when_there_is_none(tmp_path):
    f = tmp_path / "new" / "authorized_keys"
    assert run(f, KEY1).returncode == 0
    assert f.read_text().splitlines() == [LINE + KEY1]


@pytest.mark.parametrize("bad", [
    "",
    "ssh-rsa AAAAB3NzaC1yc2E someone",
    KEY1 + "\n" + KEY2,
    'command="/bin/sh" ' + KEY1,
    KEY1 + " extra words",
])
def test_refuses_anything_but_one_ed25519_public_key(keys, bad):
    before = keys.read_text()
    assert run(keys, bad).returncode == 2
    assert keys.read_text() == before
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_set_deploy_key.py -q`
Expected: FAIL (exit 127, the script doesn't exist yet).

- [ ] **Step 3: Write `deploy/set-deploy-key.sh`**

```bash
#!/usr/bin/env bash
# Lets one key run Binder's deploy and nothing else. Writes
#   restrict,command="/usr/local/lib/binder-deploy/deploy-forced-command.sh" <key>
# into the given authorized_keys, replacing an earlier Binder line, and leaves
# every other line (people's keys, Bench's deploy key) as it was.
#
#   deploy/set-deploy-key.sh /root/.ssh/authorized_keys 'ssh-ed25519 AAAA... binder-deploy'
#
# setup-server.sh calls it for --deploy-key.
set -euo pipefail
FILE="${1:?usage: set-deploy-key.sh <authorized_keys> <ssh-ed25519 public key>}"
KEY="${2-}"
FORCED=/usr/local/lib/binder-deploy/deploy-forced-command.sh
MARK=binder-deploy/deploy-forced-command.sh

if ! [[ "$KEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [A-Za-z0-9@._-]+)?$ ]]; then
  echo "Expected one ssh-ed25519 public key." >&2
  exit 2
fi

install -d -m 700 "$(dirname "$FILE")"
touch "$FILE"
chmod 600 "$FILE"
{ grep -vF "$MARK" "$FILE" || true; printf 'restrict,command="%s" %s\n' "$FORCED" "$KEY"; } > "$FILE.new"
chmod 600 "$FILE.new"
mv "$FILE.new" "$FILE"
echo "deploy key set in $FILE"
```

Then: `chmod 755 deploy/set-deploy-key.sh`

- [ ] **Step 4: Run the tests to see them pass**

Run: `.venv/bin/pytest tests/test_set_deploy_key.py -q`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add deploy/set-deploy-key.sh tests/test_set_deploy_key.py
git commit -m "Deploy: write Binder's forced-command key line, leaving other keys alone"
```

---

### Task 5: The server's files (systemd units, nginx template, settings template)

**Files:**
- Create: `deploy/binder.service`, `deploy/binder-backup.service`, `deploy/binder-backup.timer`, `deploy/nginx-binder.conf`, `deploy/binder.env.example`
- Test: `tests/test_deploy_files.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_deploy_files.py`:

```python
"""The files setup-server.sh installs agree with each other and with
binder/config.py, and the nginx block never lets a browser's own sign-in
headers reach Binder."""

from pathlib import Path

from binder.config import load_settings

DEPLOY = Path(__file__).resolve().parents[1] / "deploy"


def read(name):
    return (DEPLOY / name).read_text()


def block(text, header):
    """The body of the first `header { ... }` block."""
    start = text.index(header)
    i = text.index("{", start) + 1
    depth, j = 1, i
    while depth:
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
        j += 1
    return text[i:j - 1]


def lines(body):
    return [ln.strip() for ln in body.splitlines() if ln.strip() and not ln.strip().startswith("#")]


def env_example():
    env = {}
    for ln in lines(read("binder.env.example")):
        key, _, value = ln.partition("=")
        env[key] = value
    return env


def test_the_settings_template_is_a_valid_server_configuration():
    s = load_settings(env_example())
    assert s.auth == "header"
    assert s.db_path == "/var/lib/binder/binder.db"
    assert (s.host, s.port) == ("127.0.0.1", 8770)
    assert s.team == "offdesk"
    assert s.ai == "off"  # until the owner adds ANTHROPIC_API_KEY
    assert not s.bench_token  # the Bench link starts off


def test_nginx_overwrites_every_sign_in_header_and_drops_authorization():
    app = lines(block(read("nginx-binder.conf"), "location / "))
    assert "auth_request /_offdesk_check;" in app
    for header, var in [("Email", "email"), ("Name", "name"), ("Teams", "teams")]:
        assert "auth_request_set $offdesk_%s $upstream_http_x_offdesk_%s;" % (var, var) in app
        assert "proxy_set_header X-Offdesk-%s $offdesk_%s;" % (header, var) in app
    assert 'proxy_set_header X-Offdesk-Board "";' in app
    assert 'proxy_set_header Authorization "";' in app
    assert "error_page 401 = @login;" in app
    assert "proxy_pass http://127.0.0.1:8770;" in app


def test_nginx_asks_the_sign_in_service_internally_and_names_no_domain():
    conf = read("nginx-binder.conf")
    check = lines(block(conf, "location = /_offdesk_check"))
    assert "internal;" in check
    assert "proxy_pass http://127.0.0.1:3000/auth/check;" in check
    assert "proxy_pass_request_body off;" in check
    assert "proxy_pass http://127.0.0.1:3000;" in lines(block(conf, "location /auth/"))
    assert "server_name @DOMAIN@;" in lines(block(conf, "server {"))
    assert "offdesk.io" not in conf


def test_the_service_runs_binder_as_its_own_user_with_only_its_data_writable():
    unit = lines(read("binder.service"))
    for want in ["User=binder", "Group=binder", "WorkingDirectory=/opt/binder/app",
                 "EnvironmentFile=/etc/binder/binder.env",
                 "ExecStart=/opt/binder/app/.venv/bin/python -m binder",
                 "ProtectSystem=strict", "ReadWritePaths=/var/lib/binder", "NoNewPrivileges=true"]:
        assert want in unit


def test_the_nightly_backup_keeps_30_days_and_runs_late_runs_on_boot():
    service = lines(read("binder-backup.service"))
    assert ("ExecStart=/opt/binder/app/.venv/bin/python -m binder.backup /var/lib/binder/binder.db "
            "/var/lib/binder/nightly --prefix nightly --keep-days 30") in service
    assert "User=binder" in service
    timer = lines(read("binder-backup.timer"))
    assert any(ln.startswith("OnCalendar=") for ln in timer)
    assert "Persistent=true" in timer


def test_the_deploy_script_defaults_match_the_server_layout():
    script = read("deploy-on-server.sh")
    assert 'APP="${BINDER_APP:-/opt/binder/app}"' in script
    assert 'DB="${BINDER_DB_PATH:-/var/lib/binder/binder.db}"' in script
    assert 'HEALTH="${BINDER_HEALTH_URL:-http://127.0.0.1:8770/api/health}"' in script
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_deploy_files.py -q`
Expected: FAIL with `FileNotFoundError` for `deploy/binder.env.example` and the others. The last test passes, because Task 3 already wrote the script.

- [ ] **Step 3: Write the five files**

`deploy/binder.env.example`:

```
# /etc/binder/binder.env: Binder's settings on the server (root, mode 600).
# setup-server.sh writes it from this file once and never overwrites it.
# Every setting is described in binder/config.py.
BINDER_AUTH=header
BINDER_DB=/var/lib/binder/binder.db
BINDER_TEAM=offdesk
# Research and summarise stay off until this is filled in. Restart after:
#   systemctl restart binder.service
ANTHROPIC_API_KEY=
# The Bench link (plan 4) stays off until Bench issues Binder a token:
# BINDER_BENCH_TOKEN=
# BINDER_BENCH_CORE=
```

`deploy/binder.service`:

```
# Binder on 127.0.0.1:8770, reached only through nginx (nginx-binder.conf).
# Installed by setup-server.sh to /etc/systemd/system/binder.service.
[Unit]
Description=Binder
After=network-online.target
Wants=network-online.target

[Service]
User=binder
Group=binder
WorkingDirectory=/opt/binder/app
EnvironmentFile=/etc/binder/binder.env
ExecStart=/opt/binder/app/.venv/bin/python -m binder
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/binder

[Install]
WantedBy=multi-user.target
```

`deploy/binder-backup.service`:

```
# A copy of Binder's database, run by binder-backup.timer. Keeps 30 days.
[Unit]
Description=Binder nightly database copy

[Service]
Type=oneshot
User=binder
Group=binder
ExecStart=/opt/binder/app/.venv/bin/python -m binder.backup /var/lib/binder/binder.db /var/lib/binder/nightly --prefix nightly --keep-days 30
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/binder
```

`deploy/binder-backup.timer`:

```
# Every night at 03:30 Lisbon time. Persistent: a night missed while the
# server was down runs at the next boot.
[Unit]
Description=Binder nightly database copy

[Timer]
OnCalendar=*-*-* 03:30:00 Europe/Lisbon
Persistent=true

[Install]
WantedBy=timers.target
```

`deploy/nginx-binder.conf`:

```
# Binder behind the Offdesk sign-in. setup-server.sh writes this to
# /etc/nginx/sites-available/binder with @DOMAIN@ replaced, once; certbot then
# adds the 443 lines and the http-to-https redirect, so the installed file is
# never overwritten. After changing this template, apply the change there by hand.
#
# The sign-in service listens on 127.0.0.1:3000 and Binder on 127.0.0.1:8770.
# Neither is reachable from outside except through here. Sign-in only works
# over https, because the cookie is Secure.
server {
    listen 80;
    listen [::]:80;
    server_name @DOMAIN@;

    # A pasted email or call note for summarise.
    client_max_body_size 2m;

    # Sign-in pages, link, sign-out. Open to anyone, since these are how a
    # stranger becomes signed in.
    location /auth/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        # The sign-in service rate-limits by this address. Set rather than
        # appended, so a client can't put its own in front.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # What auth_request asks before every other request: 200 with the
    # X-Offdesk-* headers, or 401. Anything else becomes a 500, so nobody
    # gets through when the sign-in service is down.
    location = /_offdesk_check {
        internal;
        proxy_pass http://127.0.0.1:3000/auth/check;
        proxy_method GET;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Cookie $http_cookie;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location @login {
        return 302 /auth/login?next=$request_uri;
    }

    location / {
        auth_request /_offdesk_check;
        auth_request_set $offdesk_email $upstream_http_x_offdesk_email;
        auth_request_set $offdesk_name $upstream_http_x_offdesk_name;
        auth_request_set $offdesk_teams $upstream_http_x_offdesk_teams;
        error_page 401 = @login;

        # Every sign-in header is set here on every request. An empty value
        # drops the header, so whatever the browser sent under these names
        # never reaches Binder, which trusts them (BINDER_AUTH=header).
        proxy_set_header X-Offdesk-Email $offdesk_email;
        proxy_set_header X-Offdesk-Name $offdesk_name;
        proxy_set_header X-Offdesk-Teams $offdesk_teams;
        proxy_set_header X-Offdesk-Board "";
        proxy_set_header Authorization "";

        proxy_pass http://127.0.0.1:8770;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        # A research brief can take a couple of minutes.
        proxy_read_timeout 300s;
    }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `.venv/bin/pytest tests/test_deploy_files.py -q`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add deploy/binder.env.example deploy/binder.service deploy/binder-backup.service deploy/binder-backup.timer deploy/nginx-binder.conf tests/test_deploy_files.py
git commit -m "Deploy: systemd units, nightly backup timer, nginx template and settings template"
```

---

### Task 6: Server set-up (`deploy/setup-server.sh`)

**Files:**
- Create: `deploy/setup-server.sh`
- Test: `tests/test_setup_server.py`

The script is run by the owner, piped over ssh. It clones the public repo first and installs every other file from that checkout, so nothing else has to be copied. That means it has to be run **after this branch is merged**. Each step looks before it acts. Without `--apply` it only reports.

- [ ] **Step 1: Write the failing tests**

`tests/test_setup_server.py`:

```python
"""The parts of setup-server.sh that can run off the server: its arguments,
the root check, and that a dry run says so before anything else. The rest is
checked on the server by its own dry run (README, Deploy)."""

import os
import subprocess
from pathlib import Path

import pytest

DEPLOY = Path(__file__).resolve().parents[1] / "deploy"
SETUP = DEPLOY / "setup-server.sh"


def run(*args):
    return subprocess.run(["bash", str(SETUP), *args], capture_output=True, text=True)


@pytest.mark.parametrize("script", sorted(p.name for p in DEPLOY.glob("*.sh")))
def test_every_deploy_script_parses(script):
    subprocess.run(["bash", "-n", str(DEPLOY / script)], check=True)


@pytest.mark.parametrize("args", [[], ["--domain"], ["--domain", "not a domain"], ["--domain", "x;rm"]])
def test_it_needs_a_domain(args):
    r = run(*args)
    assert r.returncode == 2
    assert "--domain" in r.stderr


def test_it_refuses_unknown_arguments():
    r = run("--domain", "binder.example.com", "--force")
    assert r.returncode == 2
    assert "unknown argument" in r.stderr


@pytest.mark.skipif(os.geteuid() == 0, reason="the check is for a non-root user")
def test_apply_needs_root():
    r = run("--domain", "binder.example.com", "--apply")
    assert r.returncode == 2
    assert "root" in r.stderr


def test_a_dry_run_says_so_first():
    r = run("--domain", "binder.example.com")
    assert r.stdout.splitlines()[0].startswith("DRY RUN")
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest tests/test_setup_server.py -q`
Expected: the `setup-server.sh` tests FAIL (exit 127). The parse tests for the earlier scripts pass.

- [ ] **Step 3: Write `deploy/setup-server.sh`**

```bash
#!/usr/bin/env bash
# Sets Binder up on an Ubuntu server, or checks a set-up that is already
# there. Safe to run again: each step looks first and changes only what is
# missing or out of date. Run as root. Without --apply it only reports.
#
#   ssh root@<host> 'bash -s -- --domain <name>' < deploy/setup-server.sh
#   ssh root@<host> 'bash -s -- --domain <name> --apply' < deploy/setup-server.sh
#   ... --apply --tls                  once DNS for <name> points at the server
#   ... --apply --deploy-key '<ssh-ed25519 public key>'
#
# It clones the public repo to /opt/binder/app and installs every other file
# from that checkout, so it runs piped over ssh with nothing copied first.
# Run it again after changing deploy-on-server.sh or deploy-forced-command.sh:
# the deploy key runs the installed copies in /usr/local/lib/binder-deploy/,
# never the checkout's, so a merge to main cannot change what root runs.
set -uo pipefail

REPO_URL=https://github.com/offdesk-io/binder.git
HOME_DIR=/opt/binder
APP=$HOME_DIR/app
DATA=/var/lib/binder
ETC=/etc/binder
LIB=/usr/local/lib/binder-deploy
SITE=/etc/nginx/sites-available/binder
UNITS=/etc/systemd/system

APPLY=0 TLS=0 DOMAIN="" KEY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --tls) TLS=1 ;;
    --domain) DOMAIN="${2-}"; shift ;;
    --deploy-key) KEY="${2-}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  [ $# -gt 0 ] && shift
done
if ! [[ "$DOMAIN" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]]; then
  echo "give --domain, the name Binder is served at, such as binder.example.com" >&2
  exit 2
fi
if [ "$APPLY" = 1 ] && [ "$(id -u)" != 0 ]; then
  echo "--apply must run as root" >&2
  exit 2
fi

say() { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
act() {  # run it with --apply, otherwise say it would
  if [ "$APPLY" = 1 ]; then
    "$@" || { say "FAILED: $*"; exit 1; }
  else
    say "  would run: $*"
  fi
}
as_binder() { runuser -u binder -- env HOME="$HOME_DIR" "$@"; }
CHANGED=0
put() {  # install a file from the checkout, saying whether anything changed
  local src="$1" dst="$2" mode="$3"
  if [ ! -f "$src" ]; then say "  would install $dst (from the checkout, once cloned)"; CHANGED=1; return; fi
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then say "  $dst: up to date"; return; fi
  act install -o root -g root -m "$mode" "$src" "$dst"
  CHANGED=1
}

[ "$APPLY" = 1 ] || say "DRY RUN (nothing on this server changes). Add --apply to set up."

step "Packages"
MISSING=0
for c in git python3 node npm nginx curl runuser; do
  command -v "$c" >/dev/null || { say "  missing: $c (install it first)"; MISSING=1; }
done
python3 -c 'import ensurepip' 2>/dev/null || act apt-get install -y python3-venv
command -v certbot >/dev/null || act apt-get install -y certbot python3-certbot-nginx
if [ "$MISSING" = 1 ] && [ "$APPLY" = 1 ]; then exit 1; fi

step "User and folders"
if id binder >/dev/null 2>&1; then
  say "  user binder: there"
else
  act useradd --system --home-dir "$HOME_DIR" --create-home --shell /usr/sbin/nologin binder
fi
act install -d -o binder -g binder -m 750 "$HOME_DIR"
act install -d -o binder -g binder -m 700 "$DATA" "$DATA/nightly" "$DATA/deploys"
act install -d -o root -g root -m 755 "$ETC"

step "Code"
if [ -d "$APP/.git" ]; then
  say "  $APP: there, at $(as_binder git -C "$APP" rev-parse --short HEAD 2>/dev/null)"
else
  act as_binder git clone --quiet "$REPO_URL" "$APP"
  act as_binder git -C "$APP" checkout --quiet --detach origin/main
fi
if [ -x "$APP/.venv/bin/python" ]; then
  say "  $APP/.venv: there (deploys keep it up to date)"
else
  act as_binder python3 -m venv "$APP/.venv"
  act as_binder "$APP/.venv/bin/pip" install --quiet --disable-pip-version-check -e "$APP"
  act as_binder bash -c "cd '$APP/web' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent"
fi

step "Settings"
if [ -f "$ETC/binder.env" ]; then
  say "  $ETC/binder.env: there (never overwritten)"
  grep -q '^ANTHROPIC_API_KEY=.' "$ETC/binder.env" 2>/dev/null \
    || say "  no ANTHROPIC_API_KEY in it yet: research and summarise stay off"
elif [ -f "$APP/deploy/binder.env.example" ]; then
  act install -o root -g root -m 600 "$APP/deploy/binder.env.example" "$ETC/binder.env"
  say "  then add ANTHROPIC_API_KEY to $ETC/binder.env and restart binder.service"
else
  say "  would write $ETC/binder.env from deploy/binder.env.example (once cloned)"
fi

step "Services"
put "$APP/deploy/binder.service" "$UNITS/binder.service" 644
put "$APP/deploy/binder-backup.service" "$UNITS/binder-backup.service" 644
put "$APP/deploy/binder-backup.timer" "$UNITS/binder-backup.timer" 644
UNITS_CHANGED=$CHANGED
[ "$UNITS_CHANGED" = 1 ] && act systemctl daemon-reload
act systemctl enable --quiet binder.service binder-backup.timer
act systemctl start binder-backup.timer
if [ "$UNITS_CHANGED" = 1 ]; then act systemctl restart binder.service; else act systemctl start binder.service; fi
if [ "$APPLY" = 1 ]; then
  ok=0
  for _ in $(seq 1 20); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8770/api/health)" = 200 ]; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" = 1 ]; then say "  Binder answers on 127.0.0.1:8770"; else
    say "  Binder is not answering. Check: journalctl -u binder.service -n 50"; exit 1; fi
fi

step "Deploy command"
act install -d -o root -g root -m 755 "$LIB"
put "$APP/deploy/deploy-on-server.sh" "$LIB/deploy-on-server.sh" 755
put "$APP/deploy/deploy-forced-command.sh" "$LIB/deploy-forced-command.sh" 755
if [ -n "$KEY" ]; then
  act bash "$APP/deploy/set-deploy-key.sh" /root/.ssh/authorized_keys "$KEY"
elif grep -qF binder-deploy/deploy-forced-command.sh /root/.ssh/authorized_keys 2>/dev/null; then
  say "  deploy key: there"
else
  say "  no deploy key yet: run again with --deploy-key '<ssh-ed25519 public key>'"
fi

step "nginx"
if [ -f "$SITE" ]; then
  say "  $SITE: there (never overwritten, since certbot edits it)"
elif [ -f "$APP/deploy/nginx-binder.conf" ]; then
  if [ "$APPLY" = 1 ]; then
    sed "s/@DOMAIN@/$DOMAIN/g" "$APP/deploy/nginx-binder.conf" > "$SITE" || { say "FAILED: writing $SITE"; exit 1; }
    say "  wrote $SITE for $DOMAIN"
  else
    say "  would write $SITE for $DOMAIN from deploy/nginx-binder.conf"
  fi
else
  say "  would write $SITE for $DOMAIN (once cloned)"
fi
[ -L /etc/nginx/sites-enabled/binder ] || act ln -s "$SITE" /etc/nginx/sites-enabled/binder
act nginx -t -q
act systemctl reload nginx

step "TLS"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  say "  certificate for $DOMAIN: there"
elif [ "$TLS" = 1 ]; then
  act certbot --nginx --non-interactive --redirect -d "$DOMAIN"
else
  say "  none yet. Once $DOMAIN points at this server, run again with --tls"
fi

say
[ "$APPLY" = 1 ] && say "Done." || say "Dry run done. Run again with --apply to make these changes."
```

Then: `chmod 755 deploy/setup-server.sh`

- [ ] **Step 4: Run the tests to see them pass**

Run: `.venv/bin/pytest tests/test_setup_server.py -q`
Expected: all pass: one parse test per `deploy/*.sh` so far (five; Task 7 adds a sixth), plus 4 domain, 1 unknown-argument, 1 root and 1 dry-run test.

- [ ] **Step 5: Commit**

```bash
git add deploy/setup-server.sh tests/test_setup_server.py
git commit -m "Deploy: re-runnable server set-up with a dry run"
```

---

### Task 7: The outside check (`deploy/check-live.sh`)

**Files:**
- Create: `deploy/check-live.sh`

It runs from the owner's Mac against the live site, so it has no unit test. Task 6's parse test covers its syntax, and the go-live steps run it for real.

- [ ] **Step 1: Write `deploy/check-live.sh`**

```bash
#!/usr/bin/env bash
# From outside, after a deploy or a change to the nginx block: Binder is only
# reachable signed in, and forged sign-in headers do nothing.
#
#   deploy/check-live.sh https://binder.example.com
#   BINDER_COOKIE='<name>=<value>' deploy/check-live.sh https://binder.example.com
#
# With BINDER_COOKIE (copied from a signed-in browser; it is a secret, so
# don't paste it anywhere else), it also checks that a forged email sent
# alongside a real sign-in is replaced by the real one.
set -uo pipefail
URL="${1:?usage: check-live.sh https://<binder domain>}"
URL="${URL%/}"
FORGED=forged@example.com
fail=0

ok() { echo "  ok    $1"; }
bad() { echo "  FAIL  $1"; fail=1; }
expect() { if [ "$3" = "$2" ]; then ok "$1"; else bad "$1: got $3, want $2"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
forge=(-H "X-Offdesk-Email: $FORGED" -H "X-Offdesk-Name: Forged" -H "X-Offdesk-Teams: offdesk")

expect "plain http is sent to https" 301 "$(code "http://${URL#https://}/")"
expect "signed out, the app sends you to sign in" 302 "$(code "$URL/")"
expect "signed out, the API sends you to sign in" 302 "$(code "$URL/api/whoami")"
expect "signed out, forged sign-in headers are ignored" 302 "$(code "${forge[@]}" "$URL/api/whoami")"
where="$(curl -s -o /dev/null -w '%{redirect_url}' "$URL/api/whoami")"
case "$where" in
  "$URL/auth/login"*) ok "the redirect is to this site's own sign-in" ;;
  *) bad "the redirect goes to '$where'" ;;
esac

if [ -n "${BINDER_COOKIE:-}" ]; then
  body="$(curl -s -b "$BINDER_COOKIE" "${forge[@]}" "$URL/api/whoami")"
  case "$body" in
    *'"email"'*) case "$body" in
        *"$FORGED"*) bad "signed in, a forged email got through: $body" ;;
        *) ok "signed in, the forged email is replaced by the real one" ;;
      esac ;;
    *) bad "signed in, /api/whoami did not answer with an identity (is the cookie current?)" ;;
  esac
else
  echo "  (set BINDER_COOKIE to also check a forged header alongside a real sign-in)"
fi

exit $fail
```

Then: `chmod 755 deploy/check-live.sh`

- [ ] **Step 2: Run the parse tests**

Run: `.venv/bin/pytest tests/test_setup_server.py -q`
Expected: all pass, including `test_every_deploy_script_parses[check-live.sh]`.

- [ ] **Step 3: Commit**

```bash
git add deploy/check-live.sh
git commit -m "Deploy: outside check that sign-in is required and forged headers are ignored"
```

---

### Task 8: CI and deploy workflow, and the ruleset

**Files:**
- Create: `.github/workflows/deploy.yml`, `deploy/ruleset.json`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
# Tests every PR to main. On a merge to main (or a manual run), tests the
# merged commit again and deploys exactly that commit to the server. The
# server side is deploy/deploy-forced-command.sh; the plan is
# docs/superpowers/plans/2026-11-16-binder-5-deploy.md.
#
# The deploy job runs only once the repository variable DEPLOY_ENABLED is
# "true", which the owner sets after setup-server.sh (README, Deploy).
name: Test and deploy

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 25
    env:
      TZ: Europe/Lisbon
    steps:
      - uses: actions/checkout@v4

      # 3.9 is the owner's Mac (CLAUDE.md, Python 3.9); 3.14 is the server.
      - uses: actions/setup-python@v5
        with:
          python-version: |
            3.9
            3.14

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Python suite on 3.9
        run: |
          python3.9 -m venv "$RUNNER_TEMP/venv39"
          "$RUNNER_TEMP/venv39/bin/pip" install --quiet -e '.[dev]'
          "$RUNNER_TEMP/venv39/bin/pytest" -q

      # Playwright starts the app from .venv, so the server's version lives there.
      - name: Python suite on 3.14
        run: |
          python3.14 -m venv .venv
          .venv/bin/pip install --quiet -e '.[dev]'
          .venv/bin/pytest -q

      - name: Shell scripts
        run: shellcheck -S warning deploy/*.sh

      - name: Frontend
        working-directory: web
        run: |
          npm ci --no-audit --no-fund
          npm run check
          npm test

      - name: Browser suite
        working-directory: web
        run: |
          npx playwright install --with-deps chromium
          npm run e2e

  deploy:
    needs: test
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main' && vars.DEPLOY_ENABLED == 'true'
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    # The secrets live in this environment, which only main may use, so a
    # workflow on any other branch cannot read them.
    environment: production
    concurrency:
      group: deploy-server
      cancel-in-progress: false
    steps:
      - name: Deploy this commit
        env:
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        run: |
          set -euo pipefail
          install -d -m 700 ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy
          chmod 600 ~/.ssh/deploy
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh -i ~/.ssh/deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
            "root@$DEPLOY_HOST" "$GITHUB_SHA"
```

- [ ] **Step 2: Write `deploy/ruleset.json`**

This is Bench's "main" ruleset, but it targets the default branch explicitly, because Bench's `include` is empty.

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "test", "integration_id": 15368 }]
      }
    }
  ]
}
```

- [ ] **Step 3: Check both files parse**

Run: `.venv/bin/python -c "import json; json.load(open('deploy/ruleset.json'))" && ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml")' && echo ok`
Expected: `ok`. (Ruby ships with macOS. If it's missing, skip the YAML check: pushing in Task 10 shows any workflow error on the PR.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml deploy/ruleset.json
git commit -m "CI: test every PR on 3.9 and 3.14, deploy main once enabled; ruleset for main"
```

---

### Task 9: README and CLAUDE.md

**Files:**
- Modify: `README.md` (add a `## Deploy` section before `## API`, and update "Where the work stands" if it's there)
- Modify: `CLAUDE.md` (the "Where the work stands" list, plan 5's link, and a new "Deploy" rules section after "Rules for the frontend")

- [ ] **Step 1: Read both files first**

Run: `grep -n "^#" README.md CLAUDE.md`. Then read the sections around the places named above, so the edits match what's there.

- [ ] **Step 2: Add the README's Deploy section**

Insert before `## API`:

````markdown
## Deploy

Offdesk's own install is `https://binder.offdesk.io`, on the same server as
Bench. Every merge to `main` that passes CI deploys itself:
`.github/workflows/deploy.yml` sshes to the server with a key that can only
run `deploy/deploy-forced-command.sh`, which hands the commit id to
`deploy/deploy-on-server.sh`. That script refuses anything `origin/main` has
not reached, snapshots the database, builds, restarts, waits for
`/api/health`, and rolls back (database too, if the new code migrated it)
when Binder doesn't answer.

On the server:

| What | Where |
|---|---|
| Code, as the `binder` user | `/opt/binder/app` (detached at the deployed commit) |
| Database | `/var/lib/binder/binder.db` |
| Nightly copies (30 days) | `/var/lib/binder/nightly/` |
| Copies before each deploy (last 10) | `/var/lib/binder/deploys/` |
| Settings (root, 600) | `/etc/binder/binder.env`, from `deploy/binder.env.example` |
| Service | `binder.service` on 127.0.0.1:8770, `binder-backup.timer` |
| nginx | `/etc/nginx/sites-available/binder`, from `deploy/nginx-binder.conf` |
| Deploy command (root's copies) | `/usr/local/lib/binder-deploy/` |

Set up or check a server with `deploy/setup-server.sh`. Without `--apply` it
only reports what it would do:

```
ssh root@<host> 'bash -s -- --domain binder.offdesk.io' < deploy/setup-server.sh
```

After changing `deploy-on-server.sh` or `deploy-forced-command.sh`, run it
again with `--apply` once the change is deployed: the key runs root's
installed copies, never the checkout's. After changing
`deploy/nginx-binder.conf`, apply the change to the installed file by hand,
since certbot has edited it.

To check from outside that sign-in is required and forged headers do nothing:

```
deploy/check-live.sh https://binder.offdesk.io
```

To look at it: `journalctl -u binder.service -n 50`, and
`systemctl list-timers binder-backup.timer`.
````

- [ ] **Step 3: Update CLAUDE.md**

In the plan list at the top, add: `- Plan 5, deploy: docs/superpowers/plans/2026-11-16-binder-5-deploy.md`. In "Where the work stands", mark plan 4 as merged and plan 5 as built on `feature/deploy`. After "Rules for the frontend", add:

```markdown
## Rules for deploy

- `main` deploys itself, so merge only what is ready to run for the team.
- Files in `deploy/` name no domain: the nginx template uses `@DOMAIN@`, and
  `setup-server.sh` takes `--domain`. The server's address lives only in the
  `DEPLOY_HOST` secret, never in a tracked file.
- Keep the deploy scripts runnable by bash 3.2, so their tests run on a Mac.
- A change to `deploy-on-server.sh` or `deploy-forced-command.sh` needs
  `setup-server.sh --apply` on the server afterwards. Say so in the PR.
- A migration must work with the snapshot rollback: a failed deploy that
  changed the database's version puts the pre-deploy copy back.
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Docs: deploy section and rules"
```

---

### Task 10: PR and green CI

- [ ] **Step 1: Run everything locally**

```bash
.venv/bin/pytest -q
(cd web && npm run check && npm test && npm run e2e)
```

Expected: every test passes. If `shellcheck` is installed, also run `shellcheck -S warning deploy/*.sh` and fix any warnings. Otherwise CI runs it.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feature/deploy
gh pr create --base main --head feature/deploy --title "Binder 5: deploy" --body-file - <<'EOF'
Deploys Binder to the server on every merge to main that passes CI, with a health check and a rollback (plan: docs/superpowers/plans/2026-11-16-binder-5-deploy.md).

- CI: pytest on Python 3.9 and 3.14, shellcheck, frontend check and tests, Playwright.
- The deploy job runs only once the repository variable DEPLOY_ENABLED is true, so merging this deploys nothing until the server is set up.
- Server layout: /opt/binder/app, /var/lib/binder, /etc/binder/binder.env. Not /opt/agency, which is the bench user's home and closed to other users.
- deploy/ruleset.json is Bench's main ruleset, targeting the default branch explicitly.

After merging, the go-live steps are in the plan's last task.
EOF
```

- [ ] **Step 3: Wait for CI and fix what fails**

Run: `gh pr checks --watch`
Expected: `test` passes. The `deploy` job doesn't appear on a PR. If a suite fails only on Linux, for example a path or a time zone assumption, fix it on the branch and push again. If `setup-python` can't provide 3.9, drop that step, keep 3.14, and tell the owner.

---

### Task 11: Go live (the owner runs these; Tiago does DNS)

None of these steps can be done from the dev machine's session: there's no ssh to the server, and the merge is the owner's call. Each one says who does it.

- [ ] **Step 1 (owner): merge the PR.** No ruleset exists on Binder's `main` yet, so the owner merges. CI runs on `main`, and the deploy job is skipped because `DEPLOY_ENABLED` is unset.

- [ ] **Step 2 (Tiago): DNS.** Add an `A` record (and `AAAA` if Bench has one) for `binder.offdesk.io`, pointing at the same server as `bench.offdesk.io`. Check it with `dig +short binder.offdesk.io`, which should give the same answer as `dig +short bench.offdesk.io`.

- [ ] **Step 3 (owner): dry run, then apply.** From `~/Developer/Offdesk/binder`:

```bash
ssh root@<host> 'bash -s -- --domain binder.offdesk.io' < deploy/setup-server.sh
ssh root@<host> 'bash -s -- --domain binder.offdesk.io --apply' < deploy/setup-server.sh
```

The dry run lists anything missing. The script installs no packages itself, so that Bench's Python is never upgraded by surprise. If the dry run names any, install them first (`apt-get install python3-venv certbot python3-certbot-nginx`, only the missing ones), after checking that nothing else would be upgraded. Then apply.

Expected: it ends with `Done.` and says `Binder answers on 127.0.0.1:8770`. The first `npm ci` on the server also proves that Tenon installs over https; its lockfile entry is `git+ssh`, and the `binder` user has no GitHub key. If it fails there, the lockfile needs Tenon's URL as https.

- [ ] **Step 4 (owner): TLS, once Step 2 resolves.**

```bash
ssh root@<host> 'bash -s -- --domain binder.offdesk.io --apply --tls' < deploy/setup-server.sh
```

It skips certbot while the name doesn't resolve yet. Certbot reuses the account Bench's certificates were made with; on a server without one, add `--email <address>`.

- [ ] **Step 5 (owner): the API key.** On the server, put the key in `/etc/binder/binder.env` (`ANTHROPIC_API_KEY=...`), then run `systemctl restart binder.service`.

- [ ] **Step 6 (owner): the deploy key and GitHub's settings.**

```bash
ssh-keygen -t ed25519 -N '' -C binder-deploy -f ~/.ssh/binder-deploy
ssh root@<host> "bash -s -- --domain binder.offdesk.io --apply --deploy-key '$(cat ~/.ssh/binder-deploy.pub)'" < deploy/setup-server.sh

gh api -X PUT repos/offdesk-io/binder/environments/production --input - <<'EOF'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
EOF
gh api -X POST repos/offdesk-io/binder/environments/production/deployment-branch-policies -f name=main -f type=branch

gh secret set DEPLOY_SSH_KEY --env production --repo offdesk-io/binder < ~/.ssh/binder-deploy
ssh-keyscan -t ed25519 <host> 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS --env production --repo offdesk-io/binder
printf '%s' '<host>' | gh secret set DEPLOY_HOST --env production --repo offdesk-io/binder
gh variable set DEPLOY_ENABLED --body true --repo offdesk-io/binder
```

After that, the private key can be deleted from the Mac (`rm ~/.ssh/binder-deploy`). GitHub holds it, and a new one can always be made the same way.

- [ ] **Step 7 (owner): prove the pipeline.**

```bash
gh workflow run deploy.yml --repo offdesk-io/binder --ref main
gh run watch --repo offdesk-io/binder
```

Expected: `test` passes and `deploy` ends with `Deployed <sha>`. Then check that the key can't do anything else: `ssh -i <a copy of the key> root@<host> bash` should print `Refused: this key only deploys one full commit id.`

- [ ] **Step 8 (owner): the outside check and a real sign-in.**

```bash
deploy/check-live.sh https://binder.offdesk.io
```

Expected: every line `ok`. Then sign in at `https://binder.offdesk.io` in a browser. The sign-in link in the email must come back to `binder.offdesk.io`. If it lands on Bench instead, the sign-in service builds links from a fixed host rather than the request's, and that's a change in its own repo for Tiago. Finally, run the check again with `BINDER_COOKIE` set from the browser, so the forged header alongside a real sign-in is tested too.

- [ ] **Step 9 (owner): the ruleset on `main`.**

```bash
gh api -X POST repos/offdesk-io/binder/rulesets --input deploy/ruleset.json
gh api repos/offdesk-io/binder/rulesets --jq '.[] | {name, enforcement}'
```

From now on every PR to `main` needs a passing `test` and one approval from someone other than its author. Force-pushes and deleting `main` are blocked.

- [ ] **Step 10: mark plan 5 done** in `CLAUDE.md`'s "Where the work stands", on a small branch and PR.
