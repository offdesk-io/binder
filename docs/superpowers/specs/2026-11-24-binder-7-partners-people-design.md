# Binder 7: partners and people — design

Date: 2026-11-24
Status: agreed with the owner in a design session; for review

## Why

Some of the people and companies that matter most to Offdesk are neither leads
nor clients. Partners work with us. Connectors introduce clients, vouch for
us and care about the company; they are the people we thank with a gift at
the end of the year. Today Binder has nowhere to keep them: every contact
must sit inside a lead or client, and a lead cannot say who brought it in.

## Decisions

| Question | Decision |
|---|---|
| What a partner is | An organisation with `kind = partner`, with the same page as leads and clients (people, timeline, research, Bench work). Statuses: `prospect`, `active`, `past`. |
| Where people without a company live | A contact's organisation becomes optional. |
| How key people stand out | A `connector` flag on the contact, shown as a star everywhere the person appears, and a People tab that puts connectors first with one-tap ways to reach them. |
| Who brought a lead in | `introduced_by` on an organisation: one contact or one partner, at most. The free-text `source` stays. |
| Year-end thanks | A postal address on the contact and a `thanks` table: one row per person and year, with what was sent. A Thanks view on People is the checklist. |
| Keeping in touch | Home's "Needs attention" also lists a connector with no interaction in 90 days. |

## Data

Migration `006_partners_people.sql`. It rebuilds `organisations`, `contacts` and
`interactions`, so it recreates their indexes, the one-primary rule and every
search trigger on those tables in the same file, as the migration rules
require.

- **organisations**
  - `kind` CHECK becomes `('lead','client','partner')`.
  - New `introduced_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL`
    and `introduced_by_org_id INTEGER REFERENCES organisations(id) ON DELETE SET NULL`,
    with `CHECK (introduced_by_contact_id IS NULL OR introduced_by_org_id IS NULL)`.
  - The repo checks that `introduced_by_org_id` points at a partner and is not
    the organisation itself.
- **contacts**
  - `org_id` becomes nullable (`ON DELETE SET NULL`: deleting an
    organisation keeps its people, now without a company). This changes the
    old behaviour (cascade); the organisation delete confirmation says so.
    Deleting an organisation still deletes its logs and research; its people
    stay. A person who moves to another organisation keeps the research made
    for the old one, and stays on the logs they were already on. A log
    against a person with no organisation stays without one, even if other
    people on it have an organisation.
  - New `connector INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0,1))`
    and `postal_address TEXT`.
  - The one-primary index stays `ON contacts(org_id) WHERE is_primary = 1`;
    a contact without an organisation cannot be primary (CHECK).
- **interactions**
  - `org_id` becomes nullable, so a call with a connector who has no company
    can be logged. An interaction needs an organisation or at least one
    contact; the repo enforces it in the write's transaction.
  - New route `POST /api/contacts/{id}/interactions` logs one against a
    person, with the contact attached and `org_id` set to the person's
    organisation, if any.
- **thanks**: `id`, `contact_id` (cascade), `year` (int), `what` (text),
  `sent_on` (date, nullable), `note`, `created_at`, `updated_at`,
  `updated_by`; `UNIQUE (contact_id, year)`.
- **search**: contact rows index `org_id` as null when there is none. A
  partner is found like any organisation.

Statuses (`binder/statuses.py`): `KINDS` gains `partner`;
`PARTNER_STATUSES = ("prospect", "active", "past")`; `initial_status("partner")`
is `prospect`; a partner moves to any partner status and never changes kind.
`/api/meta` serves the new list.

## API

Every route behind `guard()`, every write with `X-Binder: 1`, PATCH with
`updated_at` and 409 on a stale save, as today.

| Route | What |
|---|---|
| `GET /api/orgs?kind=partner` | partners, as the existing list with a new kind |
| `POST/PATCH /api/orgs` | accept `kind: partner`, `introduced_by_contact_id`, `introduced_by_org_id` |
| `GET /api/orgs/{id}` | adds `introduced_by` (`{type: contact|partner, id, name, slug?}` or null) |
| `GET /api/orgs/{id}/introduced` and `GET /api/contacts/{id}/introduced` | the organisations this partner or person introduced: name, slug, kind, status, value_estimate; plus a total of `value_estimate` over clients |
| `GET /api/people?connector=1&q=` | contacts across Binder (with or without an organisation): name, role, organisation name and slug, email, phone, linkedin_url, connector, relationship, last interaction date, number of organisations introduced. Connectors first, then by name. |
| `POST /api/contacts` | a person without an organisation (the old org-scoped POST stays) |
| `PATCH /api/contacts/{id}` | accepts `org_id` (move or clear), `connector`, `postal_address` |
| `POST /api/contacts/{id}/interactions` | log against a person |
| `GET /api/thanks?year=` | every connector with their row for that year (or none) and postal address |
| `PUT /api/thanks/{contact_id}/{year}` | create or update `what`, `sent_on`, `note` |
| `DELETE /api/thanks/{contact_id}/{year}` | remove the row |
| `GET /api/attention` | also returns connectors with no interaction in 90 days, as `{contact, reasons: ["quiet_connector"]}` items |

`web/src/api/types.ts` and the README's API section change together.

## Screens

- **Header tabs**: Home, Pipeline, List, Partners, People.
- **Pipeline and List** show leads and clients only, as today. The List kind
  chips stay All, Leads, Clients.
- **Partners** (`/partners`): a list of partner organisations, as the List's
  rows: name, status, owner, the people there (connectors starred), how many
  clients and leads they introduced and the clients' total value. Opening one
  uses the organisation drawer and page. New partner button.
- **People** (`/people`):
  - Filter chips: Connectors (default), Everyone. A search box.
  - Each row or card: a star for connectors, name, role, organisation (link),
    last touched ("12 Sep"), introduced count, and buttons Email
    (`mailto:`), Call (`tel:`), LinkedIn, shown only when the value exists.
  - A Thanks view, switched from the same page, for a year (default this
    year): each connector with postal address, a "what" field, a Sent
    checkbox (sets `sent_on` to today), and a note. Shows how many are done.
  - New person button: a person without an organisation, with the connector
    star on by default on this page.
- **Contact page**:
  - A star toggle "Key connector".
  - Organisation is editable and may be empty.
  - Postal address field.
  - An "Introduced" section listing what they brought in.
  - Log works without an organisation.
- **Organisation page and drawer**:
  - "Introduced by" in the overview: a picker over people and partners, with
    a link to the one chosen.
  - A partner's page has an "Introduced" section.
  - The organisation delete confirmation says its people are kept.
- **Home**: "Needs attention" includes quiet connectors ("No contact in 90
  days"), linking to the person.
- **Search**: people without an organisation and partners appear in their
  groups; a connector shows the star.
- On a phone, People is stacked cards with the reach buttons full width,
  following the existing phone patterns.

## Testing

Tests first, as in every Binder plan.

- **Migration**: an existing database (orgs, contacts, interactions,
  research, search rows) migrates with nothing lost; search triggers still
  work on all three tables; the one-primary rule holds; `foreign_key_check`
  passes.
- **Repo/API**: partner statuses; `introduced_by` validation (a partner
  only, not itself, one of the two); introduced lists and totals; people
  with and without organisation; delete an organisation keeps its people;
  interactions against a person; the org-or-contact rule; thanks CRUD and
  uniqueness; the quiet-connector rule (89 vs 91 days); stale PATCH 409.
- **Web** (Vitest): tabs; Partners list; People filters, reach buttons
  shown only with values, star toggle; Thanks checklist; contact page
  without organisation; introduced-by picker.
- **End to end** (Playwright): add a connector without a company, mark them
  as having introduced a lead, see the lead on their page, tick their gift
  in Thanks.

## Deploy

`main` deploys itself. The migration rebuilds three tables; it runs in one
transaction with the snapshot rollback, as every migration. No new settings.

## Out of scope

- Commission or revenue share for partners.
- Sending gifts or letters from Binder.
- Core memory links to these people (core step 9).
