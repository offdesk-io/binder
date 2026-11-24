"""The vocabularies: pipeline statuses, client and partner statuses,
interaction types and contact relationships. One record per organisation; Won
flips a lead into a client. GET /api/meta serves these lists, so this file is
the one source."""

from typing import Tuple

from .errors import Invalid

KINDS = ("lead", "client", "partner")
LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent", "won", "lost", "parked")
OPEN_LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent")
CLIENT_STATUSES = ("active", "paused", "past")
PARTNER_STATUSES = ("prospect", "active", "past")
INTERACTION_TYPES = ("call", "email", "meeting", "note")
RELATIONSHIPS = ("cold", "warm", "strong")  # a contact's relationship may also be null

_INITIAL = {"lead": "lead", "client": "active", "partner": "prospect"}


def initial_status(kind: str) -> str:
    if kind not in KINDS:
        raise Invalid("Unknown kind %r" % kind)
    return _INITIAL[kind]


def check_transition(kind: str, new: str) -> Tuple[str, str]:
    """Return the (kind, status) to store. Transitions are unordered: a lead
    may move to any lead status (a lost lead can reopen), a client to any
    client status, a partner to any partner status. Only the kind limits the
    move. `won` is recorded in history but stored as an active client, a client
    never goes back to a lead, and a partner never changes kind."""
    if kind == "lead":
        if new not in LEAD_STATUSES:
            raise Invalid("%r is not a lead status" % new)
        if new == "won":
            return "client", "active"
        return "lead", new
    if kind == "partner":
        if new not in PARTNER_STATUSES:
            raise Invalid("%r is not a partner status" % new)
        return "partner", new
    if new not in CLIENT_STATUSES:
        raise Invalid("%r is not a client status" % new)
    return "client", new
