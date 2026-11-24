"""Key people: every contact starred as a key connector, and every referrer's
own person (the contact its organisation tracks in `person_contact_id`).
They are the people kept in view, nudged when quiet and thanked each year."""

import json
import sqlite3
from typing import Any, Dict, List, Optional

from ..errors import NotFound
from . import like, row
from .contacts import IS_REFERRER

# Over `contacts c JOIN organisations o ON o.id = c.org_id`.
KEY = "(c.connector = 1 OR %s)" % IS_REFERRER
# When we last logged anything with them: a log naming them, or, for a referrer's person, any log on the
# referrer, since the referrer is them.
LAST_CONTACT = ("(SELECT max(i.happened_at) FROM interactions i WHERE "
                "i.id IN (SELECT ic.interaction_id FROM interaction_contacts ic WHERE ic.contact_id = c.id) "
                "OR (%s AND i.org_id = o.id))" % IS_REFERRER)
# The leads and clients a referrer's person brought in, through the referrer. Nobody else introduces work.
INTRODUCED_COUNT = ("CASE WHEN %s THEN (SELECT count(*) FROM organisations x WHERE x.introduced_by_id = o.id) "
                    "ELSE 0 END" % IS_REFERRER)
REFERRER = ("CASE WHEN %s THEN json_object('id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status) END"
            % IS_REFERRER)
SELECT = ("SELECT c.id, c.org_id, c.name, c.role, c.email, c.phone, c.linkedin_url, c.connector, c.postal_address, "
          "o.name AS org_name, o.slug AS org_slug, %s AS referrer, %s AS last_contact, %s AS introduced_count "
          "FROM contacts c JOIN organisations o ON o.id = c.org_id " % (REFERRER, LAST_CONTACT, INTRODUCED_COUNT))


def _out(r) -> Dict[str, Any]:
    d = row(r)
    d["connector"] = bool(d["connector"])
    d["referrer"] = json.loads(d["referrer"]) if d["referrer"] else None
    return d


def is_key(conn: sqlite3.Connection, contact_id: int) -> bool:
    r = conn.execute("SELECT %s FROM contacts c JOIN organisations o ON o.id = c.org_id WHERE c.id = ?" % KEY,
                     (contact_id,)).fetchone()
    if r is None:
        raise NotFound("No contact %d" % contact_id)
    return r[0] == 1


def list_(conn: sqlite3.Connection, q: Optional[str] = None) -> List[Dict[str, Any]]:
    """Key people A to Z. `q` matches their name, role or organisation."""
    where, args = [KEY], []  # type: List[str], List[Any]
    if q:
        where.append("(c.name LIKE ? ESCAPE '\\' OR c.role LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')")
        args += [like(q)] * 3
    sql = SELECT + "WHERE %s ORDER BY c.name COLLATE NOCASE, c.id" % " AND ".join(where)
    return [_out(r) for r in conn.execute(sql, args)]
