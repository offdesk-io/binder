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
