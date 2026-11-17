#!/usr/bin/env bash
# Sets Binder up on an Ubuntu server, or checks a set-up that is already
# there. Safe to run again: each step looks first and changes only what is
# missing or out of date. Run as root. Without --apply it only reports.
# It never installs packages: it names what is missing and stops.
#
#   ssh root@<host> 'bash -s -- --domain <name>' < deploy/setup-server.sh
#   ssh root@<host> 'bash -s -- --domain <name> --apply' < deploy/setup-server.sh
#   ... --apply --tls [--email <address>]   once DNS for <name> points here
#   ssh root@<host> "bash -s -- --domain <name> --apply --deploy-key 'ssh-ed25519 AAAA... binder-deploy'" < deploy/setup-server.sh
#
# It clones the public repo to /opt/binder/app and installs every other file
# from that checkout, so it runs piped over ssh with nothing copied first.
# Run it again after changing deploy-on-server.sh or deploy-forced-command.sh:
# the deploy key runs the installed copies in /usr/local/lib/binder-deploy/,
# never the checkout's, so a merge to main cannot change what root runs.
set -uo pipefail
# so the --domain check's ranges mean ASCII
export LC_ALL=C
# a dropped ssh connection must not leave a step half done
trap '' HUP PIPE

REPO_URL=https://github.com/offdesk-io/binder.git
HOME_DIR=/opt/binder
APP=$HOME_DIR/app
DATA=/var/lib/binder
ETC=/etc/binder
LIB=/usr/local/lib/binder-deploy
SITE=/etc/nginx/sites-available/binder
ENABLED=/etc/nginx/sites-enabled/binder
UNITS=/etc/systemd/system
# BINDER_PORT's default, and the port nginx-binder.conf proxies to
HEALTH=http://127.0.0.1:8770/api/health

APPLY=0 TLS=0 DOMAIN="" KEY="" EMAIL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --tls) TLS=1 ;;
    --domain) DOMAIN="${2-}"; shift ;;
    --deploy-key) KEY="${2-}"; shift ;;
    --email) EMAIL="${2-}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  [ $# -gt 0 ] && shift
done
DOMAIN_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
KEY_RE='^ssh-ed25519 [A-Za-z0-9+/=]+( [A-Za-z0-9@._-]+)?$'
EMAIL_RE='^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$'
if ! [[ "$DOMAIN" =~ $DOMAIN_RE ]]; then
  echo "give --domain, the name Binder is served at, such as binder.example.com" >&2
  exit 2
fi
if [ -n "$KEY" ] && ! [[ "$KEY" =~ $KEY_RE ]]; then
  echo "--deploy-key must be one ssh-ed25519 public key" >&2
  exit 2
fi
if [ -n "$EMAIL" ] && ! [[ "$EMAIL" =~ $EMAIL_RE ]]; then
  echo "--email must be an email address" >&2
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
    "$@" || { say "FAILED: $(printf '%q ' "$@")"; exit 1; }
  else
    say "  would run: $(printf '%q ' "$@")"
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
code_ready() {
  [ -x "$APP/.venv/bin/python" ] && as_binder "$APP/.venv/bin/python" -c 'import binder' >/dev/null 2>&1 \
    && [ -f "$APP/web/dist/index.html" ]
}
need_reload() {
  local u
  for u in binder.service binder-backup.service binder-backup.timer; do
    [ "$(systemctl show -p NeedDaemonReload --value "$u" 2>/dev/null)" = yes ] && return 0
  done
  return 1
}
other_site_serving() {  # prints another enabled site that already names $DOMAIN
  local f dom_re="${DOMAIN//./\\.}"
  for f in /etc/nginx/sites-enabled/*; do
    [ -e "$f" ] || continue
    [ "$(basename "$f")" = binder ] && continue
    if grep -qE "server_name[^;]*[[:space:]]$dom_re[[:space:];]" "$f" 2>/dev/null; then echo "$f"; return 0; fi
  done
  return 1
}

main() {
  [ "$APPLY" = 1 ] || say "DRY RUN (nothing on this server changes). Add --apply to set up."

  step "Packages"
  local MISSING=0 APT="" c
  for c in git python3 node npm nginx curl runuser systemd-analyze cmp flock; do
    command -v "$c" >/dev/null || { say "  missing: $c"; MISSING=1; }
  done
  if ! python3 -c 'import ensurepip' 2>/dev/null; then say "  missing: python3-venv"; APT="$APT python3-venv"; fi
  if ! command -v certbot >/dev/null; then say "  missing: certbot"; APT="$APT certbot"; fi
  if ! dpkg -s python3-certbot-nginx >/dev/null 2>&1; then say "  missing: python3-certbot-nginx"; APT="$APT python3-certbot-nginx"; fi
  [ -z "$APT" ] || { say "  install them first: apt-get install$APT"; MISSING=1; }
  [ "$MISSING" = 0 ] && say "  all there"
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
    as_binder git -C "$APP" merge-base --is-ancestor HEAD origin/main 2>/dev/null \
      || say "  note: that commit is not on origin/main (left as it is)"
  else
    act as_binder git clone --quiet "$REPO_URL" "$APP"
    act as_binder git -C "$APP" checkout --quiet --detach origin/main
  fi
  if code_ready; then
    say "  $APP: installed and built (deploys keep it up to date)"
  else
    [ -x "$APP/.venv/bin/python" ] || act as_binder python3 -m venv "$APP/.venv"
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
  # a bad unit stops the set-up here, before anything is installed or restarted
  if [ -f "$APP/deploy/binder.service" ]; then
    act systemd-analyze verify --recursive-errors=no "$APP/deploy/binder.service" "$APP/deploy/binder-backup.service" "$APP/deploy/binder-backup.timer"
  fi
  CHANGED=0
  put "$APP/deploy/binder.service" "$UNITS/binder.service" 644
  local APP_CHANGED=$CHANGED
  CHANGED=0
  put "$APP/deploy/binder-backup.service" "$UNITS/binder-backup.service" 644
  put "$APP/deploy/binder-backup.timer" "$UNITS/binder-backup.timer" 644
  local BACKUP_CHANGED=$CHANGED
  if [ "$APP_CHANGED" = 1 ] || [ "$BACKUP_CHANGED" = 1 ] || need_reload; then act systemctl daemon-reload; fi
  act systemctl enable --quiet binder.service binder-backup.timer
  if [ "$BACKUP_CHANGED" = 1 ]; then act systemctl restart binder-backup.timer; else act systemctl start binder-backup.timer; fi
  if [ "$APP_CHANGED" = 1 ]; then act systemctl restart binder.service; else act systemctl start binder.service; fi
  if [ "$APPLY" = 1 ]; then
    local ok=0 _i
    for _i in $(seq 1 20); do
      if [ "$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' "$HEALTH" || true)" = 200 ]; then ok=1; break; fi
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
  elif grep -q '^restrict,command="/usr/local/lib/binder-deploy/deploy-forced-command.sh" ' /root/.ssh/authorized_keys 2>/dev/null; then
    say "  deploy key: there"
  else
    say "  no deploy key yet: run again with --deploy-key '<ssh-ed25519 public key>'"
  fi

  step "nginx"
  local other
  if other=$(other_site_serving); then
    say "FAILED: $other already serves $DOMAIN. Remove that name there first."
    exit 1
  fi
  local WROTE_SITE=0 MADE_LINK=0
  if [ -f "$SITE" ]; then
    if grep -qF "server_name $DOMAIN;" "$SITE"; then
      say "  $SITE: there (never overwritten, since certbot edits it)"
    else
      say "FAILED: $SITE is there but does not serve $DOMAIN. Check --domain, or edit that file."
      exit 1
    fi
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
  if [ ! -L "$ENABLED" ]; then
    act ln -s "$SITE" "$ENABLED"
    MADE_LINK=1
  fi
  if [ "$APPLY" = 1 ]; then
    if ! nginx -t -q; then
      # what this run added must not stay enabled
      [ "$MADE_LINK" = 1 ] && rm -f "$ENABLED"
      [ "$WROTE_SITE" = 1 ] && rm -f "$SITE"
      say "FAILED: nginx -t rejects the config; removed what this run added"
      exit 1
    fi
  else
    say "  would run: nginx -t -q"
  fi
  act systemctl reload nginx

  step "TLS"
  if grep -q ssl_certificate "$SITE" 2>/dev/null; then
    say "  certificate for $DOMAIN: there"
  elif [ "$TLS" = 1 ]; then
    if ! getent ahosts "$DOMAIN" >/dev/null 2>&1; then
      say "  $DOMAIN does not resolve yet, so no certificate: point its DNS here, then run --tls again"
    else
      local certbot_args=(--nginx --non-interactive --agree-tos --redirect -d "$DOMAIN")
      [ -d "/etc/letsencrypt/live/$DOMAIN" ] && certbot_args+=(--keep-until-expiring)
      if [ -n "$EMAIL" ]; then
        certbot_args+=(--email "$EMAIL")
      elif ! ls /etc/letsencrypt/accounts/*/directory/* >/dev/null 2>&1; then
        certbot_args+=(--register-unsafely-without-email)
      fi
      act certbot "${certbot_args[@]}"
    fi
  else
    say "  none yet. Once $DOMAIN points at this server, run again with --tls"
  fi

  say
  if [ "$APPLY" = 1 ]; then say "Done."; else say "Dry run done. Run again with --apply to make these changes."; fi
}

# nothing in main may read the rest of the script off stdin (bash -s)
main "$@" </dev/null
