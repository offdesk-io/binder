# Binder 8: people and thanks — design

Date: 2026-11-24
Status: agreed with the owner; builds on #18 (partners and referrers), which stays as designed

## Why

#18 gave Binder partners and referrers, and records who introduced each lead
or client. What is still missing is a way to keep the people who matter in
view: the referrers and the other key people (a champion at a client, an
advisor) who introduce work and care about the company. They should be easy
to find and reach, nudged when we have gone quiet, and thanked at the end of
the year.

## Decisions

| Question | Decision |
|---|---|
| Who counts | Every referrer's person (`organisations.person_contact_id` of a referrer) and every contact starred as a key connector. |
| How a key person stands out | `contacts.connector`, a star shown wherever the person appears (people sections, contact page, search). A referrer's person shows the star without needing the flag. |
| Where the list lives | No new top tab. The Leads pipeline's Kind switch gains a fourth segment, People, after Referrers. |
| Year-end thanks | `contacts.postal_address` and a `thanks` table, one row per person and year. People has a Thanks view. |
| Keeping in touch | Overview's "Needs attention" lists a key person (as above, referrers only when `active`) with no log in 90 days. |

## Data

Migration `009_people_thanks.sql`, additive only (no table rebuild):

- `ALTER TABLE contacts ADD COLUMN connector INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0,1))`
- `ALTER TABLE contacts ADD COLUMN postal_address TEXT`
- `thanks`: `id`, `contact_id` (`REFERENCES contacts(id) ON DELETE CASCADE`),
  `year` INTEGER, `what` TEXT, `sent_on` TEXT (date, nullable), `note` TEXT,
  `created_at`, `updated_at`, `updated_by`; `UNIQUE (contact_id, year)`.

The contact search triggers are unchanged (the star is read at query time).

## API

Every route behind `guard()`, writes with `X-Binder: 1`, stale saves 409 with
`current`, as today.

| Route | What |
|---|---|
| `PATCH /api/contacts/{id}` | accepts `connector` and `postal_address` |
| `GET /api/people?q=` | key people: id, name, role, email, phone, linkedin_url, connector, `referrer` (`{id, slug, name, status}` or null), organisation name and slug, last log date, number of leads and clients introduced (through the referrer, for a referrer's person). Starred and referrers together, by name. `q` matches name, role, organisation (LIKE, escaped). |
| `GET /api/thanks?year=` | each key person with their postal address and their row for the year, or null. Default year: this year in `BINDER_TZ`. |
| `PUT /api/thanks/{contact_id}/{year}` | upsert `what`, `sent_on`, `note`; carries the row's `updated_at` or null; 409 with `current` (row or null) when stale; 422 for someone who isn't a key person; `note` up to 2000, `what` up to 200. |
| `GET /api/attention` | also returns `{contact, reasons: ["quiet_connector"]}` items after the organisation items, A to Z. A person never logged counts from when they were added. |

`web/src/api/types.ts` and the README's API section change together.

## Screens

- **Leads pipeline, Kind switch**: Leads, Partners, Referrers, People. On
  People the View switch reads People and Thanks instead of List and Board.
- **People view**: a search box; rows (phone: cards) with the star, name,
  role, organisation or "Referrer" pill, last touched, introduced count, and
  Email (`mailto:`), Call (`tel:`), LinkedIn (only a safe `http(s)` URL)
  buttons shown only when the value exists.
- **Thanks view**: a year picker (this year and the two before), each key
  person with postal address (or "No postal address yet"), a What field, a
  Sent checkbox (sets `sent_on` to today, unticking clears it), a Note, and
  "N of M sent". Changes made while a save is in flight are queued, not
  dropped.
- **Contact page and forms**: a "Key connector" toggle (Tenon `ToggleChip`,
  PATCHes `{connector, updated_at}`), the postal address field, and the star
  next to the name. A referrer's person shows the star and no toggle.
- **People sections and search**: the star beside key people.
- **Overview**: quiet key people in "Needs attention" with "No contact in 90
  days", linking to the person.

Follow #18's look: Tenon components and tokens, its table and card classes.

## Testing

Tests first. Migration on a v8 database (rows kept, `foreign_key_check`
clean); people list contents and introduced counts; thanks CRUD, uniqueness,
stale 409, non-key-person 422, cascade; the quiet rule at 89 and 91 days;
the web views and toggles; one Playwright flow: star a contact, see them in
People, tick their gift in Thanks.

## Deploy

No new settings. Migration 009 is additive and runs at startup with the
snapshot rollback.

## Out of scope

People without an organisation and logs without one (a referrer covers the
person who introduces work alone).
