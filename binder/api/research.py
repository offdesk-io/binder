"""Research briefs. Starting one answers 202 at once with the running row;
the run goes on in the background, and the page polls the list until it is
done or failed. A second start while one runs is a 409 with `current`."""

import sqlite3
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import jobs
from ..auth import Identity, guard
from ..db import get_db
from ..repo import research

router = APIRouter()


def need_ai(request: Request) -> Any:
    ai = request.app.state.ai
    if ai is None:
        raise HTTPException(503, "AI is not set up on this server")
    return ai


def _launch(request: Request, db: sqlite3.Connection, run: Dict[str, Any]) -> Dict[str, Any]:
    ai = request.app.state.ai
    db_path = request.app.state.settings.db_path
    try:
        request.app.state.run_job(lambda: jobs.run_research(db_path, ai, run["id"]))
    except Exception:
        # The run never started, so nothing will end it: mark it failed rather than leave it running.
        research.fail(db, run["id"], "Could not start the research. Try again.")
        raise
    return run


@router.post("/orgs/{org_id}/research", status_code=202)
def research_org(org_id: int, request: Request, db: sqlite3.Connection = Depends(get_db),
                 who: Identity = Depends(guard)):
    need_ai(request)
    return _launch(request, db, research.start(db, who.by, org_id=org_id))


@router.post("/contacts/{contact_id}/research", status_code=202)
def research_contact(contact_id: int, request: Request, db: sqlite3.Connection = Depends(get_db),
                     who: Identity = Depends(guard)):
    need_ai(request)
    return _launch(request, db, research.start(db, who.by, contact_id=contact_id))


@router.get("/orgs/{org_id}/research")
def org_research(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return research.list_for_org(db, org_id)


@router.get("/contacts/{contact_id}/research")
def contact_research(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    return research.list_for_contact(db, contact_id)


@router.get("/research/{research_id}")
def one_run(research_id: int, db: sqlite3.Connection = Depends(get_db)):
    return research.get(db, research_id)
