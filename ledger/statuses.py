"""The vocabularies: pipeline statuses, interaction types and contact
relationships. One record per organisation; Won flips a lead into a client.
GET /api/meta serves these lists, so this file is the one source."""

from typing import Tuple

from .errors import Invalid

KINDS = ("lead", "client")
LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent", "won", "lost", "parked")
OPEN_LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent")
CLIENT_STATUSES = ("active", "paused", "past")
INTERACTION_TYPES = ("call", "email", "meeting", "note")
RELATIONSHIPS = ("cold", "warm", "strong")  # a contact's relationship may also be null


def initial_status(kind: str) -> str:
    if kind not in KINDS:
        raise Invalid("Unknown kind %r" % kind)
    return "lead" if kind == "lead" else "active"


def check_transition(kind: str, new: str) -> Tuple[str, str]:
    """Return the (kind, status) to store. Transitions are unordered: a lead
    may move to any lead status (a lost lead can reopen), a client to any
    client status. Only the kind limits the move. `won` is recorded in history
    but stored as an active client, and a client never goes back to a lead."""
    if kind == "lead":
        if new not in LEAD_STATUSES:
            raise Invalid("%r is not a lead status" % new)
        if new == "won":
            return "client", "active"
        return "lead", new
    if new not in CLIENT_STATUSES:
        raise Invalid("%r is not a client status" % new)
    return "client", new
