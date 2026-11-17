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


@pytest.mark.parametrize("args", [[], ["--domain"], ["--domain", "not a domain"], ["--domain", "x;rm"], ["--domain", "-bad.example.com"]])
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


def test_it_refuses_a_bad_deploy_key():
    r = run("--domain", "binder.example.com", "--deploy-key", "ssh-rsa AAAA")
    assert r.returncode == 2
    assert "--deploy-key" in r.stderr


def test_it_refuses_a_bad_email():
    r = run("--domain", "binder.example.com", "--email", "nope")
    assert r.returncode == 2
    assert "--email" in r.stderr


def test_a_dry_run_changes_nothing_and_fails_nothing():
    r = run("--domain", "binder.example.com")
    assert r.returncode == 0
    assert not [line for line in r.stdout.splitlines() if line.startswith("FAILED")]


def test_it_reads_itself_whole_when_piped_to_bash_s():
    """Over `bash -s` a child that reads stdin would eat the rest of the script."""
    with open(SETUP) as f:
        r = subprocess.run(
            ["bash", "-s", "--", "--domain", "binder.example.com"],
            stdin=f, capture_output=True, text=True,
        )
    assert r.stdout.splitlines()[-1].startswith("Dry run done")
