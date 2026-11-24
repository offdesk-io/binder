import sqlite3
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request, Response

from ..auth import Identity, guard
from ..bench import task_url
from ..db import get_db
from ..errors import NotFound
from ..repo import bench_links, orgs
from ..schemas import OrgCreate, OrgPatch

router = APIRouter(prefix="/orgs")


def _owners(request: Request):
    """The emails BINDER_OWNERS allows as "Handled by"."""
    return [email for email, _ in request.app.state.settings.owners]


@router.get("")
def list_orgs(kind: str = None, status: str = None, owner: str = None, tag: str = None,
              q: str = None, won: Optional[bool] = None,
              sort: Optional[Literal["updated", "name", "last_contact", "value", "won"]] = None,
              db: sqlite3.Connection = Depends(get_db)):
    return orgs.list_(db, kind=kind, status=status, owner=owner, tag=tag, q=q, won=won, sort=sort)


@router.post("", status_code=201)
def create_org(body: OrgCreate, request: Request, db: sqlite3.Connection = Depends(get_db),
               who: Identity = Depends(guard)):
    return orgs.create(db, body.model_dump(), who.email, owners=_owners(request))


@router.get("/by-slug/{slug}")
def get_by_slug(slug: str, db: sqlite3.Connection = Depends(get_db)):
    return orgs.get_by_slug(db, slug)


@router.get("/{org_id}")
def get_org(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return orgs.get(db, org_id)


@router.patch("/{org_id}")
def patch_org(org_id: int, body: OrgPatch, request: Request, db: sqlite3.Connection = Depends(get_db),
              who: Identity = Depends(guard)):
    return orgs.update(db, org_id, body.model_dump(exclude_unset=True), who.email, owners=_owners(request))


@router.delete("/{org_id}", status_code=204)
def delete_org(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    orgs.delete(db, org_id)
    return Response(status_code=204)


@router.get("/{org_id}/status-history")
def history(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return orgs.status_history(db, org_id)


@router.get("/{org_id}/work")
def work(org_id: int, request: Request, db: sqlite3.Connection = Depends(get_db)):
    refresher = request.app.state.bench_refresher
    if refresher is None:
        raise NotFound("Bench is not connected")
    reader = request.app.state.bench
    orgs.get(db, org_id)  # 404 for an unknown organisation
    refresher.refresh_if_stale(bench_links.sync_state(db, reader["board"])["fetched_at"])
    state = bench_links.sync_state(db, reader["board"])  # a refresh run in place (tests) shows at once
    tasks = [dict(t, url=task_url(reader["url"], t["board"], t["task_key"]))
             for t in bench_links.list_for_org(db, org_id)]
    # The page asks again while this is true: a refresh is running now.
    return {"tasks": tasks, "fetched_at": state["fetched_at"], "error": state["error"],
            "refreshing": refresher.running()}
