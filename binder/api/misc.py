import sqlite3

from fastapi import APIRouter, Depends, Request

from .. import statuses
from ..auth import Identity, guard
from ..db import get_db
from ..repo import feeds, search

router = APIRouter()


@router.get("/whoami")
def whoami(who: Identity = Depends(guard)):
    return {"email": who.email, "name": who.name, "teams": list(who.teams)}


@router.get("/meta")
def meta(request: Request):
    return {
        "kinds": list(statuses.KINDS),
        "lead_statuses": list(statuses.LEAD_STATUSES),
        "open_lead_statuses": list(statuses.OPEN_LEAD_STATUSES),
        "client_statuses": list(statuses.CLIENT_STATUSES),
        "interaction_types": list(statuses.INTERACTION_TYPES),
        "relationships": list(statuses.RELATIONSHIPS),
        "ai": request.app.state.ai is not None,
    }


@router.get("/search")
def search_all(q: str = "", db: sqlite3.Connection = Depends(get_db)):
    return search.query(db, q[:200])


@router.get("/attention")
def needs_attention(request: Request, db: sqlite3.Connection = Depends(get_db)):
    return feeds.attention(db, tz=request.app.state.settings.tz)


@router.get("/activity")
def recent_activity(limit: int = 30, db: sqlite3.Connection = Depends(get_db)):
    return feeds.activity(db, limit=min(max(limit, 1), 200))
