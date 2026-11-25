"""Year-end thanks for key people: a year's checklist, and one person's row."""

import datetime
import sqlite3
import zoneinfo
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Request

from ..auth import Identity, guard
from ..db import get_db
from ..repo import thanks
from ..schemas import ThanksPut

router = APIRouter(prefix="/thanks")


@router.get("")
def year_list(request: Request, year: Optional[int] = Query(default=None, ge=2000, le=2100),
              db: sqlite3.Connection = Depends(get_db)):
    if year is None:  # this year where the team is, as BINDER_TZ says
        year = datetime.datetime.now(zoneinfo.ZoneInfo(request.app.state.settings.tz)).year
    return thanks.for_year(db, year)


@router.put("/{contact_id}/{year}")
def put_thanks(contact_id: int, body: ThanksPut, year: int = Path(ge=2000, le=2100),
               db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    return thanks.put(db, contact_id, year, body.model_dump(exclude_unset=True), who.by)
