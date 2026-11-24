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

`BINDER_AUTH=header` is the server behind nginx, and needs `BINDER_DB` set to an absolute path; unset is local development. Binder listens on loopback only in both modes. `BINDER_TZ` (default `Europe/Lisbon`) decides what "today" means for the needs-attention feed.

`BINDER_OWNERS` is who a record can be "Handled by": `email=Name` pairs separated by commas, set in `/etc/binder/binder.env` on the server rather than in the repo, because they are real people. A record created without one is handled by whoever creates it, when they are on the list. Unset, the list is empty and "nobody" is the only choice. Tests use made-up `@example.com` owners.

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

## Deploy

Offdesk's own install is `https://binder.offdesk.io`, on the same server as
Bench. Every merge to `main` that passes CI deploys itself:
`.github/workflows/deploy.yml` sshes to the server with a key that can only
run `deploy/deploy-forced-command.sh`, which hands the commit id to
`deploy/deploy-on-server.sh`. That script takes a lock
(`/run/binder-deploy.lock`), refuses anything `origin/main` has not reached,
snapshots the database, builds, restarts, waits for `/api/health`, and rolls
back when Binder doesn't answer. A rollback puts the old code back and, if the
new code changed the database's version, the old database too (from
`/var/lib/binder/deploys/`). A failed first deploy sets the new database
aside as `binder.db.failed-<time>`.

If CI's ssh session drops mid-deploy, the script ignores the hangup and
finishes. A build whose output pipe has gone may still count as failed and
roll back, so the old code keeps running. Check the Actions run and
`/api/health`, and deploy again if needed.

On the server:

| What | Where |
|---|---|
| Code, as the `binder` user | `/opt/binder/app` (detached at the deployed commit) |
| Database | `/var/lib/binder/binder.db` |
| Nightly copies (30 days) | `/var/lib/binder/nightly/` |
| Copies before each deploy (last 10) | `/var/lib/binder/deploys/` |
| Settings (root, 600) | `/etc/binder/binder.env`, from `deploy/binder.env.example` |
| Service | `binder.service` on 127.0.0.1:8770, `binder-backup.timer` |
| nginx | `/etc/nginx/sites-available/binder`, from `deploy/nginx-binder.conf` |
| Deploy command (root's copies) | `/usr/local/lib/binder-deploy/` |

`deploy/setup-server.sh` sets up or checks a server. It installs no
packages. If any are missing it says which and stops, so install them first
(git, node and npm, nginx and curl are already on the server):

```
apt-get install python3-venv certbot python3-certbot-nginx
```

Run it piped over ssh. Without `--apply` it only reports what it would do:

```
ssh root@<host> 'bash -s -- --domain binder.offdesk.io' < deploy/setup-server.sh
```

Options:

- `--apply` makes the changes.
- `--tls` gets the certificate. Use it once DNS points at the server.
- `--email ADDR` is for certbot on a server with no Let's Encrypt account yet.
- `--deploy-key KEY` installs the CI key. Quote it twice, so the key reaches
  the script as one argument:

```
ssh root@<host> "bash -s -- --domain binder.offdesk.io --apply --deploy-key 'ssh-ed25519 AAAA... binder-deploy'" < deploy/setup-server.sh
```

After changing `deploy-on-server.sh`, `deploy-forced-command.sh`,
`binder.service` or `binder-backup.*`, run it again with `--apply` once the
change is deployed: the key runs root's installed copies of the scripts, and
only set-up installs the units. A new setting in `binder.env.example` is added
to `/etc/binder/binder.env` by hand, since that file is never rewritten. After changing
`deploy/nginx-binder.conf`, apply the change to the installed file by hand,
since certbot has edited it.

The pipeline deploys only once GitHub is set up for it, on `offdesk-io/binder`:

- an environment `production`, limited to the `main` branch;
- in it, the secrets `DEPLOY_SSH_KEY` (the private half of the key given to
  `--deploy-key`), `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 <host>`) and
  `DEPLOY_HOST`;
- the repository variable `DEPLOY_ENABLED` set to `true`. Until then, merges
  to `main` are tested but not deployed.

The exact commands are in plan 5's last task.

While a deploy builds, the running app is serving from the same checkout, so
for that minute a page can miss an asset; a reload fixes it.

To check from outside that sign-in is required and forged headers do nothing:

```
deploy/check-live.sh https://binder.offdesk.io
```

Set `BINDER_COOKIE` to a signed-in session cookie to check the signed-in
side too.

To look at it: `journalctl -u binder.service -n 50`, and
`systemctl list-timers binder-backup.timer`. Binder does not restart-loop on
bad settings: it exits with code 2 and stays stopped, and the journal says
which setting is wrong.

## API

Every route sits under `/api` and needs sign-in, except `GET /api/health`.
Every non-GET request needs the header `X-Binder: 1`. Times are UTC ISO strings
with microseconds; dates (`next_step_due`) are `YYYY-MM-DD`.

### Records

- **Organisation** (`/api/orgs`, `/api/orgs/{id}`, `/api/orgs/by-slug/{slug}`):
  `id`, `slug`, `name`, `kind` (`lead`, `client`, `partner` or `referrer`),
  `status`, `website`, `sector` (one of meta's `sectors`, or null),
  `description` (what they do, or for a referrer where they work), `size`,
  `location`, `owner_email` (one of meta's `owners` on write, or null; an older
  value off the list stays until it is changed), `source`, `value_estimate`,
  `tags` (list), `summary`, `next_step`, `next_step_due`, `introduced_by_id`,
  `introduced_by`, `introduced`, `won_at`, `person`, `last_contact`,
  `created_at`, `updated_at`, `updated_by`. `won_at` is when the record was
  last moved to `won`, or null if it never was. `introduced_by` is the partner or
  referrer who introduced a lead or client, as `{id, slug, name, kind}`, or
  null. `introduced` lists the leads and clients a partner or referrer
  introduced, each `{id, slug, name, kind, status}`, sorted by name; it is
  always empty on a lead or client.
  A referrer is a person, and its primary contact holds their details:
  `person` is `{contact_id, email, phone, linkedin_url}` from that contact,
  and null on every other kind. Creating a referrer, or refiling a record as
  one, gives it a primary contact named after it when it has none. A `person`
  object on POST or PATCH (any of `email`, `phone`, `linkedin_url`) is written
  to that contact in the same save, renaming a referrer renames the contact,
  and the contact cannot be deleted or stop being primary while another has
  not taken over. A referrer refuses `website`, `size` and `sector`, and any
  other kind refuses `person` (422). A record that stops being a referrer
  keeps its contacts.
  `GET /api/orgs` filters by `kind`, `status`, `owner`, `tag`, `q` (part of
  the name) and `won` (`true` keeps records ever moved to `won`, `false`
  those never were), and sorts by `sort`: `updated` (the default), `name`,
  `last_contact`, `value` or `won` (newest won first, the default when
  `won=true`). The Pipeline's Won column asks for `kind=client&won=true`, which
  has no time limit.
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
  `board`, `title`, `state` (`Done` for finished work, `Cancelled` for a
  cancelled one, otherwise the column it sits in), `done` (bool: finished work
  only), `cancelled` (bool: ticked and cancelled or archived in Bench), `done_on`
  (a date, or null: the day it was finished, or for a cancelled task the day it
  was cancelled), `due` (a date, or null), `assignee` (or null), `fetched_at`,
  `url` (the task on Bench). **Work**: `tasks` (a list of Bench tasks),
  `fetched_at` (null until the first read finishes, which the page shows as
  "Reading Bench..."), `error` (why the last refresh failed, or null) and
  `refreshing` (bool: a refresh is running now, and the page asks again every
  few seconds for up to 20 seconds). The route answers from the cache at once
  and, when the cache is stale, starts a refresh in the background. It is 404
  when Bench is off.
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

A record's `kind` is `lead`, `client`, `partner` or `referrer`, and only
organisations have one. Leads and clients are the pipeline. A partner is an
organisation OFFDESK has or seeks an agreement with; a referrer is a person who
passes work on for a fee, kept as an organisation named after them. Partners
and referrers never appear in needs attention or activity, and the Pipeline
asks for leads only. `introduced_by_id` may be set, on create or PATCH, only
on a lead or client, and only to a partner or referrer other than itself;
anything else is 422.

A PATCH with a different `kind` refiles the record, so one filed as the wrong
kind can be fixed. It takes the new kind's first status (`lead`, `active` for
a client, `identified` for a partner or referrer), or the `status` sent in the
same PATCH if that is one of the new kind's, and status history records the
move. Becoming a partner or referrer clears `introduced_by_id`. A partner or
referrer that becomes a lead or client stops introducing: the records it
introduced lose their link, and their `updated_at` moves on.

### Feed items

Search, timeline and activity return items, not records. On an item, `kind` is
what the item is, and the pair (`kind`, `id`) identifies it: an interaction and
a status change can share an `id`.

- **Search** (`/api/search?q=`): `kind` (`org`, `contact`, `interaction` or
  `research`), `id`, `org_id`, `org_name`, `org_slug`, `org_status` (the organisation's current status), `org_kind`, `title`, `snippet`
  (each match wrapped in the control characters `\u0002` and `\u0003`), and
  `contact_id`: the person a research brief is about, null otherwise.
- **Timeline** (`/api/orgs/{id}/timeline`) and **activity**
  (`/api/activity?limit=`): `kind` (`interaction` or `status`), `id`,
  `org_id`, `at`, `by_email`. Interaction items add `type` and `summary`;
  status items add `from_status` and `to_status`. A timeline also has `bench`
  items, one per finished Bench task (a cancelled task is not finished work and
  is not listed): `kind`, `id` (the task key), `title`, `at` (the done date at
  midnight UTC), `by_email` (always null, since a Bench `to:` is not always an
  email) and `url`. Timeline interaction items
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
`client_statuses`, `partner_statuses`, `referrer_statuses`,
`interaction_types`, `relationships` and `sectors`, from
`binder/statuses.py`, and `owners`, a list of `{email, name}` from
`BINDER_OWNERS`. `ai` is true when the server can run research and summarise; when it is false, those routes answer 503. `bench` is true when Bench is connected; when it is false, the work route answers 404 and the Work section is hidden. Status moves are unordered within a kind: a lead can go
to any lead status, a client to any client status. Moving a lead to `won` makes
it an active client, and a client never goes back to a lead through a status.
A partner moves freely between `identified`, `in_talks`, `terms_sent`,
`active` and `paused`, and a referrer between the same steps without
`terms_sent`.

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
