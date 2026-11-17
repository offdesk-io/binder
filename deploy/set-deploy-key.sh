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
umask 077
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
trap 'rm -f "$FILE.new"' EXIT
# -a: a NUL byte must not make grep drop lines. A read error (exit 2) must stop
# the run, never leave Binder's line as the only one in the file.
rc=0
grep -avF "$MARK" "$FILE" > "$FILE.new" || rc=$?
if [ "$rc" -gt 1 ]; then
  echo "could not read $FILE" >&2
  exit 1
fi
printf 'restrict,command="%s" %s\n' "$FORCED" "$KEY" >> "$FILE.new"
old_n=$(grep -acvF "$MARK" "$FILE" || true)
new_n=$(grep -acvF "$MARK" "$FILE.new" || true)
if [ "$old_n" != "$new_n" ]; then
  echo "refusing to replace $FILE: it would lose lines" >&2
  exit 1
fi
mv "$FILE.new" "$FILE"
echo "deploy key set in $FILE"
