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
