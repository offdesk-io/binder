"""Paste and summarise: pasted text in, the fields of a log entry out. It
saves nothing: the quick log fills its form with the answer, for the person
to check and save. The answer is checked first, so the form only ever gets
values a log entry accepts."""

import datetime
import logging
import sqlite3
import zoneinfo
from typing import Any, Callable, Dict, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Request

from ..ai import AIError
from ..db import get_db
from ..repo import contacts, orgs
from ..schemas import SummariseBody, iso_date, iso_datetime
from ..statuses import INTERACTION_TYPES
from .research import need_ai

router = APIRouter()
log = logging.getLogger("ledger.ai")


def _parsed(check: Callable[[str], Optional[str]], v: Any) -> Optional[str]:
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        return check(v.strip())
    except ValueError:
        return None


def _text(v: Any) -> Optional[str]:
    return v.strip() or None if isinstance(v, str) else None


def clean(answer: Dict[str, Any], known: Set[int]) -> Dict[str, Any]:
    ids = answer.get("contact_ids") or []
    return {
        "summary": _text(answer.get("summary")) or "",
        "type": answer.get("type") if answer.get("type") in INTERACTION_TYPES else "note",
        "happened_at": _parsed(iso_datetime, answer.get("happened_at")),
        "next_step": _text(answer.get("next_step")),
        "next_step_due": _parsed(iso_date, answer.get("next_step_due")),
        "contact_ids": sorted({i for i in ids if isinstance(i, int) and not isinstance(i, bool) and i in known}),
    }


@router.post("/summarise")
def summarise(body: SummariseBody, request: Request, db: sqlite3.Connection = Depends(get_db)):
    ai = need_ai(request)
    org = orgs.get(db, body.org_id)
    people = contacts.list_for_org(db, body.org_id)
    tz = request.app.state.settings.tz
    now_local = "%s (%s)" % (datetime.datetime.now(zoneinfo.ZoneInfo(tz)).isoformat(timespec="minutes"), tz)
    try:
        answer, usage = ai.summarise(body.text, org["name"], people, now_local)
    except AIError as e:
        raise HTTPException(502, str(e))
    log.info("summarise for org %d on %s: %d in, %d out", org["id"], usage.model, usage.input_tokens,
             usage.output_tokens)
    return clean(answer, {c["id"] for c in people})
