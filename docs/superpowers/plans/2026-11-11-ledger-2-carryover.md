# Carry-over into plan 2 (frontend)

From the final review of plan 1 (core API). Fix these at the start of plan 2,
before the frontend depends on any response shape.

1. Contact responses: `contacts.get` returns `org_name` and `org_slug`, but
   `list_for_org` does not (`ledger/repo/contacts.py`). Make the two return the
   same fields.
2. Timeline author: interaction items carry `author_email` and status items carry
   `by_email`. Map interactions to `by_email` too, as `feeds.activity` already
   does (`ledger/repo/timeline.py`).
3. Naming: `kind` is `lead`/`client` on an organisation but the item type
   (`org`/`contact`/`interaction`/`status`) on search, timeline and activity
   items. Search calls the id `ref_id`; timeline and activity call it `id`.
   Write the shapes down in one place (the `ledger/api/__init__.py` docstring or
   the README).
4. Errors: `detail` is a string for 401/403/404/409 and `Invalid` 422s, but a
   list of `{loc,msg,type}` for request-validation 422s. Pick one shape, or
   document both.
5. Add `GET /api/meta` returning the lead and client statuses, the interaction
   types and the relationships, so `statuses.py` stays the one source.
6. Add `tzdata` to `pyproject.toml` dependencies, so `LEDGER_TZ` works on minimal
   servers.
7. `check_transition` ignores `current` (`ledger/statuses.py`). Document that
   transitions are unordered, or use it.

For plans 3 and 4: research rows reuse the `search` table with
`kind='research'`; a contact's research must store `org_id`; add a
`research_ad` trigger. The Bench lead picker needs CORS for `bench.offdesk.io`
with credentials.
