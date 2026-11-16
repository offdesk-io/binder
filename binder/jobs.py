"""Background research runs: one daemon thread each, in the app's own
process. uvicorn runs one worker, and a run spends minutes waiting on the
API rather than working. A run still `running` when the app starts was cut
off by a restart; create_app marks it failed."""

import logging
import sqlite3
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from . import bench as bench_module
from .ai import AIError
from .db import connect
from .repo import bench_links, research

log = logging.getLogger("binder.jobs")

REFRESH_EVERY_S = 600
STALE_AFTER_S = 60


def _fail(conn: sqlite3.Connection, research_id: int, error: str, usage: Any = None) -> None:
    """Ends a run as failed. If that write fails too, log it: the thread must not die with the row running."""
    try:
        research.fail(conn, research_id, error, usage)
    except Exception:
        log.exception("research %d could not be marked failed", research_id)


def run_research(db_path: str, ai: Any, research_id: int) -> None:
    conn = connect(db_path)
    try:
        try:
            out = ai.research(research.subject(conn, research_id))
        except AIError as e:
            _fail(conn, research_id, str(e), e.usage)
            return
        except Exception:
            log.exception("research %d failed", research_id)
            _fail(conn, research_id, "Research failed unexpectedly. Try again.")
            return
        try:
            research.finish(conn, research_id, out.brief, out.sources, out.usage)
        except Exception:
            log.exception("research %d could not be saved", research_id)
            _fail(conn, research_id, "Could not save the result. Try again.")
            return
        log.info("research %d done on %s: %d in, %d out, %d searches", research_id, out.usage.model,
                 out.usage.input_tokens, out.usage.output_tokens, out.usage.web_searches)
    finally:
        conn.close()


def in_thread(job: Callable[[], None], name: str = "research") -> None:
    threading.Thread(target=job, name=name, daemon=True).start()


class Refresher:
    """Refreshes the Bench cache: on a timer, and on demand when it is stale. Never two at once.

    The lock is taken by whoever starts a refresh, before the job is handed to run_job, so `running()`
    is true from the moment a refresh starts until it has stored its answer or failed."""

    def __init__(self, db_path: str, reader: Dict[str, Any], run_job: Callable[[Callable[[], None]], None]):
        self.db_path, self.reader, self.run_job = db_path, reader, run_job
        self._lock = threading.Lock()
        self._last_try = float("-inf")  # time.monotonic() of the last attempt, good or bad

    def running(self) -> bool:
        """True while a refresh is in progress."""
        return self._lock.locked()

    def refresh(self) -> None:
        """Refreshes now, unless one is already running."""
        if not self._lock.acquire(blocking=False):
            return
        self._last_try = time.monotonic()
        self._refresh_held()

    def refresh_if_stale(self, fetched_at: Optional[str]) -> bool:
        """Starts a refresh in the background when the cache is older than a minute. True if it started one."""
        if fetched_at and _age_s(fetched_at) < STALE_AFTER_S:
            return False
        # While Bench is down fetched_at stays old: try at most once a minute, not on every page open.
        if self._lock.locked() or time.monotonic() - self._last_try < STALE_AFTER_S:
            return False
        if not self._lock.acquire(blocking=False):
            return False
        self._last_try = time.monotonic()
        try:
            self.run_job(self._refresh_held)
        except Exception:
            self._lock.release()  # a job that never started must not leave the lock held
            raise
        return True

    def tick(self) -> None:
        """One timer round. A failed refresh is logged and never raised, so the timer goes on."""
        try:
            self.refresh()
        except Exception:
            log.exception("bench refresh failed")

    def start_timer(self) -> None:
        def loop() -> None:
            while True:
                self.tick()
                time.sleep(REFRESH_EVERY_S)
        threading.Thread(target=loop, name="bench-refresh", daemon=True).start()

    def _refresh_held(self) -> None:
        """Runs a refresh with the lock already taken, and releases it when done."""
        try:
            self._read_and_store()
        finally:
            self._lock.release()

    def _read_and_store(self) -> None:
        try:
            conn = connect(self.db_path)
        except Exception:
            log.exception("bench refresh could not open the database")
            return
        try:
            try:
                text = self.reader["source"].fetch()
                links = bench_module.linked_tasks(self.reader["todo"], text)
                counts = bench_links.replace(conn, self.reader["board"], links)
            except bench_module.BenchError as e:
                log.warning("bench refresh failed: %s", e)
                self._record(conn, str(e))
                return
            except Exception:
                log.exception("bench refresh failed")
                self._record(conn, "Could not refresh the Bench board.")
                return
            log.info("bench refresh: %(linked)d linked, %(unknown)d with an unknown slug", counts)
        finally:
            conn.close()

    def _record(self, conn: sqlite3.Connection, error: str) -> None:
        try:
            bench_links.record_error(conn, self.reader["board"], error)
        except Exception:
            log.exception("bench refresh error could not be recorded")


def _age_s(iso: str) -> float:
    return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds()
