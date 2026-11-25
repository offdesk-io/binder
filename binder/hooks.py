"""Tells the Offdesk core when something happens in Binder: `org.moved` (a record changed status) and
`org.won` (a lead was won). The core starts an agent on it, through its webhook BINDER_CORE_HOOK_URL.

Each event is a row of `hook_queue`, written with the change that caused it (binder/repo/hooks.py).
A daemon thread sends what is due, woken at once after a change and every half minute otherwise, so a
request never waits on the core. Each try is signed afresh as the core's webhooks expect:
`X-Offdesk-Timestamp` (seconds since 1970) and `X-Offdesk-Signature: sha256=<hex>` of the HMAC-SHA256,
keyed by BINDER_CORE_HOOK_SECRET, of `<timestamp>.<body>`. Anything but a 2xx is tried again after 30
seconds, then twice as long each time up to an hour, and given up a day after the event. Rows sent or
given up are forgotten a week later. Without BINDER_CORE_HOOK_URL there is no sender and nothing is queued."""

import datetime
import hashlib
import hmac
import logging
import threading
import time
import urllib.error
import urllib.request
from typing import Callable, Dict, Optional

from .db import connect
from .repo import hooks as repo

log = logging.getLogger("binder.hooks")

FIRST_WAIT_S = 30
MOST_WAIT_S = 3600
GIVE_UP_S = 86400
FORGET_S = 7 * 86400
POLL_S = 30
TIMEOUT_S = 10

Sender = Callable[[str, bytes, Dict[str, str]], int]


def post(url: str, body: bytes, headers: Dict[str, str]) -> int:
    """POSTs and returns the HTTP status. A network failure raises."""
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def _iso(t: float) -> str:
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat(timespec="microseconds")


def _epoch(iso: str) -> float:
    return datetime.datetime.fromisoformat(iso).timestamp()


def wait_after(tries: int) -> int:
    """Seconds before the next try, after `tries` failed ones."""
    return min(FIRST_WAIT_S * 2 ** max(tries - 1, 0), MOST_WAIT_S)


class Hooks:
    def __init__(self, db_path: str, url: str, secret: str, clock: Callable[[], float] = time.time,
                 send: Sender = post):
        self.db_path, self.url, self._secret = db_path, url, secret
        self.clock, self.send = clock, send
        self.woken = threading.Event()

    def __repr__(self) -> str:
        return "Hooks(%r)" % self.url  # never the secret

    def sign(self, stamp: str, body: bytes) -> str:
        return "sha256=" + hmac.new(self._secret.encode(), stamp.encode() + b"." + body, hashlib.sha256).hexdigest()

    def wake(self) -> None:
        """A change was committed: send now rather than at the next poll."""
        self.woken.set()

    def tick(self) -> None:
        """Sends everything due. One event's failure never stops the others."""
        conn = connect(self.db_path)
        try:
            now = self.clock()
            for item in repo.due(conn, _iso(now)):
                self._try(conn, item)
            repo.forget(conn, _iso(now - FORGET_S))
        finally:
            conn.close()

    def _try(self, conn, item) -> None:
        now = self.clock()
        stamp = str(int(now))
        body = item["body"].encode()
        headers = {"Content-Type": "application/json", "X-Offdesk-Timestamp": stamp,
                   "X-Offdesk-Signature": self.sign(stamp, body)}
        error: Optional[str] = None
        try:
            status = self.send(self.url, body, headers)
            if not 200 <= status < 300:
                error = "HTTP %d" % status
        except Exception as e:  # a network error, or anything else: the event waits for its next try
            error = str(e) or type(e).__name__
        if error is None:
            repo.sent(conn, item["id"], _iso(now))
            return
        if now - _epoch(item["created_at"]) >= GIVE_UP_S:
            log.warning("gave up on event %d (%s) after %d tries: %s", item["id"], item["event"],
                        item["tries"] + 1, error)
            repo.failed(conn, item["id"], "Gave up after a day: %s" % error, None)
            return
        repo.failed(conn, item["id"], error, _iso(now + wait_after(item["tries"] + 1)))

    def start(self) -> None:
        def loop() -> None:
            while True:
                self.woken.clear()
                try:
                    self.tick()
                except Exception:
                    log.exception("sending events to the core failed")
                self.woken.wait(POLL_S)
        threading.Thread(target=loop, name="core-hooks", daemon=True).start()


def from_settings(settings) -> Optional[Hooks]:
    if not settings.hook_url:
        return None
    return Hooks(settings.db_path, settings.hook_url, settings.hook_secret)
