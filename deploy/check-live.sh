#!/usr/bin/env bash
# From outside, after a deploy or a change to the nginx block: Binder is only
# reachable signed in, and forged sign-in headers do nothing.
#
#   deploy/check-live.sh https://binder.example.com
#   BINDER_COOKIE='<name>=<value>' deploy/check-live.sh https://binder.example.com
#
# With BINDER_COOKIE (copied from a signed-in browser; it is a secret, so
# don't paste it anywhere else), it also checks that a forged email sent
# alongside a real sign-in is replaced by the real one.
set -uo pipefail
URL="${1:?usage: check-live.sh https://<binder domain>}"
URL="${URL%/}"
FORGED=forged@example.com
fail=0

ok() { echo "  ok    $1"; }
bad() { echo "  FAIL  $1"; fail=1; }
expect() { if [ "$3" = "$2" ]; then ok "$1"; else bad "$1: got $3, want $2"; fi; }
code() { curl -s --max-time 10 -o /dev/null -w '%{http_code}' "$@"; }
forge=(-H "X-Offdesk-Email: $FORGED" -H "X-Offdesk-Name: Forged" -H "X-Offdesk-Teams: offdesk")

expect "plain http is sent to https" 301 "$(code "http://${URL#https://}/")"
expect "signed out, the app sends you to sign in" 302 "$(code "$URL/")"
expect "signed out, the API sends you to sign in" 302 "$(code "$URL/api/whoami")"
expect "signed out, forged sign-in headers are ignored" 302 "$(code "${forge[@]}" "$URL/api/whoami")"
where="$(curl -s --max-time 10 -o /dev/null -w '%{redirect_url}' "$URL/api/whoami")"
case "$where" in
  "$URL/auth/login"*) ok "the redirect is to this site's own sign-in" ;;
  *) bad "the redirect goes to '$where'" ;;
esac

if [ -n "${BINDER_COOKIE:-}" ]; then
  body="$(curl -s --max-time 10 -b "$BINDER_COOKIE" "${forge[@]}" "$URL/api/whoami")"
  case "$body" in
    *'"email"'*) case "$body" in
        *"$FORGED"*) bad "signed in, a forged email got through: $body" ;;
        *) ok "signed in, the forged email is replaced by the real one" ;;
      esac ;;
    *) bad "signed in, /api/whoami did not answer with an identity (is the cookie current?)" ;;
  esac
else
  echo "  (set BINDER_COOKIE to also check a forged header alongside a real sign-in)"
fi

exit $fail
