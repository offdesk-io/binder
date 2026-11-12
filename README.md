# Binder

Leads and clients for Offdesk. Sibling to Bench: same sign-in, same Tenon design system.
Design: `docs/superpowers/specs/2026-11-11-binder-design.md`.

```
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest
(cd web && npm install && npm run build)
BINDER_DB=binder.db .venv/bin/python -m binder     # http://127.0.0.1:8770
```

The backend serves the built app from `web/dist` (`BINDER_WEB` points elsewhere).
For frontend work, run the backend as above and `cd web && npm run dev`, then
open `http://127.0.0.1:5173`, which sends `/api` to the backend.

Sign out posts to nginx's `/auth/logout`, so it does nothing useful in local development.

From `web/`: `npm run check` type-checks, `npm test` runs the Vitest suite, and
`npm run e2e` builds and runs the Playwright flows at 390px and 1280px against a
throwaway database (`npx playwright install chromium` once first).

`BINDER_AUTH=header` is the server behind nginx, and needs `BINDER_DB` set to an absolute path; unset is local development. Binder listens on loopback only in both modes. `BINDER_TZ` (default `Europe/London`) decides what "today" means for the needs-attention feed.

Research and "Paste and summarise" call the Anthropic API from the server.
`ANTHROPIC_API_KEY` turns them on; without it they are off, and the page hides
their buttons. `BINDER_AI=fake` gives canned answers instead, for local
development and the Playwright flows (it refuses to start in header mode), and
`BINDER_AI=off` turns them off with a key set. `pytest -m online` makes one
real research call and one real summarise call about a made-up company: it
costs money and never runs in CI.

Binder reads Bench's `work` board to show each organisation's tasks: those
tagged `[lead:: <slug>]`. On the server it uses its own sign-in token,
`BINDER_BENCH_TOKEN`, against `BINDER_BENCH_URL` (default
`https://bench.offdesk.io`) and `BINDER_BENCH_BOARD` (default `work`), and
parses the board with Bench's `core/todo.py` from `BINDER_BENCH_CORE`. For
local development, `BINDER_BENCH_FILE=tests/bench_todo.md
BINDER_BENCH_CORE=../bench/core` reads a file instead. Without a token or a
file, Bench is off and the Work section is hidden. Binder only ever reads the
board; it never writes `todo.md`. A refresh runs every 10 minutes, and when the
cache is more than a minute old as an organisation opens. While Bench is down,
it retries at most once a minute.

## API

Every route sits under `/api` and needs sign-in, except `GET /api/health`.
Every non-GET request needs the header `X-Binder: 1`. Times are UTC ISO strings
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
- **Bench task** (`GET /api/orgs/{id}/work`, answering a **Work** record):
  a task tagged `[lead:: <slug>]` with that organisation's slug. `task_key`,
  `board`, `title`, `state`, `done` (bool), `done_on` (a date, or null), `due`
  (a date, or null), `assignee` (or null), `fetched_at`, `url` (the task on
  Bench). **Work**: `tasks` (a list of Bench tasks), `fetched_at` (null until
  the first read finishes, which the page shows as "Reading Bench...") and
  `error` (why the last refresh failed, or null). The route answers from the
  cache at once and, when the cache is stale, starts a refresh in the
  background. It is 404 when Bench is off.
- **Research** (`/api/orgs/{id}/research` and `/api/contacts/{id}/research`
  list a record's runs, newest first; `/api/research/{id}` is one run): `id`,
  `org_id`, `contact_id` (null for an organisation's own brief), `status`
  (`running`, `done` or `failed`), `brief` (null until done), `sources` (a
  list of `{url, title}`), `model`, `input_tokens`, `output_tokens`,
  `web_searches`, `cost_usd` (US dollars, or null for a model with no listed
  price), `error` (why it failed), `run_at`, `finished_at`, `author_email`.
  A `brief` has `overview`, `what_they_do`, `size_and_funding`, `people` (each
  `{name, role, contact_id, why}`, where `contact_id` is null for someone not
  yet in Binder), `recent_news` (each `{headline, date, url}`),
  `likely_needs`, `offdesk_angle` and `open_questions`.
  `POST` to either list starts a run and answers 202 with the running row. A
  record can have one run going at a time: a second `POST` gets 409 with
  `current`, the running row. Poll until `status` is no longer `running`.

A record's `kind` is `lead` or `client`, and only organisations have one.

### Feed items

Search, timeline and activity return items, not records. On an item, `kind` is
what the item is, and the pair (`kind`, `id`) identifies it: an interaction and
a status change can share an `id`.

- **Search** (`/api/search?q=`): `kind` (`org`, `contact`, `interaction` or
  `research`), `id`, `org_id`, `org_name`, `org_slug`, `title`, `snippet`
  (each match wrapped in the control characters `\u0002` and `\u0003`), and
  `contact_id`: the person a research brief is about, null otherwise.
- **Timeline** (`/api/orgs/{id}/timeline`) and **activity**
  (`/api/activity?limit=`): `kind` (`interaction` or `status`), `id`,
  `org_id`, `at`, `by_email`. Interaction items add `type` and `summary`;
  status items add `from_status` and `to_status`. A timeline also has `bench`
  items, one per finished Bench task: `kind`, `id` (the task key), `title`,
  `at` (the done date at midnight UTC), `by_email` (the assignee, or null) and
  `url`. Timeline interaction items
  also carry the interaction's other fields; activity items carry `org_name`
  and `org_slug`.
- **Needs attention** (`/api/attention`): `{org, reasons}`, where `org` is an
  organisation and `reasons` is a list of `overdue`, `quiet` and `stuck`.

### Summarise

`POST /api/summarise` with `{org_id, text}` turns pasted text into the fields
of a log entry: `{summary, type, happened_at, next_step, next_step_due,
contact_ids}`. It saves nothing. Values the model got wrong are dropped:
`type` falls back to `note`, dates that do not parse are null, and
`contact_ids` keeps only that organisation's people. A failed AI call is 502.

### Vocabularies

`GET /api/meta` returns `kinds`, `lead_statuses`, `open_lead_statuses`,
`client_statuses`, `interaction_types` and `relationships`, from
`binder/statuses.py`. `ai` is true when the server can run research and summarise; when it is false, those routes answer 503. `bench` is true when Bench is connected; when it is false, the work route answers 404 and the Work section is hidden. Status moves are unordered within a kind: a lead can go
to any lead status, a client to any client status. Moving a lead to `won` makes
it an active client, and a client never goes back to a lead.

### Saves and errors

Every PATCH carries the `updated_at` it loaded. A stale one gets 409.

Every error body has `detail`, a sentence to show people:

- 401 not signed in, 403 wrong team or missing `X-Binder`, 404 not found.
- 409: a stale save adds `current`, the record as it is now.
- 422: a broken rule. Request validation adds `errors`, a list of
  `{loc, msg, type}`, and `detail` joins them as `field: message`.

## Importing the Leads bucket

A one-off move of the `work` board's **Leads** bucket into Binder, in two steps
(the same Bench settings as above, plus `BINDER_DB`):

```
python -m scripts.import_from_bench plan [--out import-plan.csv]
python -m scripts.import_from_bench apply import-plan.csv --by you@example.com [--links import-links.json]
```

`plan` writes `import-plan.csv`, one row per Leads task. Edit it before
applying: give two rows the same slug to merge them into one organisation,
clear a slug to skip a task, and correct the name, status and owner. `apply`
creates the organisations, adds one note per task with its notes and
sub-steps, and writes `import-links.json`. Running `apply` again adds nothing
twice. Binder never writes `todo.md`, so the last step is: ask the PA to add
`[lead:: <slug>]` to each task listed in `import-links.json`, on the work
board.

`import-plan.csv` and `import-links.json` hold real names and are git-ignored.
