# Ledger — design

Date: 2026-11-11
Status: approved in brainstorm, awaiting spec review

## Why

Leads are managed as tasks on the offdesk Bench board today, in the **Leads**
bucket. When a task goes to Done the lead effectively disappears: its notes,
contacts and history are buried in a finished card. Ledger is the permanent
home for every lead and client: status, information, contacts, who to talk to,
research, and every interaction, quick to find from desktop or phone.

Ledger is the second app in the Offdesk ecosystem beside Bench. Both share the
Offdesk sign-in and the Tenon design system.

## Decisions

| Question | Decision |
|---|---|
| Ledger vs Bench | Ledger owns the client record; Bench owns the work. Bench tasks link to a Ledger record with `[lead:: <slug>]`. |
| Import existing leads | Yes, one-off import from the offdesk board's **Leads** bucket. |
| Visibility | The whole Offdesk team sees and edits every record. Each record has an owner (who drives it). |
| Research in v1 | AI research brief on demand, per organisation or contact. |
| Interactions in v1 | Manual quick-log, plus "paste and summarise". No Gmail/Calendar sync. |
| Pipeline | One record per organisation that flips from lead to client on Won. |
| Stack | FastAPI + SQLite + React/Vite/TypeScript + Tenon. |
| Hosting | Same Hetzner server as Bench, at `https://ledger.offdesk.io`. |

## Architecture

- **Repo:** `ledger`, its own GitHub repository, sibling to Bench.
- **Backend:** FastAPI served by uvicorn on `127.0.0.1:<port>` only. It also
  serves the built SPA as static files.
- **Frontend:** React + TypeScript, built by Vite. Tenon is a git dependency
  pinned to a tag (same as Bench). Mobile-first, with one layout breakpoint at
  about 768px. Light and dark come from Tenon's themes. A PWA manifest lets it
  be installed to a phone's home screen. There is no offline mode.
- **Storage:** SQLite in WAL mode, kept in a data folder outside the repo,
  with a nightly dated backup.

### Sign-in

nginx in front of `ledger.offdesk.io` uses the same `auth_request` to the
Offdesk sign-in service as Bench, and passes the same headers:
`X-Offdesk-Email`, `X-Offdesk-Name` (percent-encoded UTF-8) and `X-Offdesk-Teams`.

- `LEDGER_AUTH=header` turns sign-in mode on. Any other non-empty value
  refuses to start. Signed-in mode refuses to start on any address but
  127.0.0.1.
- A request with no email gets 401. Someone not in the `offdesk` team gets 403.
- Every non-GET request must carry `X-Ledger: 1` (CSRF guard, as Bench does).
- `GET /api/whoami` returns the signed-in person. The header shows their
  name and a Sign out button, which posts to nginx's `/auth/logout`.
- Unset `LEDGER_AUTH` is local development: one fixed dev identity.

## Data model

All tables have `id`, `created_at`, `updated_at` and `updated_by` (email).

- **organisations**: `slug` (unique, used by Bench links), `name`, `website`,
  `sector`, `size`, `location`, `kind` (`lead` | `client`), `status`,
  `owner_email`, `source`, `value_estimate`, `tags` (JSON list), `summary`,
  `next_step`, `next_step_due`.
- **contacts**: `org_id`, `name`, `role`, `email`, `phone`, `linkedin_url`,
  `notes`, `is_primary` ("who to talk to"), `relationship` (`cold` | `warm` |
  `strong`).
- **interactions**: `org_id`, `type` (`call` | `email` | `meeting` | `note`),
  `happened_at`, `summary`, `next_step`, `next_step_due`, `author_email`.
  **interaction_contacts** joins interactions to contacts.
- **research**: `org_id` or `contact_id` (exactly one), `status` (`running` |
  `done` | `failed`), `brief` (JSON, schema below), `sources` (JSON),
  `model`, `input_tokens`, `output_tokens`, `error`, `run_at`, `author_email`.
  Append only: a re-run adds a row.
- **status_history**: `org_id`, `from_status`, `to_status`, `at`, `by_email`.
- **bench_links**: `org_id`, `board`, `task_key`, `title`, `state`, `done`,
  `due`, `fetched_at`. A cache: the source of truth is the tag in Bench.
- **search**: an FTS5 virtual table over organisation name, summary and tags,
  contact name, role and notes, interaction summaries, and research brief text,
  kept in step by triggers.

### Statuses

- Lead: `lead` → `contacted` → `in_conversation` → `proposal_sent`, then
  `won` or `lost` / `parked`.
- `won` sets `kind = client` and `status = active`.
- Client: `active` → `paused` → `past`.

Every status change writes a `status_history` row.

### Concurrent edits

Last write wins, guarded by `updated_at`. A save carrying a stale
`updated_at` gets 409. The client reloads the record and shows what changed.

## Screens

1. **Home.** "Needs attention": a next step that is overdue, no interaction
   in 14 days on an open lead, or more than 30 days in one stage. Plus a
   recent-activity feed. This is the landing screen on a phone.
2. **Pipeline.** Columns by status, using Tenon `Column`/`Card` (the same look
   as Bench). On desktop you drag a card to change its status. On a phone it
   shows one stage at a time with tabs, and a status picker replaces the drag.
3. **List.** A table of name, status, owner, last contact, next step and
   value, with filters for status, owner, tag and kind, and sorting. On a
   phone it becomes stacked cards.
4. **Search.** Global, in the top bar, opened with `/`. Results are grouped
   into organisations, contacts, interactions and research, each with a
   snippet.
5. **Organisation page.** A header with name, status pill, owner, website
   and quick actions (Log, Research, call/email links). Then sections:
   - Overview: summary, key facts, next step.
   - People: contacts, with the primary one flagged.
   - Timeline: interactions, status changes and Bench tasks, mixed by date.
   - Research: the latest brief and its history.
   - Work: linked Bench tasks, open and done, each a link to
     `https://bench.offdesk.io/#!board=offdesk!task=<key>`.

   On a phone the sections stack, with a sticky bottom bar holding Log and
   Call.
6. **Quick log.** A bottom sheet on a phone, a modal on desktop. Fields: type,
   date (defaults to now), contacts, text, next step and its date. A "Paste
   and summarise" toggle runs the AI summary (below) and fills the fields for
   editing before saving.
7. **Contact page.** Details, organisation, interactions with them, and
   their research brief.

## AI

The AI calls run only on the server, on the Offdesk Anthropic API key (an
environment variable on the server). The browser never sees the key. All of
it sits behind one Python interface (`ai.research(...)`, `ai.summarise(...)`)
so tests can swap in a fake.

### Research brief

- `POST /api/orgs/{id}/research` (or `/api/contacts/{id}/research`) starts a
  background job and returns the `research` row as `running`. Only one running
  job per record is allowed (409 if one is already running). The UI polls the
  row.
- The call uses model `claude-opus-5-5` with adaptive thinking, effort
  `high`, streaming, and server-side tools `web_search_20260209` (`max_uses`
  10) and `web_fetch_20260209`. A refusal falls back to another model on the
  server (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`).
- Input: the record's known facts, its contacts, its last 20 interactions and
  the latest previous brief, so a re-run updates the brief rather than
  starting over.
- The output is structured (JSON schema) with: `overview`, `what_they_do`,
  `size_and_funding`, `people` (each matched to an existing contact id or
  marked as a suggestion), `recent_news`, `likely_needs`, `offdesk_angle`,
  `open_questions`, `sources` (url + title).
- Suggested people show as "Add?" chips. Nothing is added to contacts
  without a click.
- Each run records its token use, and the Research section shows the cost
  of each run.

### Paste and summarise

- `POST /api/summarise` takes the pasted text and the org id. It uses model
  `claude-opus-5-5`, effort `low`, no tools, and structured output: `summary`,
  `type`, `happened_at`, `next_step`, `next_step_due`, `contact_ids` (matched
  from the org's contacts). It returns the result to the form and saves
  nothing.

### Failure

A failed or refused job ends as `status = failed` with the reason in `error`.
The UI shows it with a Retry button. A failed job never writes into the
organisation or its contacts.

## Bench integration

### On the Bench side

- New task field `[lead:: <slug>]`, added to `core/todo.js` and
  `core/todo.py` together, with `core/fixtures/` regenerated and both suites
  run.
- The card shows an organisation chip (`cardModel()`, `cardHTML()` and
  `TaskCard` changed together, as Bench's parity tests require). The chip
  links to `https://ledger.offdesk.io/o/<slug>`.
- The drawer gets a "Lead" picker that searches Ledger's `GET /api/orgs?q=`
  from the browser. This needs the sign-in cookie to cover both subdomains,
  plus CORS on Ledger for `bench.offdesk.io` with credentials. Check the
  cookie scope first. If it is not shared, the picker calls a small proxy
  route on Bench's server instead.

### On the Ledger side

- Ledger reads linked tasks from Bench server to server, on 127.0.0.1, as a
  service identity with read access to the offdesk board only (the same
  pattern as the PA's `pa_save` identity). It parses the list with Bench's
  `core/todo.py`, imported by path from the Bench checkout on the server.
- It refreshes every 10 minutes, and again when an organisation page opens
  and the cache is more than 1 minute old. It lists every task with that
  slug, open and done.
- Ledger never writes `todo.md`.

### One-off import

`scripts/import_from_bench.py`:

1. Reads the offdesk board and takes every task in the **Leads** bucket, open
   and done.
2. Proposes one organisation per task: a name and slug from the title, notes
   and sub-step text as a `note` interaction dated at the task's creation,
   status guessed from the task's column, owner from `[to::]`.
3. Dry run by default: it prints a table (task → org, slug, status) for the
   owner to approve and edit.
4. `--apply` creates the organisations and writes `import-links.json`
   (task key → slug). Bench's tick queue only ticks sub-tasks, so the tags
   are applied by the PA: the `pa` skill reads that file and adds
   `[lead:: <slug>]` to each task through `pa_save`, against the server
   board. Ledger itself never writes `todo.md`.

Tasks that turn out to be the same organisation are merged in the dry-run
table by giving them the same slug.

## Deploy

- The Hetzner server runs Bench today. Ledger adds:
  - an nginx server block for `ledger.offdesk.io` (TLS, `auth_request`
    copied from Bench's block),
  - a `ledger.service` systemd unit,
  - a data folder for the SQLite file and nightly backups, outside the repo.
- Deploys use the same pipeline shape as Bench. A merge to protected `main`
  runs the GitHub Action: tests, then the commit id goes to the server, where
  a forced-command deploy key runs the deploy script (check, checkout, build,
  migrate, restart, health check on `/api/health`, roll back on failure).
- Schema migrations are numbered SQL files applied in order at startup, with
  the applied version stored in the database. Each migration runs in a
  transaction, after a backup copy is taken.

## Testing

- **pytest (API):** sign-in middleware (no email → 401, wrong team → 403,
  missing `X-Ledger` → 403), CRUD for every table, status flip from lead to
  client and its history row, stale write → 409, FTS results, research job
  lifecycle with the fake AI (running → done, running → failed, second run →
  409), the summarise route.
- **Import:** a fixture `todo.md` with a Leads bucket, then the dry-run
  table, then apply against a throwaway database and a fake tick queue.
- **AI, online:** `pytest -m online` makes one real research call and one
  summarise call against a fixed fictional company. It does not run in CI.
- **Playwright:** key flows at 390px and 1280px widths over a throwaway
  database: search, open an organisation, quick log, change status,
  pipeline.

## Out of scope for v1

Gmail/Calendar sync, meeting-recorder intake, scheduled re-research, chat
with a record, enrichment APIs, offline mode, per-record permissions,
workspaces beyond the Offdesk team, reminders or notifications (Bench handles
follow-up work).
