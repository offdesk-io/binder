"""The vocabularies: kinds, statuses, interaction types and contact
relationships. One record per organisation; Won flips a lead into a client.
GET /api/meta serves these lists, so this file is the one source.

Leads and clients are the pipeline. Partners (organisations OFFDESK has or
seeks an agreement with) and referrers (people who pass work on for a fee,
kept as an organisation named after the person) introduce leads and clients.
Each kind has its own statuses, and its first one is where a new record starts."""

from typing import Tuple

from .errors import Invalid

KINDS = ("lead", "client", "partner", "referrer")
PIPELINE_KINDS = ("lead", "client")
INTRODUCER_KINDS = ("partner", "referrer")
LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent", "won", "lost", "parked")
OPEN_LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent")
CLIENT_STATUSES = ("active", "paused", "past")
PARTNER_STATUSES = ("identified", "in_talks", "terms_sent", "active", "paused")
REFERRER_STATUSES = ("identified", "in_talks", "active", "paused")
INTERACTION_TYPES = ("call", "email", "meeting", "note")
RELATIONSHIPS = ("cold", "warm", "strong")  # a contact's relationship may also be null


def statuses_for(kind: str) -> Tuple[str, ...]:
    if kind == "lead":
        return LEAD_STATUSES
    if kind == "client":
        return CLIENT_STATUSES
    if kind == "partner":
        return PARTNER_STATUSES
    if kind == "referrer":
        return REFERRER_STATUSES
    raise Invalid("Unknown kind %r" % kind)


def initial_status(kind: str) -> str:
    return statuses_for(kind)[0]


def check_transition(kind: str, new: str) -> Tuple[str, str]:
    """Return the (kind, status) to store. Transitions are unordered: a record
    may move to any status of its kind (a lost lead can reopen). Only the kind
    limits the move. `won` is recorded in history but stored as an active
    client, and a client never goes back to a lead through a status. Changing
    the kind itself is a separate edit (repo.orgs.update)."""
    if new not in statuses_for(kind):
        raise Invalid("%r is not a %s status" % (new, kind))
    if kind == "lead" and new == "won":
        return "client", "active"
    return kind, new
