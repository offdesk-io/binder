"""Background research runs: one daemon thread each, in the app's own
process. uvicorn runs one worker, and a run spends minutes waiting on the
API rather than working. A run still `running` when the app starts was cut
off by a restart; create_app marks it failed."""

import logging
import threading
from typing import Any, Callable

from .ai import AIError
from .db import connect
from .repo import research

log = logging.getLogger("ledger.jobs")


def run_research(db_path: str, ai: Any, research_id: int) -> None:
    conn = connect(db_path)
    try:
        try:
            out = ai.research(research.subject(conn, research_id))
        except AIError as e:
            research.fail(conn, research_id, str(e), e.usage)
            return
        except Exception:
            log.exception("research %d failed", research_id)
            research.fail(conn, research_id, "Research failed unexpectedly. Try again.")
            return
        research.finish(conn, research_id, out.brief, out.sources, out.usage)
        log.info("research %d done on %s: %d in, %d out, %d searches", research_id, out.usage.model,
                 out.usage.input_tokens, out.usage.output_tokens, out.usage.web_searches)
    finally:
        conn.close()


def in_thread(job: Callable[[], None]) -> None:
    threading.Thread(target=job, name="research", daemon=True).start()
