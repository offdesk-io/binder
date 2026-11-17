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
# so the key check's character ranges mean ASCII
export LC_ALL=C
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
