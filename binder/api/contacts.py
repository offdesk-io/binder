import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import contacts, orgs
from ..schemas import ContactCreate, ContactPatch, PersonCreate

router = APIRouter()


@router.get("/orgs/{org_id}/contacts")
def list_contacts(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.list_for_org(db, org_id)


@router.post("/orgs/{org_id}/contacts", status_code=201)
def add_contact(org_id: int, body: ContactCreate, db: sqlite3.Connection = Depends(get_db),
                who: Identity = Depends(guard)):
    return contacts.create(db, org_id, body.model_dump(), who.email)


@router.get("/people")
def list_people(connector: bool = False, q: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
    return contacts.people(db, connector=connector, q=q[:200] if q else None)


@router.post("/contacts", status_code=201)
def add_person(body: PersonCreate, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    data = body.model_dump()
    org_id = data.pop("org_id")
    return contacts.create(db, org_id, data, who.email)


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.get(db, contact_id)


@router.patch("/contacts/{contact_id}")
def patch_contact(contact_id: int, body: ContactPatch, db: sqlite3.Connection = Depends(get_db),
                  who: Identity = Depends(guard)):
    return contacts.update(db, contact_id, body.model_dump(exclude_unset=True), who.email)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: int, db: sqlite3.Connection = Depends(get_db), who: Identity = Depends(guard)):
    contacts.delete(db, contact_id, who.email)
    return Response(status_code=204)


@router.get("/contacts/{contact_id}/introduced")
def contact_introduced(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    contacts.get(db, contact_id)  # 404 for an unknown person
    return orgs.introduced(db, "introduced_by_contact_id", contact_id)
