import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from ..auth import Identity, guard
from ..bench import task_url
from ..db import get_db
from ..repo import interactions, timeline
from ..schemas import InteractionCreate, InteractionPatch

router = APIRouter()


@router.get("/orgs/{org_id}/interactions")
def list_interactions(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return interactions.list_for_org(db, org_id)


@router.post("/orgs/{org_id}/interactions", status_code=201)
def log_interaction(org_id: int, body: InteractionCreate, db: sqlite3.Connection = Depends(get_db),
                    who: Identity = Depends(guard)):
    return interactions.create(db, org_id, body.model_dump(), who.by)


@router.get("/orgs/{org_id}/timeline")
def org_timeline(org_id: int, request: Request, db: sqlite3.Connection = Depends(get_db)):
    reader = request.app.state.bench
    link = (lambda board, key: task_url(reader["url"], board, key)) if reader is not None else None
    return timeline.for_org(db, org_id, task_url=link)


@router.get("/contacts/{contact_id}/interactions")
def contact_interactions(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    return interactions.list_for_contact(db, contact_id)


@router.patch("/interactions/{interaction_id}")
def patch_interaction(interaction_id: int, body: InteractionPatch, db: sqlite3.Connection = Depends(get_db),
                      who: Identity = Depends(guard)):
    return interactions.update(db, interaction_id, body.model_dump(exclude_unset=True), who.by)


@router.delete("/interactions/{interaction_id}", status_code=204)
def delete_interaction(interaction_id: int, db: sqlite3.Connection = Depends(get_db)):
    interactions.delete(db, interaction_id)
    return Response(status_code=204)
