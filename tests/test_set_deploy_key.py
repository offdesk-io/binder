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
