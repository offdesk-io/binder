import sqlite3

from fastapi import APIRouter, Depends

from ..auth import Identity, guard
from ..db import get_db
from ..repo import feeds, search

router = APIRouter()


@router.get("/whoami")
def whoami(who: Identity = Depends(guard)):
    return {"email": who.email, "name": who.name, "teams": list(who.teams)}


@router.get("/search")
def search_all(q: str = "", db: sqlite3.Connection = Depends(get_db)):
    return search.query(db, q)


@router.get("/attention")
def needs_attention(db: sqlite3.Connection = Depends(get_db)):
    return feeds.attention(db)


@router.get("/activity")
def recent_activity(limit: int = 30, db: sqlite3.Connection = Depends(get_db)):
    return feeds.activity(db, limit=min(max(limit, 1), 200))
