# Binder

The Offdesk leads and clients manager, at `https://binder.offdesk.io`. It is a
sibling to Bench, the team's to-do board: the two share the Offdesk sign-in and
the Tenon design system, and run on the same Hetzner server. Binder owns the
record for each lead and client. Bench owns the work.

Read before changing anything:

- Design: `docs/superpowers/specs/2026-11-11-binder-design.md`
- Plan 1, core API (done): `docs/superpowers/plans/2026-11-11-binder-1-core-api.md`
- Plan 2, frontend (done): `docs/superpowers/plans/2026-11-11-binder-2-frontend.md`
- Plan 3, AI (done): `docs/superpowers/plans/2026-11-11-binder-3-ai.md`
- Plan 4, Bench link and import (done): `docs/superpowers/plans/2026-11-12-binder-4-bench-link.md`
- Plan 5, deploy: `docs/superpowers/plans/2026-11-16-binder-5-deploy.md`
- Plan 6, UI consistency with Bench: `docs/superpowers/plans/2026-11-18-binder-6-ui-consistency.md`; follow-up: `docs/superpowers/plans/2026-11-18-binder-6b-pipeline-list.md`
- Binder 8, people and thanks (key connectors, the People kind on the pipeline, year-end thanks): `docs/superpowers/specs/2026-11-24-binder-8-people-thanks-design.md`
- Binder 9, a module of the Offdesk core (its MCP server in `mcp/`, the core's token, events for the core, export and erasure): the core repository's `docs/superpowers/specs/2026-11-25-core-9a-binder-module-design.md`

## Where the work stands

The plans, each one spec → plan → build → review:

1. Core API: merged to `main`.
2. Frontend (React + Vite + TypeScript + Tenon, desktop and phone): done.
3. AI (research briefs and paste-and-summarise): done.
4. Bench link and import: merged to `main`. Bench's side (`feature/lead-tag`)
   is a PR for the owner's review.
5. Deploy: nginx, systemd, CI and deploy scripts on Hetzner: merged to
   `main` and live at binder.offdesk.io. The ruleset on `main` waits for the
   organisation's Team plan. Sign-in links landing on Bench is issue #10.
6. UI consistency with Bench (header bar, cards, the organisation
   drawer), plus its follow-up after the owner's first try (Pipeline as a
   list grouped by stage, kind chips and A to Z on the List, Owner
   dropdown; `docs/superpowers/plans/2026-11-18-binder-6b-pipeline-list.md`):
   merged to `main` (PR #11) and live.
8. People and thanks: merged to `main` (PR #22).
9. A module of the Offdesk core (core step 9a), on `feature/binder-9-module`:
   the core's signed token (`binder/tokens.py`, `binder/auth.py`), events
   for the core (`binder/hooks.py`, migration 010), export and erasure of a
   person's data (`binder/api/subject.py`, migration 011), and the MCP
   server in `mcp/` with its how-to. The web is unchanged. Server steps are
   in the README, "The Offdesk core".
10. References between modules (core step 9b), on `feature/binder-9b-refs`:
   `binder.ref` in `mcp/` resolves `binder:org/<slug>` for the core, and the
   Work section reads `[ref:: binder:org/<slug>]` as well as `[lead:: ]`
   (`binder/bench.py`).

## Run and test

```
python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest -q
BINDER_DB=binder.db .venv/bin/python -m binder      # http://127.0.0.1:8770
BINDER_AI=fake BINDER_DB=binder.db .venv/bin/python -m binder   # canned AI answers, no key
(cd web && npm install && npm run check && npm test)   # frontend
(cd web && npm run e2e)                                # Playwright, builds first
```

The local `binder.db` is test data only. Real records are read and changed on
`https://binder.offdesk.io`, never by writing to the local database.

Run both suites before every commit. `pytest -m online` tests hit real
services and never run in CI.

## Rules for the code

- **AI.** Only `binder/ai.py` imports `anthropic`, and only on the server:
  the browser never sees the key. Everything else goes through
  `from_settings()`, which is `FakeAI` in tests. Tests never call the real
  API, except `tests/test_ai_online.py` (`pytest -m online`), which is run
  only when the owner asks, since it costs money. A research run never
  writes to an organisation or its contacts; "Add?" on a suggested person is
  the only way a brief becomes a contact, and it is a click.
- **Python 3.9.** Use `Optional`/`List`/`Dict` from `typing`, never `X | Y`.
- **Layers.** `binder/repo/` holds plain functions `(conn, ...) -> dict` with no
  HTTP in them. `binder/api/` holds routers that validate with pydantic
  (`binder/schemas.py`) and call the repo. Every `/api` route sits behind
  `guard()`, except `/api/health`.
- **Every write** runs `BEGIN IMMEDIATE`, then `try: … COMMIT`, then
  `except: ROLLBACK; raise`. Existence and ownership checks go inside that
  transaction.
- **SQL.** Only column names from a whitelist (`FIELDS`) are formatted into SQL.
  Every value is bound.
- **Stale saves.** Every PATCH carries `updated_at`. A stale one raises
  `Conflict(current)`, which returns 409.
- **Times.** Store times as UTC ISO with microseconds, as `db.now()` and
  `schemas.iso_datetime` produce, because feeds and sorting compare them as
  strings. Dates are `YYYY-MM-DD`. "Today" uses `BINDER_TZ`
  (default `Europe/Lisbon`).
- **Migrations.**
  - Files are named `binder/migrations/NNN_name.sql` and applied in order at
    startup. Each runs in one transaction with foreign keys off and a
    `foreign_key_check` before commit, so a file must not contain its own
    `BEGIN`/`COMMIT`.
  - Rebuilding a table drops its triggers and CHECKs (for example the `search`
    triggers), so recreate them in the same migration.
  - Once a migration has been deployed, never edit it: add a new one.
- **Search.** The FTS5 table is `search(kind, ref_id, org_id, title, body)`.
  Triggers keep it up to date. Bind `ref_id` and `org_id` as ints.
- **The core.** `mcp/` is its own package for the Offdesk core (Python 3.10
  or newer, its own `mcp/.venv`); it calls Binder's HTTP API only and never
  imports `binder`, and Binder never imports it. `mcp/HOWTO.md` has a copy in
  the core's `installs/offdesk/howto/binder.md`. Run its tests (README, "The
  Offdesk core") whenever an API it uses changes. Events for the core are
  queued with the change, inside its transaction (`repo/hooks.py`), never
  sent from a request.
- **Sign-in.**
  - `BINDER_AUTH=header` trusts the `X-Offdesk-Email`, `X-Offdesk-Name` and
    `X-Offdesk-Teams` headers from nginx. Unset means local development with a
    fixed identity.
  - Both modes listen on loopback only.
  - Every non-GET request needs `X-Binder: 1`.
  - Only the team named by `BINDER_TEAM` gets in.
  - `Authorization: Bearer` is the core's token, checked with
    `BINDER_CORE_TOKEN_KEY`; such a request never reads the sign-in headers.

## Rules for the frontend

- The app lives in `web/`. FastAPI serves its build (`binder/web.py`), with
  `index.html` for any path not under `/api`, so `/o/<slug>` links work.
- Use a Tenon component before writing one. CSS in `web/src/styles.css` reads
  `var(--tenon-…)` tokens only: no hex colours, no font names. The one
  exception is the wordmark's brand colours, in `web/src/app/Wordmark.tsx`,
  as Bench does with its own.
- `web/src/api/types.ts` and the README's API section describe the same
  shapes. Change them together.
- Every fetch goes through `web/src/api/client.ts`, which adds `X-Binder: 1`
  to writes. Every edit form PATCHes only what changed, plus `updated_at`, and
  on a 409 loads `current` into the form. A save with nothing changed sends
  nothing.
- Lists, filters and vocabularies come from `GET /api/meta`, never a copy in
  the frontend.
- One breakpoint: below 768px is the phone layout (`useIsPhone`).

## Rules for deploy

- `main` deploys itself, so merge only what is ready to run for the team.
- Files in `deploy/` name no domain: the nginx template uses `@DOMAIN@`, and
  `setup-server.sh` takes `--domain`. The server's address lives only in the
  `DEPLOY_HOST` secret, never in a tracked file.
- Keep the deploy scripts runnable by bash 3.2, so their tests run on a Mac.
- A change to `deploy-on-server.sh`, `deploy-forced-command.sh`,
  `binder.service` or `binder-backup.*` needs `setup-server.sh --apply` on the
  server afterwards, and a new setting in `binder.env.example` a hand edit of
  `/etc/binder/binder.env`. Say so in the PR.
- A migration must work with the snapshot rollback: a failed deploy that
  changed the database's version puts the pre-deploy copy back.
- A script piped over ssh with `bash -s` wraps its body in
  `main "$@" </dev/null`, so it is read whole before it runs and nothing in it
  eats the rest of the script from stdin.
- A script that edits root's files (`authorized_keys`, nginx sites) must never
  leave a partial or broken file behind.

## Binder and Bench

- **Binder never writes Bench's `todo.md`.** Changes to a Bench task go through
  Bench's own PA (`pa_save`), against the server's offdesk board.
- **Changes on the Bench side** (plan 4) are made in the Bench repo, on a branch
  and through a PR, following Bench's own `CLAUDE.md`. In particular, the task
  format lives in both `core/todo.js` and `core/todo.py`, which must change
  together.
- **Binder reads Bench's tasks** server to server, through Bench's
  `core/todo.py`.
- Binder reads Bench over HTTP with `BINDER_BENCH_TOKEN`, GET only, and parses
  with Bench's `core/todo.py` from `BINDER_BENCH_CORE`. Tests use
  `tests/bench_todo.md`, written from scratch: never copy from Bench's `data/`.

## Commits and privacy

- Work on a branch and merge to `main` through a PR. `main` is the branch that
  will deploy.
- Commit messages and PR bodies are plain. Add no attribution lines of any kind
  and never mention AI tools, in commits, PRs or code comments.
- Keep real people's emails, names, account details and key paths out of every
  tracked file. Tests use `@example.com` addresses.
