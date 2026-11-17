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
# So the commit-id check and tool output don't depend on the caller's locale.
export LC_ALL=C
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
