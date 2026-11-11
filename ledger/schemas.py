"""Request bodies. Responses are plain dicts from ledger/repo."""

import datetime
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
    """An ISO 8601 date-time; a trailing Z means UTC."""
    if v is None:
        return v
    try:
        datetime.datetime.fromisoformat(v[:-1] + "+00:00" if v.endswith("Z") else v)
    except ValueError:
        raise ValueError("must be an ISO 8601 date-time like 2026-11-01T10:00:00+00:00")
    return v


def lower_email(v: Optional[str]) -> Optional[str]:
    return v.strip().lower() if v is not None else v


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

    _due = field_validator("next_step_due")(iso_date)
    _owner = field_validator("owner_email")(lower_email)


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

    _name = field_validator("name")(not_null)
    _due = field_validator("next_step_due")(iso_date)
    _owner = field_validator("owner_email")(lower_email)


class ContactCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False
    relationship: Optional[str] = None

    _email = field_validator("email")(lower_email)


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

    _name = field_validator("name")(not_null)
    _email = field_validator("email")(lower_email)


class InteractionCreate(_Body):
    type: str
    summary: str = Field(min_length=1)
    happened_at: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    contact_ids: List[int] = []


class InteractionPatch(_Body):
    updated_at: str
    type: Optional[str] = None
    summary: Optional[str] = Field(default=None, min_length=1)
    happened_at: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None
    contact_ids: Optional[List[int]] = None
