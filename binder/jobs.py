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


def in_thread(job: Callable[[], None]) -> None:
    threading.Thread(target=job, name="research", daemon=True).start()


class Refresher:
    """Refreshes the Bench cache: on a timer, and on demand when it is stale. Never two at once."""

    def __init__(self, db_path: str, reader: Dict[str, Any], run_job: Callable[[Callable[[], None]], None]):
        self.db_path, self.reader, self.run_job = db_path, reader, run_job
        self._lock = threading.Lock()
        self._last_try = float("-inf")  # time.monotonic() of the last attempt, good or bad

    def refresh(self) -> None:
        if not self._lock.acquire(blocking=False):
            return  # one is already running
        self._last_try = time.monotonic()
        try:
            conn = connect(self.db_path)
            try:
                try:
                    text = self.reader["source"].fetch()
                    links = bench_module.linked_tasks(self.reader["todo"], text)
                except bench_module.BenchError as e:
                    bench_links.record_error(conn, self.reader["board"], str(e))
                    log.warning("bench refresh failed: %s", e)
                    return
                except Exception:
                    log.exception("bench refresh failed")
                    bench_links.record_error(conn, self.reader["board"], "Could not read the Bench board.")
                    return
                counts = bench_links.replace(conn, self.reader["board"], links)
                log.info("bench refresh: %(linked)d linked, %(unknown)d with an unknown slug", counts)
            finally:
                conn.close()
        finally:
            self._lock.release()

    def refresh_if_stale(self, fetched_at: Optional[str]) -> bool:
        """Starts a refresh in the background when the cache is older than a minute. True if it started one."""
        if fetched_at and _age_s(fetched_at) < STALE_AFTER_S:
            return False
        # While Bench is down fetched_at stays old: try at most once a minute, not on every page open.
        if self._lock.locked() or time.monotonic() - self._last_try < STALE_AFTER_S:
            return False
        self.run_job(self.refresh)
        return True

    def start_timer(self) -> None:
        def loop() -> None:
            while True:
                try:
                    self.refresh()
                except Exception:  # the timer must outlive a bad refresh
                    log.exception("bench refresh failed")
                time.sleep(REFRESH_EVERY_S)
        threading.Thread(target=loop, name="bench-refresh", daemon=True).start()


def _age_s(iso: str) -> float:
    return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds()
