# Binder UI consistency with Bench — design

Date: 2026-11-18
Status: approved in brainstorm, awaiting spec review

## Why

Bench and Binder both use Tenon, but Bench looks much better. Bench draws its
own header, tabs, columns, cards and drawer in `kanban/board.css`, on Tenon's
tokens. Binder uses Tenon's page shell and components as they come. The two
read as different products. Binder should look and behave like Bench on every
screen.

## Decisions

| Question | Decision |
|---|---|
| Which differences | All six: header bar, full width and density, columns and cards, filter chips, side drawer, calmer colour. |
| One organisation open | A drawer over Pipeline and List, like Bench's task drawer. The full page `/o/<slug>` stays for links and search. |
| Where the code lives | In Binder, on Tenon's existing components. What Tenon lacks (`AppHeader`, `Drawer`) is written as self-contained components ready to move into Tenon, then proposed there in an issue. Bench is not touched. |
| Filter chips | By owner. |
| Card label | Sector. |
| Wordmark and icons | The `binder.` wordmark and mark from the Offdesk brand folder (`logos/binder/`). |

## The shell

- **`AppHeader`.** A sticky, full-width bar on Tenon's raised surface with a
  hairline rule below, as Bench's header. Left to right:
  - the `binder.` wordmark, inline SVG, linking to Home;
  - Home, Pipeline and List as Tenon's segmented control;
  - a gap;
  - search, about 200px wide, `/` still focuses it;
  - **New** (small outline button), the signed-in name, **Sign out** (small
    ghost button), all one size.
  It takes the wordmark, the tabs, a search slot and an actions slot, so it
  can move into Tenon unchanged.
- **Wordmark colours.** The letters are ink `#141414` in light and paper
  `#e7e5e0` in dark; the dot keeps orange `#e2481c`. These are brand colours,
  not tokens, as in Bench. They live in the wordmark component, the one
  exception to the tokens-only rule, and `CLAUDE.md` says so.
- **Icons.** The Binder mark replaces the favicon and the installed app icons
  (16, 32, 180, 192 and 512 px), from the brand folder's PNGs.
- **Page.** Full window width with 16px side margins, on Tenon's sunken
  surface, panels raised on it. No centred column.
- **No repeated titles.** The "Home", "Pipeline" and "List" headings go; the
  selected tab says where you are. Organisation and contact pages keep their
  name as the title.
- **Calmer colour.** Big numbers and headings are neutral ink. Colour stays
  only where it carries meaning: stage and type dots and edges, late and
  overdue in red, and the sector label.
- **Phone.** The tab bar stays at the foot, restyled like Bench's phone
  chrome. The header shrinks to wordmark, search and New.

## Pipeline and List

- **Owner chips.** A row above the board in the style of Bench's bucket strip:
  `All 6 · Me 3 · Ana 2 · Rui 1 …`, plus `No owner` when any organisation has
  none. Pipeline and List share it. The choice is kept in the address as
  `?owner=<email>` (`?owner=none` for no owner), so it can be linked and
  survives a reload. A search box at the row's right end filters the cards on
  screen; the header search still searches everything.
- **Columns.** Small uppercase headings with the stage's colour dot and a count
  on the right. Columns run to the bottom of the window. The board scrolls
  sideways when the stages don't fit. Under the Lead column, a dashed
  `+ Add organisation` opens New. Only there, since a new organisation always
  starts as a lead and the API has no way to create one at another stage.
- **Cards**, in Bench's layout:
  1. sector, small uppercase, coloured;
  2. the name, bold;
  3. the next step, one muted line;
  4. one row of small chips: due date (red when late, as Bench does), value
     (`€12k`), the owner's initials. (The organisation list carries no
     contacts, and the API is out of scope, so the owner stands in for the
     main contact.)
  The left edge stays the stage colour. The sector colour is fixed per sector
  name, picked from Tenon's chart colours the way Bench colours buckets, and
  must reach AA on the card in both themes. A card with no sector has no label.
- **Status leaves the card.** No dropdown on cards. Status changes by dragging
  between columns, as now, or in the drawer. On a phone, where there's no
  drag, the drawer is the way.
- **Clicking a card** opens the drawer.
- **List.** The same chips, then a compact table in Bench's style: uppercase
  header row, hairline rows, sector label and stage dot in their columns.
  Clicking a row opens the drawer.

## The drawer

- **`Drawer`.** A side panel over Pipeline, List and Home, about 440px wide on
  desktop with the page dimmed behind; a full-screen sheet on a phone. It owns
  opening and closing, the title, an actions slot, the body, focus and Escape,
  so it can move into Tenon unchanged.
- **Top.** The organisation's name and its stage picker. Actions: **Log**
  (primary), **Edit**, **Open page** (to `/o/<slug>`), **Close**.
- **Body.** Collapsible sections with small uppercase headings, as Bench's
  drawer:
  1. Overview: summary, next step and due date, then compact rows for value,
     last contact, sector, location and tags;
  2. People, main contact first, with Add person;
  3. Timeline, latest five, then `Show all` to the full page;
  4. Research;
  5. Bench work, when the Bench link is on.
  Which sections are open is remembered per device.
- **Address.** The open organisation is in the address:
  `/pipeline?org=northwind-studio`. Back closes the drawer, a reload keeps it,
  the link can be shared. Escape closes it. Focus stays inside while open and
  returns to the card it came from.
- **Shared sections.** The full page `/o/<slug>` uses the same section
  components as the drawer, in two columns, inside the new shell. The page and
  the drawer cannot drift apart.

## Other screens

- **Home**, Binder's version of Bench's Overview:
  - the three stats in one panel, Bench's COMPLETED style: small uppercase
    label, big neutral number, a muted line under it;
  - **Needs attention** as a column panel with the pipeline's cards, opening
    the drawer;
  - **Recent activity** beside it, a compact list with stage dots and hairline
    rows.
- **Contact page and search results** get the new shell, the shared sections
  and the list styling. Their layout doesn't change.
- **Forms** (New, Edit, Log, Add person) stay in Tenon's modal, with Bench's
  button sizes and uppercase field-group headings. Their fields don't change.

## Order of work

One branch, one PR, in steps that each leave the tests green:

1. Upgrade Tenon from v0.17.0 to v0.18.0 on its own.
2. `AppHeader`, wordmark and icons.
3. Full width, calmer colour, uppercase headings.
4. Owner chips and the new cards on Pipeline and List.
5. `Drawer`, the shared sections, the restyled organisation page.
6. Home, contact page and search.

## Testing

- Vitest and Playwright stay green at 390px and 1280px. Flows that changed
  status from a card do it from the drawer.
- New tests: the drawer opens from a card and sets `?org=`; Back and Escape
  close it and focus returns to the card; the owner chips filter and set
  `?owner=`; a card without a sector has no label.
- Sector colours checked for AA on the card, light and dark.
- Before the PR: side-by-side screenshots of Bench and Binder, light and dark,
  for the owner to compare.

## Afterwards

- An issue on Tenon proposing `AppHeader` and `Drawer`. Tiago decides there.
- Bench is not touched.
- It deploys the usual way when the PR merges.

## Out of scope

What Binder stores and its API. The only new things in the address are
`?org=` and `?owner=`, read by the front end only.
