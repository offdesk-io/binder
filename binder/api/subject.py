"""Export and erasure of what Binder holds about one person (the core's step 7
calls these). Allowed to a signed-in team member through Binder's own app, or
through the core's token to someone in BINDER_ADMINS; never to an agent."""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..auth import Identity, guard
from ..db import get_db
from ..repo import subject
from ..schemas import SubjectErase, subject_email

router = APIRouter(prefix="/subject")


def admin(request: Request, who: Identity = Depends(guard)) -> Identity:
    if who.token and (who.agent or who.email not in request.app.state.settings.admins):
        raise HTTPException(403, "Only an admin may export or erase a person's data")
    return who


@router.get("")
def export(email: str = Query(max_length=320), db: sqlite3.Connection = Depends(get_db),
           who: Identity = Depends(admin)):
    try:
        email = subject_email(email)
    except ValueError as e:
        raise HTTPException(422, "email: %s" % e)
    return subject.export(db, email)


@router.post("/erase")
def erase(body: SubjectErase, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(admin)):
    return subject.erase(db, body.email, who.email)
