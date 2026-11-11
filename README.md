# Ledger

Leads and clients for Offdesk. Sibling to Bench: same sign-in, same Tenon design system.
Design: `docs/superpowers/specs/2026-11-11-ledger-design.md`.

```
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
(cd web && npm install && npm run build)
LEDGER_DB=ledger.db .venv/bin/python -m ledger     # http://127.0.0.1:8770
```

The backend serves the built app from `web/dist` (`LEDGER_WEB` points elsewhere).
For frontend work, run the backend as above and `cd web && npm run dev`, then
open `http://127.0.0.1:5173`, which sends `/api` to the backend.

From `web/`: `npm run check` type-checks, `npm test` runs the Vitest suite, and
`npm run e2e` builds and runs the Playwright flows at 390px and 1280px against a
throwaway database (`npx playwright install chromium` once first).

`LEDGER_AUTH=header` is the server behind nginx, and needs `LEDGER_DB` set to an absolute path; unset is local development. Ledger listens on loopback only in both modes. `LEDGER_TZ` (default `Europe/London`) decides what "today" means for the needs-attention feed.

## API

Every route sits under `/api` and needs sign-in, except `GET /api/health`.
Every non-GET request needs the header `X-Ledger: 1`. Times are UTC ISO strings
with microseconds; dates (`next_step_due`) are `YYYY-MM-DD`.

### Records

- **Organisation** (`/api/orgs`, `/api/orgs/{id}`, `/api/orgs/by-slug/{slug}`):
  `id`, `slug`, `name`, `kind` (`lead` or `client`), `status`, `website`,
  `sector`, `size`, `location`, `owner_email`, `source`, `value_estimate`,
  `tags` (list), `summary`, `next_step`, `next_step_due`, `last_contact`,
  `created_at`, `updated_at`, `updated_by`.
- **Contact** (`/api/orgs/{id}/contacts`, `/api/contacts/{id}`): `id`,
  `org_id`, `org_name`, `org_slug`, `name`, `role`, `email`, `phone`,
  `linkedin_url`, `notes`, `is_primary` (bool), `relationship` (or null),
  `created_at`, `updated_at`, `updated_by`. The list and the single contact
  return the same fields.
- **Interaction** (`/api/orgs/{id}/interactions`, `/api/interactions/{id}`):
  `id`, `org_id`, `type`, `happened_at`, `summary`, `next_step`,
  `next_step_due`, `contact_ids`, `author_email`, `created_at`, `updated_at`,
  `updated_by`.
- **Status change** (`/api/orgs/{id}/status-history`): `id`, `org_id`,
  `from_status`, `to_status`, `at`, `by_email`.

A record's `kind` is `lead` or `client`, and only organisations have one.

### Feed items

Search, timeline and activity return items, not records. On an item, `kind` is
what the item is, and the pair (`kind`, `id`) identifies it: an interaction and
a status change can share an `id`.

- **Search** (`/api/search?q=`): `kind` (`org`, `contact` or `interaction`),
  `id`, `org_id`, `org_name`, `org_slug`, `title`, `snippet` (matches in `[ ]`).
- **Timeline** (`/api/orgs/{id}/timeline`) and **activity**
  (`/api/activity?limit=`): `kind` (`interaction` or `status`), `id`,
  `org_id`, `at`, `by_email`. Interaction items add `type` and `summary`;
  status items add `from_status` and `to_status`. Timeline interaction items
  also carry the interaction's other fields; activity items carry `org_name`
  and `org_slug`.
- **Needs attention** (`/api/attention`): `{org, reasons}`, where `org` is an
  organisation and `reasons` is a list of `overdue`, `quiet` and `stuck`.

### Vocabularies

`GET /api/meta` returns `kinds`, `lead_statuses`, `open_lead_statuses`,
`client_statuses`, `interaction_types` and `relationships`, from
`ledger/statuses.py`. Status moves are unordered within a kind: a lead can go
to any lead status, a client to any client status. Moving a lead to `won` makes
it an active client, and a client never goes back to a lead.

### Saves and errors

Every PATCH carries the `updated_at` it loaded. A stale one gets 409.

Every error body has `detail`, a sentence to show people:

- 401 not signed in, 403 wrong team or missing `X-Ledger`, 404 not found.
- 409: a stale save adds `current`, the record as it is now.
- 422: a broken rule. Request validation adds `errors`, a list of
  `{loc, msg, type}`, and `detail` joins them as `field: message`.
