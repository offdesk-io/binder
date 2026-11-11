"""Request bodies. Responses are plain dicts from ledger/repo."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


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
    value_estimate: Optional[float] = None
    tags: List[str] = []
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None


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
    value_estimate: Optional[float] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    next_step: Optional[str] = None
    next_step_due: Optional[str] = None


class ContactCreate(_Body):
    name: str = Field(min_length=1, max_length=200)
    role: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False
    relationship: Optional[str] = None


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
