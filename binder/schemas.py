"""Request bodies. Responses are plain dicts from binder/repo."""

import datetime
import re
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


def iso_date(v: Optional[str]) -> Optional[str]:
    """A due date is a plain YYYY-MM-DD day, or None to clear it."""
    if v is None:
        return v
    try:
        datetime.date.fromisoformat(v)
    except ValueError:
        raise ValueError("must be a date like 2026-11-20")
    return v


def iso_datetime(v: Optional[str]) -> Optional[str]:
    """An ISO 8601 date-time with a 'T' and a time zone (a trailing Z means UTC).
    Returned as UTC with microseconds, the same shape as db.now(), so stored
    times sort correctly as text."""
    if v is None:
        return v
    try:
        if "T" not in v:
            raise ValueError
        d = datetime.datetime.fromisoformat(v[:-1] + "+00:00" if v.endswith("Z") else v)
        if d.tzinfo is None:
            raise ValueError
    except ValueError:
        raise ValueError("must be an ISO 8601 date-time with a time zone, like 2026-11-01T10:00:00+00:00")
    return d.astimezone(datetime.timezone.utc).isoformat(timespec="microseconds")


def lower_email(v: Optional[str]) -> Optional[str]:
    return v.strip().lower() if v is not None else v


def web_url(v: Optional[str]) -> Optional[str]:
    """A website or profile address: http(s), or bare like example.com."""
    if v is None:
        return v
    s = v.strip()
    has_scheme = re.match(r"^[a-z][a-z0-9+.-]*:", s, re.I) and not re.match(r"^[^/:]+:\d+(/|$)", s)
    if has_scheme and not re.match(r"^https?://", s, re.I):
        raise ValueError("must be an http or https address")
    return v


def not_null(v):
    if v is None:
        raise ValueError("cannot be null")
    return v


class OrgCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    slug: Optional[str] = None
    kind: str = "lead"
    website: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None
    owner_email: Optional[str] = None
    source: Optional[str] = None
    value_estimate: Optional[float] = Field(default=None, allow_inf_nan=False, ge=0)
    tags: List[str] = []
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    introduced_by_contact_id: Optional[int] = None
    introduced_by_org_id: Optional[int] = None

    _due = field_validator("next_step_due")(iso_date)
    _owner = field_validator("owner_email")(lower_email)
    _site = field_validator("website")(web_url)


class OrgPatch(_Body):
    updated_at: str
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[str] = None
    website: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None
    owner_email: Optional[str] = None
    source: Optional[str] = None
    value_estimate: Optional[float] = Field(default=None, allow_inf_nan=False, ge=0)
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    introduced_by_contact_id: Optional[int] = None
    introduced_by_org_id: Optional[int] = None

    _name = field_validator("name")(not_null)
    _due = field_validator("next_step_due")(iso_date)
    _owner = field_validator("owner_email")(lower_email)
    _site = field_validator("website")(web_url)


class ContactCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False
    relationship: Optional[str] = None
    connector: bool = False
    postal_address: Optional[str] = None

    _email = field_validator("email")(lower_email)
    _linkedin = field_validator("linkedin_url")(web_url)


class PersonCreate(ContactCreate):
    """A person added on their own: the organisation is optional."""
    org_id: Optional[int] = None


class ContactPatch(_Body):
    updated_at: str
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: Optional[bool] = None
    relationship: Optional[str] = None
    connector: Optional[bool] = None
    postal_address: Optional[str] = None
    # Move the person to another organisation, or null for none.
    org_id: Optional[int] = None

    _required = field_validator("name", "is_primary", "connector")(not_null)
    _email = field_validator("email")(lower_email)
    _linkedin = field_validator("linkedin_url")(web_url)


class InteractionCreate(_Body):
    type: str
    summary: str = Field(min_length=1)
    happened_at: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    contact_ids: List[int] = []

    _when = field_validator("happened_at")(iso_datetime)
    _due = field_validator("next_step_due")(iso_date)


class InteractionPatch(_Body):
    updated_at: str
    type: Optional[str] = None
    summary: Optional[str] = Field(default=None, min_length=1)
    happened_at: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    contact_ids: Optional[List[int]] = None

    _required = field_validator("type", "summary", "happened_at")(not_null)
    _when = field_validator("happened_at")(iso_datetime)
    _due = field_validator("next_step_due")(iso_date)


def not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("cannot be empty")
    return v


class SummariseBody(_Body):
    org_id: int
    text: str = Field(min_length=1, max_length=30000)

    _text = field_validator("text")(not_blank)
