import sqlite3

from fastapi import APIRouter, Depends

from ..auth import Identity, guard
from ..db import get_db
from ..repo import search

router = APIRouter()


@router.get("/whoami")
def whoami(who: Identity = Depends(guard)):
    return {"email": who.email, "name": who.name, "teams": list(who.teams)}


@router.get("/search")
def search_all(q: str = "", db: sqlite3.Connection = Depends(get_db)):
    return search.query(db, q)
