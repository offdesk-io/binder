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
# so the --domain check's ranges mean ASCII
export LC_ALL=C

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
if [ "$UNITS_CHANGED" = 1 ]; then
  # a bad unit stops the set-up here, before anything restarts
  act systemd-analyze verify "$UNITS/binder.service" "$UNITS/binder-backup.service" "$UNITS/binder-backup.timer"
  act systemctl daemon-reload
fi
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
WROTE_SITE=0
if [ -f "$SITE" ]; then
  say "  $SITE: there (never overwritten, since certbot edits it)"
elif [ -f "$APP/deploy/nginx-binder.conf" ]; then
  if [ "$APPLY" = 1 ]; then
    # written whole or not at all
    { sed "s/@DOMAIN@/$DOMAIN/g" "$APP/deploy/nginx-binder.conf" > "$SITE.new" && mv "$SITE.new" "$SITE"; } \
      || { rm -f "$SITE.new"; say "FAILED: writing $SITE"; exit 1; }
    WROTE_SITE=1
    say "  wrote $SITE for $DOMAIN"
  else
    say "  would write $SITE for $DOMAIN from deploy/nginx-binder.conf"
  fi
else
  say "  would write $SITE for $DOMAIN (once cloned)"
fi
[ -L /etc/nginx/sites-enabled/binder ] || act ln -s "$SITE" /etc/nginx/sites-enabled/binder
if [ "$APPLY" = 1 ] && [ "$WROTE_SITE" = 1 ]; then
  # a block written just now that nginx rejects must not stay enabled
  if ! nginx -t -q; then
    rm -f /etc/nginx/sites-enabled/binder "$SITE"
    say "FAILED: nginx -t rejects the new $SITE; removed it and its link"
    exit 1
  fi
else
  act nginx -t -q
fi
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
