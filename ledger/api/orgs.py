import sqlite3

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import orgs
from ..schemas import OrgCreate, OrgPatch

router = APIRouter(prefix="/orgs")


@router.get("")
def list_orgs(kind: str = None, status: str = None, owner: str = None, tag: str = None,
              q: str = None, sort: str = "updated", db: sqlite3.Connection = Depends(get_db)):
    return orgs.list_(db, kind=kind, status=status, owner=owner, tag=tag, q=q, sort=sort)


@router.post("", status_code=201)
def create_org(body: OrgCreate, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    return orgs.create(db, body.model_dump(), who.email)


@router.get("/by-slug/{slug}")
def get_by_slug(slug: str, db: sqlite3.Connection = Depends(get_db)):
    return orgs.get_by_slug(db, slug)


@router.get("/{org_id}")
def get_org(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return orgs.get(db, org_id)


@router.patch("/{org_id}")
def patch_org(org_id: int, body: OrgPatch, db: sqlite3.Connection = Depends(get_db),
              who: Identity = Depends(guard)):
    return orgs.update(db, org_id, body.model_dump(exclude_unset=True), who.email)


@router.delete("/{org_id}", status_code=204)
def delete_org(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    orgs.delete(db, org_id)
    return Response(status_code=204)


@router.get("/{org_id}/status-history")
def history(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return orgs.status_history(db, org_id)
