import sqlite3

from fastapi import APIRouter, Depends, Response

from ..auth import Identity, guard
from ..db import get_db
from ..repo import contacts
from ..schemas import ContactCreate, ContactPatch

router = APIRouter()


@router.get("/orgs/{org_id}/contacts")
def list_contacts(org_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.list_for_org(db, org_id)


@router.post("/orgs/{org_id}/contacts", status_code=201)
def add_contact(org_id: int, body: ContactCreate, db: sqlite3.Connection = Depends(get_db),
                who: Identity = Depends(guard)):
    return contacts.create(db, org_id, body.model_dump(), who.by)


@router.get("/contacts/{contact_id}")
def get_contact(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    return contacts.get(db, contact_id)


@router.patch("/contacts/{contact_id}")
def patch_contact(contact_id: int, body: ContactPatch, db: sqlite3.Connection = Depends(get_db),
                  who: Identity = Depends(guard)):
    return contacts.update(db, contact_id, body.model_dump(exclude_unset=True), who.by)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: int, db: sqlite3.Connection = Depends(get_db)):
    contacts.delete(db, contact_id)
    return Response(status_code=204)
