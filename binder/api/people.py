import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends

from ..db import get_db
from ..repo import people

router = APIRouter()


@router.get("/people")
def list_people(q: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
    return people.list_(db, q=q[:200] if q else None)
