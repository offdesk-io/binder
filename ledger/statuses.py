"""The pipeline. One record per organisation; Won flips a lead into a client."""

from typing import Tuple

from .errors import Invalid

LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent", "won", "lost", "parked")
OPEN_LEAD_STATUSES = ("lead", "contacted", "in_conversation", "proposal_sent")
CLIENT_STATUSES = ("active", "paused", "past")
KINDS = ("lead", "client")


def initial_status(kind: str) -> str:
    if kind not in KINDS:
        raise Invalid("Unknown kind %r" % kind)
    return "lead" if kind == "lead" else "active"


def check_transition(kind: str, current: str, new: str) -> Tuple[str, str]:
    """Return the (kind, status) to store. `won` is recorded in history but
    stored as an active client."""
    if kind == "lead":
        if new not in LEAD_STATUSES:
            raise Invalid("%r is not a lead status" % new)
        if new == "won":
            return "client", "active"
        return "lead", new
    if new not in CLIENT_STATUSES:
        raise Invalid("%r is not a client status" % new)
    return "client", new
