# Binder 6b: Pipeline as a grouped list, List by kind, review fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After trying plan 6's build, the owner asked for the Pipeline as one list grouped by stage (the team expects many leads), chips by kind instead of by owner, the List sorted A to Z, and the final review's fixes.

**Architecture:** Same branch (`feature/ui-consistency`), same rules as plan 6 (`docs/superpowers/plans/2026-11-18-binder-6-ui-consistency.md`, "Ground rules"). The design is the "Revision" section at the end of `docs/superpowers/specs/2026-11-18-binder-ui-consistency-design.md`. No API change: the Pipeline groups and sorts in the browser from `GET /api/orgs?kind=lead`.

**Tech Stack:** React 18, react-router 6, Tenon v0.18.0, Vitest, Playwright.

---

## Ground rules

Plan 6's ground rules apply unchanged: work in `web/`, read before changing, tokens-only `styles.css` (the Wordmark is the one hex exception), `tn-custom-*` class names, `npm run check` and `npm test` green after every task, a plain commit per task with **no Co-Authored-By, no "Generated with", no session links, no mention of Claude or AI tools anywhere**, `@example.com` for any email, never touch the Bench checkout except to read it, stop every server you start.

## What exists now (end of plan 6)

- `src/components/OwnerChips.tsx`: `OwnerChips`, `useOwnerFilter()` (`?owner=`, replace history), `byOwner(orgs, value)` (`''` all, `'none'` no owner).
- `src/components/OrgCard.tsx`: Bench-style card with `onOpen`, `data-org-open`; used by Home and the phone List.
- `src/pages/PipelinePage.tsx`: a board of `Column`s with drag, `OwnerChips`, a "Filter cards" Tenon `Input`, `+ Add organisation` under Lead, `OrgDrawer`, `changed()` (lead→client notice judged against the board's copy), a phone stage `SegmentedControl`.
- `src/pages/ListPage.tsx`: `filterOrgs`, `options()`, a kind `SegmentedControl`, Status/Tag/Sort dropdowns, `OwnerChips`, a table with a Sector column, rows open the drawer.
- `src/components/Drawer.tsx` (`title`, `actions`, `returnFocus`), `src/components/OrgDrawer.tsx`, `src/lib/useOrgDrawer.ts` (`open(slug, drop?)`, `close`), `src/pages/org/OrgDetail.tsx` (frames `page`/`drawer`), `src/pages/org/Section.tsx` (localStorage-remembered folding under `binder.drawer.<id>`).
- `src/lib/openInPlace.ts`, `src/lib/colour.ts` (`sectorColour`, `stageColour`, `dueTone`), `src/lib/format.ts` (`moneyShort`, `initials`, `person`, `ago`, `money`, `label`).

---

### Task 14: Chips by kind; owner back to a dropdown

**Files:**
- Create: `src/components/FilterChips.tsx`, `src/components/FilterChips.test.tsx`, `src/lib/ownerFilter.ts`, `src/lib/ownerFilter.test.ts`
- Delete: `src/components/OwnerChips.tsx`, `src/components/OwnerChips.test.tsx`
- Modify: `src/pages/ListPage.tsx`, `src/pages/ListPage.test.tsx`, `src/pages/PipelinePage.tsx`, `src/pages/PipelinePage.test.tsx`, `src/styles.css`

- [ ] **Step 1: Move the owner filter out of the chips.** `src/lib/ownerFilter.ts` takes `useOwnerFilter` and `byOwner` unchanged from `OwnerChips.tsx`, plus a dropdown's options:
```ts
/** The Owner dropdown's options: Anyone, Me (when I own any), every other owner by name, No owner (when any has none). */
export function ownerOptions(orgs: Org[], me: string): DropdownOption[]
```
`value` `''` is labelled "Anyone", `me` is "Me", others `person(email)` sorted by that label, `'none'` is "No owner". If the active value (pass it as a third argument `active?: string`) is not among them, include it anyway, as the chips did. Move the `byOwner` tests from `OwnerChips.test.tsx` to `src/lib/ownerFilter.test.ts` and add tests for `ownerOptions` (order, Me only when owned, No owner only when present, an unknown active value still listed).

- [ ] **Step 2: A generic chip row.** `src/components/FilterChips.tsx`:
```tsx
export interface Chip<V extends string = string> { value: V; label: string; count: number }
/** A row of toggle chips with counts, in the shape of Bench's bucket strip. One is pressed: the one matching `value`. */
export function FilterChips<V extends string>({ label, chips, value, onChange }: { label: string; chips: Chip<V>[]; value: V; onChange: (v: V) => void })
```
Render it exactly as `OwnerChips` renders its buttons today (same classes: `tn-custom-pill tn-custom-chips`, `tn-custom-pill-tab`, `tn-custom-chip-count`, `role="group"`, `aria-label={label}`, `aria-pressed`). Tests: renders each chip with its count, the matching one pressed, clicking calls `onChange` with its value.

- [ ] **Step 3: The List.** Replace the kind `SegmentedControl` with `<FilterChips label="Kind" …>` showing `All n · Leads n · Clients n`, counted from `filterOrgs(all, { ...f, kind: '' })`, writing `?kind=` (clearing `?status=` as `put('kind', …)` already does). Replace `OwnerChips` with an Owner `Dropdown` (`aria-label="Owner"`, `options={ownerOptions(all, me.email, f.owner)}`) in the existing dropdown cluster, before Status. The chip row is the filter bar's first child; the dropdown cluster follows. Delete `options()`'s unused `show` parameter. Update `ListPage.test.tsx`: the owner tests use the dropdown (open "Owner", pick the `menuitemradio`); new tests: the kind chips count and filter, `?kind=client` on load presses Clients.

- [ ] **Step 4: The Pipeline.** Replace `OwnerChips` with the same Owner `Dropdown` (from `ownerOptions(orgs.data, me.email, owner)`), placed before the filter box. Update `PipelinePage.test.tsx`'s owner test to the dropdown. (Task 15 rewrites the Pipeline's body; keep this step small.)

- [ ] **Step 5: Delete `OwnerChips.tsx` and its test**; grep `src` for `OwnerChips` and fix any import left.

- [ ] **Step 6:** `npm run check && npm test`, then commit `Web: chips by kind on the List; owner is a dropdown`.

---

### Task 15: The Pipeline as a list grouped by stage

**Design (from the spec's Revision):** one table, a heading row per lead stage in `meta.lead_statuses` order except `won` (a won lead is a client and leaves the Pipeline): `LEAD · 12 · €240k`. Each heading folds its stage (remembered per device); Lost and Parked start folded. Rows: name (link, opens the drawer), sector label, next step with due date, value, owner, last contact. Within a stage: next-step due date ascending (overdue first), then undated, by name. No drag. Above the table: Owner dropdown, the filter box, `+ Add organisation`. Phone: the same groups, each row on two lines; the stage `SegmentedControl` goes.

**Files:**
- Create: `src/lib/pipeline.ts`, `src/lib/pipeline.test.ts`, `src/components/SectorLabel.tsx`, `src/pages/pipeline/StageGroup.tsx`
- Modify: `src/pages/PipelinePage.tsx`, `src/pages/PipelinePage.test.tsx`, `src/components/OrgCard.tsx`, `src/pages/ListPage.tsx`, `src/styles.css`

- [ ] **Step 1: The grouping, tested first.** `src/lib/pipeline.ts`:
```ts
export interface Stage { status: string; orgs: Org[]; total: number }
/** Open leads by stage, in the given order; each stage's rows by next-step due date (overdue first), then undated by name. */
export function stages(orgs: Org[], statuses: string[]): Stage[]
/** A stage that starts folded the first time: one that is closed for good or parked. */
export const FOLDED_BY_DEFAULT = new Set(['lost', 'parked'])
```
`total` sums `value_estimate ?? 0`. Statuses not in `statuses` are left out (as `byStatus` did). Tests: order of stages follows the list; within a stage `2026-11-01` before `2026-11-20` before undated, undated sorted by name case-insensitively; totals; an empty stage still appears with `orgs: []` and `total: 0`.

- [ ] **Step 2: `SectorLabel`.** Pull the sector span (inline `--tn-sector` style) out of `OrgCard.tsx` and `ListPage.tsx` into `src/components/SectorLabel.tsx` (`<SectorLabel sector={org.sector} />`, renders nothing for an empty sector); use it in both. Existing tests stay green.

- [ ] **Step 3: `StageGroup`.** `src/pages/pipeline/StageGroup.tsx` renders one stage as a `<tbody>`: a heading row (`<tr><th colSpan scope="rowgroup">`) holding a button `aria-expanded` that toggles the rows, with the stage's colour dot (`ColourDot` with `stageColour`), the label (`label(status)`), the count and `moneyShort(total)`, then the rows when open. Folding state: `localStorage` key `binder.pipeline.<status>`, value `open` or `closed`; absent means `FOLDED_BY_DEFAULT.has(status) ? closed : open`; wrap storage in try/catch as `Section.tsx` does. Each row:
  - Name: `<Link to={`/o/${slug}`} data-org-open={slug} onClick={(e) => openInPlace(e, () => onOpen(org))}>`
  - Sector: `<SectorLabel>`
  - Next step: `org.next_step` then `<DueDate>` when there is one
  - Value: `money(value_estimate)` right-aligned (`data-numeric`, `tn-numeric`), empty when null
  - Owner: `person(owner_email)`, "No owner" when null
  - Last contact: `ago(last_contact)`
  On a phone (`useIsPhone()`), the same `<tbody>`s, but each org is one `<tr><td colSpan>` holding two lines: name + sector on the first; next step · due · value · owner on the second (small, muted). The table header row (`<thead>`) is hidden on a phone.

- [ ] **Step 4: The page.** Rewrite `PipelinePage.tsx`'s body: keep the hidden h1, `notice`, `changed()`, `place()`, `useOrgDrawer`, `OrgDrawer`, `OrgForm` and "+ Add organisation" (now a small secondary `Button` in the filter bar's right end, after the filter box), the Owner dropdown and the filter box (Task 14). Remove `byStatus`, the board, drag state (`dragId`, `over`), `move()` (status now only changes in the drawer, so `move`'s tests go; `changed()` keeps the lead→client notice), the phone `SegmentedControl` and `EMPTY`/`EMPTY_PHONE`. Render `<div className="tn-table-wrap"><table className="tn-custom-table tn-custom-pipeline-table">` with a `<thead>` (Name, Sector, Next step, Value, Owner, Last contact) and one `StageGroup` per `stages(shown, meta.lead_statuses.filter(s => s !== 'won'))`. When nothing matches the filters at all: `<ColumnEmpty>Nothing matches these filters.</ColumnEmpty>` instead of the table. Remove the `tn-custom-pipeline` flex-fill CSS and the `.tn-custom-board`/`.tn-custom-add` rules if nothing else uses them (grep).

- [ ] **Step 5: CSS.** Stage heading rows: background `var(--tenon-background-neutral)`; the toggle button fills the cell, no border, `text-align: left`, Bench's head type (small, bold, uppercase, `.03em` tracking), a chevron that turns (`aria-expanded`), count and total `var(--tenon-text-faint)`. Sticky stage heads are not needed. Rows reuse `.tn-custom-table`'s existing look.

- [ ] **Step 6: Tests** (`PipelinePage.test.tsx`, rewrite):
  - stages appear in order with count and total (`LEAD`, `2`, `€…`); Won does not appear;
  - Lost and Parked start folded (their rows not in the document; the heading's button `aria-expanded="false"`); clicking a heading folds/unfolds and is remembered (`localStorage`), and a remembered `open` overrides the default;
  - rows within a stage are in due-date order, overdue first;
  - clicking a name opens the drawer (`?org=`); a status change in the drawer moves the row to its new stage; Won shows "X is now a client." once and the row leaves;
  - the owner dropdown and the filter box narrow the rows; "+ Add organisation" saves, opens the drawer, and the new row is under Lead with filters cleared as today;
  - on a phone (stub `matchMedia` as the file does) rows render as two-line items and open the drawer; there is no stage switcher.
  Keep the hidden-h1 tests.

- [ ] **Step 7:** `npm run check && npm test`, then commit `Web: the Pipeline as a list grouped by stage`.

---

### Task 16: The List sorted A to Z, with a filter box

**Files:** Modify `src/pages/ListPage.tsx`, `src/pages/ListPage.test.tsx`.

- [ ] **Step 1:** The default sort becomes `name`: reorder `SORTS` so `Name` is first and is the default when `?sort=` is absent or unknown; `put('sort', …)` drops the param when the value is `name` (the default) instead of `updated`. Check the API sorts `name` A to Z (read `binder/` for the `sort=name` query); if the server sorts by name case-sensitively, say so in the report and sort `rows` in the browser with `localeCompare(…, undefined, { sensitivity: 'base' })` when the sort is `name`.
- [ ] **Step 2:** A filter box (Tenon `Input type="search"`, `aria-label="Filter organisations"`, class `tn-custom-find`) at the right end of the filter bar, matching name, sector and next step like the Pipeline's. Not kept in the address.
- [ ] **Step 3: Tests:** a fresh `/list` requests `GET /api/orgs?sort=name` and shows rows A to Z; choosing another sort puts `?sort=` in the address and choosing Name removes it; the filter box narrows rows. Update any test stub keyed on `?sort=updated`.
- [ ] **Step 4:** `npm run check && npm test`, commit `Web: the List sorts A to Z and has a filter box`.

---

### Task 17: Fixes from the final review

Each item is small; do them in order and commit once at the end (or in two or three commits if natural).

**Files:** as named per item.

- [ ] **Icons (`public/`, `index.html`, `public/manifest.webmanifest`).** Copy Bench's approach (read `../../bench/kanban/brand/` and `../../bench/kanban/index.html` lines ~10-16; read only):
  - An opaque 180px apple-touch icon and an opaque, maskable 512px icon: the Binder mark in paper `#e7e5e0` with its orange square on ink `#141414`, the mark inside the maskable safe zone (central 80%). The brand folder has `binder-mark_reverse-*.png` (ink background, paper mark): check those are opaque and use `binder-mark_reverse-180.png` and `-512.png`; if the 512 has no safe-zone margin, render one with Playwright from `binder-mark_reverse.svg` at 80% scale centred on `#141414`, into `public/`, and say how.
  - `public/icon.svg` with a dark-mode rule like Bench's favicon (`@media (prefers-color-scheme: dark)` swapping the mark to paper on ink, or showing an ink background).
  - `public/favicon-32.png` (default mark) and `public/favicon-32-dark.png` (reverse mark), linked in `index.html` with `media="(prefers-color-scheme: light)"` / `dark`, after the SVG link, as Bench does.
  - Manifest: the 512 maskable entry points at the opaque one; `e2e/pwa.spec.ts` must still pass.
- [ ] **One breakpoint (`src/styles.css`).** Every `max-width: 640px` becomes `max-width: 767px`.
- [ ] **Drawer top bar (`src/pages/org/OrgDetail.tsx`, `src/components/OrgDrawer.tsx`).** In the drawer frame, the stage picker and Log / Edit / Open page go into `Drawer`'s `actions` slot instead of a body row, so they stay put while the body scrolls. OrgDetail owns their state, so give OrgDetail a way to hand them up: the simplest is for `OrgDrawer` to render `OrgDetail` as the Drawer's child and for OrgDetail (drawer frame) to render its tool row through a React portal into a slot element the Drawer exposes (`<div className="tn-custom-drawer-actions" ref=…>`); or lift the tool row into a small component that OrgDrawer renders in `actions` with callbacks registered by OrgDetail. Pick the one that keeps OrgDetail the single owner of the edit/log state and is easiest to test; say which. On a narrow drawer (phone) the head may wrap to two rows: title + Close on the first, tools on the second.
- [ ] **Open page (`OrgDetail.tsx`).** A router `Link` with Tenon's button classes (read `tenon-react.css` for `tenon-button`, its variant and size classes) instead of `LinkButton`, so it navigates in the app.
- [ ] **New (`src/app/Layout.tsx`).** After saving a new organisation from the header's New: on `/pipeline` or `/list`, open it in the drawer (`useOrgDrawer().open(slug)`), elsewhere navigate to `/o/<slug>` as now. Test in `Layout.test.tsx`.
- [ ] **Organisation page buttons (`OrgDetail.tsx`, page frame header).** `size="sm"` on Log, Edit, Research, Call, Email; the phone action bar stays full size.
- [ ] **Search (`src/pages/SearchPage.tsx`).** `OrgDrawer`'s `onChanged={() => hits.reload()}`. In `src/app/SearchBox.tsx`, a pending debounced navigation must not drop `?org=`: when already on `/search`, build the new address from the current params (keep `org`), or cancel the timer when the box loses focus; test it.
- [ ] **Phone tab bar (`src/styles.css`).** Restyle `.tn-custom-tabs` / `.tn-custom-tab-list` in the header's pill style: the bar on the raised surface with its top hairline (as now), the three links as `tn-custom-pill-tab`-looking items (subtle text, the current one on a neutral pill with full-strength text), sized for touch (at least 44px tall).
- [ ] **Drawer marker (`src/components/Drawer.tsx`, `src/app/SearchBox.tsx`).** The panel also carries `data-drawer`; SearchBox checks `[data-drawer]` instead of the class name.
- [ ] **Leftovers.** `isOverdue` in `format.ts` if unused (grep, and its test); `Section.tsx` reads storage only in the drawer frame; `scroll-margin-top` for `.tn-custom-main` on a phone matches the two-row header (measure in a screenshot or use a token-based value and say which).
- [ ] **Docs.** The plan 6 file's ground rules say "no mention of Claude": reword to "never mention AI tools", as CLAUDE.md does.
- [ ] `npm run check && npm test && npm run e2e` (all green), commit(s) with plain messages.

---

### Task 18: Flows, screenshots, docs

- [ ] **e2e (`e2e/flows.spec.ts`).** The board drag flow becomes: open a lead from the Pipeline list, change its status to Contacted in the drawer, close, and the row is under CONTACTED (desktop and phone). The owner-chips flow becomes an owner-dropdown flow. Add: the List's kind chips filter and stay in the address; a fresh List is A to Z. Everything green on both projects.
- [ ] **Screenshots.** Reuse the seed from the scratchpad (`shotdb/seed.py`), but add enough leads (about 40, invented names, several per stage, some overdue) to show the grouped Pipeline at volume. Light and dark 1280x800 of Pipeline (with Lost/Parked folded), Pipeline with the drawer open, List; 390x844 of Pipeline and the drawer. Into the scratchpad folder `final-shots-2/`; report paths.
- [ ] **Docs.** `../CLAUDE.md` "Where the work stands": plan 6 entry also names this follow-up file. Read README.md: if it now describes the Pipeline or List anywhere, correct it; otherwise leave it.
- [ ] Commit `Web: flows and docs for the grouped Pipeline`.
