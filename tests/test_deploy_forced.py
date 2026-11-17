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
