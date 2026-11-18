# Binder 6: UI consistency with Bench — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Binder looks and behaves like Bench on every screen: Bench's header bar, full width, uppercase column heads and Bench-style cards, owner filter chips, a side drawer for one organisation, and calmer colour.

**Architecture:** Everything is in `web/` (React, Vite, TypeScript, Tenon). Tenon's existing components (Column, Card, Tag, Stat, Modal, SegmentedControl, Button) do most of the work; Bench's look is reproduced with `--tenon-*` tokens in `web/src/styles.css`. Two pieces Tenon lacks are written as self-contained components ready to move into Tenon: `AppHeader` and `Drawer`. The organisation's sections are shared between the full page and the drawer through a small `Section` wrapper and a frame context. No API or database change.

**Tech Stack:** React 18, react-router 6, Tenon (`@tiagopedras/tenon`, moving v0.17.0 → v0.18.0), Vitest + Testing Library, Playwright (desktop 1280px and phone 390px projects).

**Spec:** `docs/superpowers/specs/2026-11-18-binder-ui-consistency-design.md`.

---

## Ground rules for every task

- Work on branch `feature/ui-consistency` in `~/Developer/Offdesk/binder`. All paths below are relative to `web/` unless they start with `docs/` or `../`.
- Read a file before changing it. The code quoted under "Current code" in a task is what was there when the plan was written; if it differs, adapt and say so in your report.
- `web/src/styles.css` reads `var(--tenon-…)` tokens only: no hex colours, no font names. The one exception is the wordmark's brand colours, which live in `src/app/Wordmark.tsx` (Task 2).
- Page-only classes are named `tn-custom-*`, as the file already does.
- Run from `web/`: `npm run check` (types), `npm test` (Vitest), and for tasks that say so `npx playwright test` (builds first via `npm run e2e`). The repo root's Python suite is not affected by this plan; leave it alone.
- Commit after each task with a plain message saying what changed. **No `Co-Authored-By`, no "Generated with", no mention of Claude anywhere** (code, comments, commits).
- No real names or emails in code, tests or fixtures: use `@example.com`.
- Do not touch the Bench checkout (`../../bench`). It is read-only reference.

## File map

| File | Status | What it does |
|---|---|---|
| `package.json`, `package-lock.json` | modify | Tenon v0.18.0; drop the `icons` script. |
| `scripts/icons.mjs` | delete | Icons now come from the brand folder. |
| `public/icon.svg`, `public/icon-180.png`, `public/icon-192.png`, `public/icon-512.png`, `public/manifest.webmanifest`, `index.html` | replace/modify | Binder mark as favicon and app icons. |
| `src/app/Wordmark.tsx` | create | The `binder.` wordmark, inline SVG, themed. |
| `src/app/AppHeader.tsx` | create | Generic sticky header bar: wordmark, tab links, search slot, actions slot. |
| `src/app/Layout.tsx` | modify | Uses `AppHeader`; full-width page. |
| `src/components/Drawer.tsx` | create | Generic side drawer: scrim, focus, Escape, title, actions, body. |
| `src/lib/useOrgDrawer.ts` | create | `?org=<slug>` in the address: open, close, Back. |
| `src/components/OrgDrawer.tsx` | create | Loads one organisation and shows `OrgDetail` in a `Drawer`. |
| `src/pages/org/Section.tsx` | create | `Section` + `FrameContext`: a Column on the page, a collapsible Column in the drawer. |
| `src/pages/org/OrgDetail.tsx` | create | The organisation's header row and sections, for both frames (moved out of `OrgPage.tsx`). |
| `src/pages/OrgPage.tsx` | modify | Loads the org and renders `OrgDetail frame="page"`. |
| `src/pages/org/PeopleSection.tsx`, `TimelineSection.tsx`, `WorkSection.tsx`, `src/components/ResearchSection.tsx` | modify | `Column` → `Section`; Timeline takes a limit. |
| `src/lib/colour.ts` | modify | `sectorColour()`. |
| `src/lib/format.ts` | modify | `moneyShort()`, `initials()`. |
| `src/components/OwnerChips.tsx` | create | The owner filter strip with counts, `?owner=`. |
| `src/components/OrgCard.tsx` | modify | Bench's card layout: sector eyebrow, name, next step, chips; opens the drawer. |
| `src/pages/PipelinePage.tsx` | modify | Chips, new cards, no status picker, drawer, `+ Add organisation`. |
| `src/pages/ListPage.tsx` | modify | Chips replace the owner dropdown; rows open the drawer. |
| `src/pages/HomePage.tsx` | modify | One stats panel, neutral numbers, cards open the drawer. |
| `src/pages/ContactPage.tsx`, `src/pages/SearchPage.tsx` | modify | No repeated title; shared list styling. |
| `src/styles.css` | modify | Header bar, full width, Bench's heads, cards, chips, drawer. |
| `e2e/flows.spec.ts` | modify | Status moves via the drawer; new drawer flow. |
| `../CLAUDE.md`, `../README.md` | modify | The wordmark exception; plan 6 in "Where the work stands". |

---

### Task 1: Tenon v0.17.0 → v0.18.0

v0.18.0 only adds `Input` and `Select` (and Field's `select`). Nothing Binder uses changes. Bench's `package.json` is on v0.18.0.

**Files:**
- Modify: `package.json:15`, `package-lock.json`

- [ ] **Step 1: Change the dependency**

In `package.json`, replace
```json
    "@tiagopedras/tenon": "github:tiagopedras/tenon#v0.17.0",
```
with
```json
    "@tiagopedras/tenon": "github:tiagopedras/tenon#v0.18.0",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes; `node -p "require('./node_modules/@tiagopedras/tenon/package.json').version"` prints `0.18.0`.

Check the lockfile entry for Tenon still resolves over a URL the server can fetch without a GitHub key (it was `git+ssh://git@github.com/...` before and the server installed it fine, so keep whatever form `npm install` writes, but report it).

- [ ] **Step 3: Verify**

Run: `npm run check && npm test`
Expected: no type errors; all tests pass (same count as before the change).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Web: Tenon v0.18.0"
```

---

### Task 2: The Binder wordmark and icons

The brand folder is `/Users/jerome/kDrive offdesk.io/Shared/brand/logos/binder/` (the path has a space; quote it). It holds `binder-wordmark_default.svg` (ink letters `#141414`, orange dot `#e2481c`), `binder-mark_default.svg` and PNGs of the mark at 16, 32, 48, 180, 192, 512 and 1024.

**Files:**
- Create: `src/app/Wordmark.tsx`, `src/app/Wordmark.test.tsx`
- Replace: `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`
- Create: `public/icon-180.png`
- Modify: `public/manifest.webmanifest`, `index.html`, `package.json` (scripts)
- Delete: `scripts/icons.mjs`

- [ ] **Step 1: Copy the icons**

```bash
B="/Users/jerome/kDrive offdesk.io/Shared/brand/logos/binder"
cp "$B/binder-mark_default.svg" public/icon.svg
cp "$B/binder-mark_default-180.png" public/icon-180.png
cp "$B/binder-mark_default-192.png" public/icon-192.png
cp "$B/binder-mark_default-512.png" public/icon-512.png
git rm -q scripts/icons.mjs
```

- [ ] **Step 2: Point the page and manifest at them**

In `index.html` replace
```html
    <meta name="theme-color" content="#1f2a44" />
```
with
```html
    <meta name="theme-color" content="#141414" />
```
and replace
```html
    <link rel="apple-touch-icon" href="/icon-192.png" />
```
with
```html
    <link rel="apple-touch-icon" href="/icon-180.png" />
```

In `public/manifest.webmanifest` set both `"background_color"` and `"theme_color"` to `"#141414"`, and add `{ "src": "/icon-180.png", "sizes": "180x180", "type": "image/png" }` as the first entry of `"icons"`.

In `package.json` remove the line `"icons": "node scripts/icons.mjs"` (and the comma before it on the `e2e` line).

- [ ] **Step 3: Write the wordmark test**

`src/app/Wordmark.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Wordmark } from './Wordmark'

test('the wordmark is an image named Binder', () => {
  render(<Wordmark />)
  const svg = screen.getByRole('img', { name: 'Binder' })
  expect(svg.tagName.toLowerCase()).toBe('svg')
})

test('the letters take the themed class and the dot keeps its own fill', () => {
  const { container } = render(<Wordmark />)
  expect(container.querySelector('.tn-custom-wm-ink')).not.toBeNull()
  expect(container.querySelector('[fill="#e2481c"]')).not.toBeNull()
})
```

Run: `npx vitest run src/app/Wordmark.test.tsx`
Expected: FAIL, cannot find `./Wordmark`.

- [ ] **Step 4: Write the component**

Open `"$B/binder-wordmark_default.svg"`. It has `viewBox="0 0 647.8 123.4"` and paths: the letters filled `#141414` and the dot filled `#e2481c`. Create `src/app/Wordmark.tsx` holding that SVG as JSX:

```tsx
/**
 * The `binder.` wordmark from the Offdesk brand folder (logos/binder/binder-wordmark_default.svg), inline so the
 * letters can follow the theme. Brand colours, not Tenon tokens, as Bench's `bench.` wordmark is: ink on light,
 * paper on dark, and the orange dot keeps its fill. This file is the one place Binder writes hex colours.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 647.8 123.4" role="img" aria-label="Binder" focusable="false">
      <style>{`
        .tn-custom-wm-ink { fill: #141414; }
        @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .tn-custom-wm-ink { fill: #e7e5e0; } }
        :root[data-theme="dark"] .tn-custom-wm-ink { fill: #e7e5e0; }
      `}</style>
      {/* every letter path from the brand SVG, with fill="#141414" replaced by className="tn-custom-wm-ink" */}
      <path className="tn-custom-wm-ink" d="…copy the d attribute of each letter path exactly…" />
      {/* the dot path, unchanged */}
      <path fill="#e2481c" d="…copy the dot path's d attribute exactly…" />
    </svg>
  )
}
```

Copy every `<path>` from the brand file. Each path whose fill is `#141414` gets `className="tn-custom-wm-ink"` instead of the fill; the path filled `#e2481c` keeps `fill="#e2481c"`. If the brand file groups paths in a `<g>`, keep the group and move the fill onto the paths. Check by eye afterwards: the SVG in the browser must read `binder.`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/Wordmark.test.tsx && npm run check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A public index.html package.json src/app/Wordmark.tsx src/app/Wordmark.test.tsx scripts
git commit -m "Web: the binder. wordmark and the Binder mark as icons"
```

---

### Task 3: `AppHeader`, full width, the new Layout

Bench's header (`../../bench/kanban/board.css` lines 53-138): sticky, full width, `background: var(--tenon-background-raised)`, `border-bottom: 1px solid var(--tenon-stroke-default)`, `padding: 10px 16px`, flex with `gap: 10px 14px`. Its view tabs are one pill (`.tabs`: `background: var(--tenon-background-neutral); padding: 3px; border-radius: var(--tenon-radius-md); gap: 3px`) holding tabs (`.tab`: `padding: 5px 11px; font-size: var(--tenon-typography-size-sm); font-weight: 560; color: var(--tenon-text-subtle); border-radius: var(--tenon-radius-default)`); the selected tab sits on `--tenon-background-raised` with full-strength text. Binder's tabs are navigation, so they stay **links** (`NavLink`) drawn as that pill, not Tenon's SegmentedControl, which is a radio group. Existing tests find them with `getByRole('link', { name: 'Pipeline' })`.

**Current code:** `src/app/Layout.tsx` renders `<div className="tn-page">`, a `tn-header` with `tn-custom-brand` (text wordmark + `Nav`), `SearchBox`, and `tn-custom-tools` (New, name, Sign out), then `<main className="tn-custom-main">`, the phone tab bar and `OrgForm`.

**Files:**
- Create: `src/app/AppHeader.tsx`, `src/app/AppHeader.test.tsx`
- Modify: `src/app/Layout.tsx`, `src/app/SearchBox.tsx` (one class), `src/styles.css`
- Test: `src/app/Layout.test.tsx` (must stay green unchanged)

- [ ] **Step 1: Write the AppHeader test**

`src/app/AppHeader.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderApp } from '../test/render'
import { AppHeader } from './AppHeader'

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/pipeline', label: 'Pipeline' },
]

test('the header holds the brand, the tabs, the search slot and the actions', () => {
  renderApp(
    <AppHeader brand={<span>brand</span>} tabs={TABS} search={<input aria-label="Find" />} actions={<button>Go</button>} />,
    '/pipeline',
  )
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByText('brand')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('textbox', { name: 'Find' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
})

test('without tabs there is no nav', () => {
  renderApp(<AppHeader brand={<span>brand</span>} />)
  expect(screen.queryByRole('navigation')).toBeNull()
})
```

Run: `npx vitest run src/app/AppHeader.test.tsx`
Expected: FAIL, cannot find `./AppHeader`.

- [ ] **Step 2: Write AppHeader**

`src/app/AppHeader.tsx`:
```tsx
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export interface AppTab {
  to: string
  label: string
  /** Match the address exactly, for a tab at "/". */
  end?: boolean
}

export interface AppHeaderProps {
  /** The wordmark, usually a link home. */
  brand: ReactNode
  /** The app's views, drawn as one segmented pill of links. Left out on a phone, where they move to a tab bar. */
  tabs?: AppTab[]
  /** Between the tabs and the actions, pushed right. */
  search?: ReactNode
  /** The right-hand end. */
  actions?: ReactNode
}

/**
 * An app's top bar, in the shape Bench's header has: sticky, full width on the raised surface, the brand and the
 * view tabs on the left, search and actions on the right. Written to move into Tenon unchanged: it knows nothing
 * about Binder beyond its props, and its classes are its own.
 */
export function AppHeader({ brand, tabs, search, actions }: AppHeaderProps) {
  return (
    <header className="tn-custom-appbar">
      <div className="tn-custom-appbar-brand">{brand}</div>
      {tabs && tabs.length > 0 && (
        <nav aria-label="Main">
          <ul className="tn-custom-pill">
            {tabs.map((t) => (
              <li key={t.to}>
                <NavLink to={t.to} end={t.end} className="tn-custom-pill-tab">{t.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="tn-custom-appbar-gap" />
      {search && <div className="tn-custom-appbar-search">{search}</div>}
      {actions && <div className="tn-custom-appbar-actions">{actions}</div>}
    </header>
  )
}
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/app/AppHeader.test.tsx`
Expected: PASS. (`NavLink` sets `aria-current="page"` on the active link.)

- [ ] **Step 4: Use it in Layout**

Replace the body of `Layout()`'s return in `src/app/Layout.tsx` with:
```tsx
    <div className="tn-custom-app">
      <a className="tn-skip-link" href="#main">Skip to content</a>
      <AppHeader
        brand={<Link to="/" aria-label="Binder, home"><Wordmark className="tn-custom-wordmark" /></Link>}
        tabs={phone ? undefined : NAV}
        search={<SearchBox />}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>New</Button>
            {!phone && <span className="tenon-caption tn-custom-me">{me.name}</span>}
            {/* nginx answers /auth/logout and ends the Offdesk sign-in. */}
            <form method="post" action="/auth/logout">
              <Button size="sm" variant="ghost" type="submit">Sign out</Button>
            </form>
          </>
        }
      />
      <main id="main" className="tn-custom-main">
        <Outlet />
      </main>
      {phone && <Nav tabs />}
      <OrgForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(o) => {
          setCreating(false)
          navigate(`/o/${o.slug}`)
        }}
      />
    </div>
```
Add the imports `import { AppHeader } from './AppHeader'` and `import { Wordmark } from './Wordmark'`. `Nav` stays, but only the phone tab bar uses it now: delete its non-tab branch so it always renders the bar:
```tsx
/** On a phone the views are a tab bar at the foot of the screen; on a desktop they are AppHeader's tabs. */
function Nav() {
  return (
    <nav aria-label="Main" className="tn-custom-tabs">
      <ul className="tn-nav tn-custom-tab-list">
        {NAV.map((n) => (
          <li key={n.to}><NavLink to={n.to} end={n.end}>{n.label}</NavLink></li>
        ))}
      </ul>
    </nav>
  )
}
```
and render it as `{phone && <Nav />}`. `NAV` keeps its shape (`to`, `label`, `end`), which matches `AppTab`.

The `tn-page` and `tn-header` classes from Tenon's page layer are no longer used by the layout. Keep the `tn-page.css` import in `main.tsx`: other screens still use `tn-stack`, `tn-grid`, `tn-toolbar`, `tn-cluster`, `tn-board` and `tn-table-wrap` from it.

In `src/app/SearchBox.tsx`, find the element carrying `className="tn-custom-search"` and keep that class (the CSS below sizes it). Read the file to see where it is; do not change its behaviour.

- [ ] **Step 5: The CSS**

In `src/styles.css`, delete the "Header placement" block (`.tn-custom-brand`, `.tn-custom-tools`, `.tn-custom-search`, `.tn-custom-me`) and the `.tn-custom-wordmark` rule, and delete the `.tn-custom-brand`, `.tn-custom-tools` and `.tn-custom-search` lines inside `@media (max-width: 767px)`. Replace the `.tn-custom-main` block with the one below. Add:

```css
/* The app frame: full window width, the header on top. Bench has no centred column, and neither does Binder. */
.tn-custom-app { min-height: 100vh; display: flex; flex-direction: column; }

/* AppHeader, in Bench's header's shape (bench/kanban/board.css, "header"). */
.tn-custom-appbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
  padding: 10px var(--tenon-dimension-200);
  background: var(--tenon-background-raised);
  border-bottom: var(--tenon-dimension-012) solid var(--tenon-stroke-default);
}
.tn-custom-appbar-brand { display: flex; align-items: center; }
.tn-custom-appbar-brand a { display: flex; }
.tn-custom-wordmark { display: block; height: 1.15rem; width: auto; overflow: visible; }
.tn-custom-appbar-gap { flex: 1 1 auto; }
.tn-custom-appbar-search { flex: 0 1 200px; min-width: 0; }
.tn-custom-appbar-search .tn-custom-search { width: 100%; }
.tn-custom-appbar-actions { display: flex; align-items: center; gap: var(--tenon-dimension-100); }
.tn-custom-me { white-space: nowrap; color: var(--tenon-text-subtle); }

/* One pill holding the view tabs, Bench's .tabs and .tab. */
.tn-custom-pill {
  list-style: none; margin: 0;
  display: inline-flex; gap: 3px; padding: 3px;
  background: var(--tenon-background-neutral);
  border-radius: var(--tenon-radius-md);
}
.tn-custom-pill-tab {
  display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
  padding: 5px 11px;
  border-radius: var(--tenon-radius-default);
  font-size: var(--tenon-typography-size-sm); font-weight: 560;
  color: var(--tenon-text-subtle);
}
.tn-custom-pill-tab:hover { color: var(--tenon-text-default); text-decoration: none; }
.tn-custom-pill-tab[aria-current="page"] {
  background: var(--tenon-background-raised); color: var(--tenon-text-default);
  box-shadow: var(--tenon-elevation-raised, none);
}

/* The page under the header: full width, Bench's 16px gutters. */
.tn-custom-main {
  flex: 1; min-width: 0;
  padding: var(--tenon-dimension-200) var(--tenon-dimension-200) var(--tenon-dimension-600);
}
```

Inside `@media (max-width: 767px)` add:
```css
  /* Wordmark and New on one row, search across the next. */
  .tn-custom-appbar-gap { display: none; }
  .tn-custom-appbar-actions { margin-left: auto; }
  .tn-custom-appbar-search { order: 3; flex: 1 1 100%; }
```
and change the existing `.tn-custom-main` line there to
```css
  .tn-custom-main { padding: var(--tenon-dimension-200) var(--tenon-dimension-200) calc(56px + var(--tenon-dimension-500)); }
```
(the `:has(.tn-custom-bar)` line under it stays).

Before writing the shadow line, check `node_modules/@tiagopedras/tenon/dist/tenon.css` for an elevation token name (search `elevation`). Use the token that exists for a small raised shadow; if none fits, drop the `box-shadow` line.

- [ ] **Step 6: Verify**

Run: `npm run check && npm test`
Expected: all pass, including `src/app/Layout.test.tsx` unchanged (it finds `link` "Pipeline", the name "Ana", "Sign out", and the searchbox).

Run `npm run build && cd .. && BINDER_DB=/tmp/binder-plan6.db .venv/bin/python -m binder` in the background, open `http://127.0.0.1:8770/` at 1280px wide and at 390px, and check: one white bar across the top with `binder.` on the left, the pill of tabs, a ~200px search, New / name / Sign out on the right; content runs the full width with 16px margins. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src/app/AppHeader.tsx src/app/AppHeader.test.tsx src/app/Layout.tsx src/app/SearchBox.tsx src/styles.css
git commit -m "Web: AppHeader in Bench's shape, and a full-width page"
```

---

### Task 4: Bench's headings, no repeated titles, calmer colour

Bench's column heads (`board.css` line ~1094): `padding: 11px 13px 9px; min-height: 41px; gap: 8px; font-size: var(--tenon-typography-size-sm); font-weight: 700; letter-spacing: .03em; text-transform: uppercase`. Bench's big numbers are neutral ink.

**Files:**
- Modify: `src/styles.css`, `src/pages/HomePage.tsx`, `src/pages/PipelinePage.tsx`, `src/pages/ListPage.tsx`, `src/pages/OrgPage.tsx`
- Test: `src/pages/HomePage.test.tsx`, `src/pages/PipelinePage.test.tsx`, `src/pages/ListPage.test.tsx`, `src/pages/OrgPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/HomePage.test.tsx` (read it first; reuse its existing stubs for `/api/attention`, `/api/activity?limit=30` and `/api/orgs`):
```tsx
test('Home has no page title: the tab says where you are', async () => {
  // use the same stubFetch setup as the file's first test
  renderApp(<HomePage />)
  await screen.findByText('Open pipeline')
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
})
```
Add to `src/pages/PipelinePage.test.tsx`:
```tsx
test('the pipeline has no page title', async () => {
  stubFetch({ 'GET /api/orgs?kind=lead': () => [a, b] })
  renderApp(<PipelinePage />)
  await screen.findByTestId('stage-lead')
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
})
```
Add to `src/pages/ListPage.test.tsx` the same check after the list loads (reuse the file's stub for `GET /api/orgs?sort=updated`).

Run: `npm test`
Expected: the three new tests FAIL (each page still has an `h1`).

- [ ] **Step 2: Remove the titles**

- `HomePage.tsx`: delete `<div className="tn-toolbar"><h1 className="tenon-heading-3">Home</h1></div>`.
- `PipelinePage.tsx`: delete both `<div className="tn-toolbar"><h1 className="tenon-heading-3">Pipeline</h1></div>` blocks (phone and desktop).
- `ListPage.tsx`: delete `<h1 className="tenon-heading-3">Organisations</h1>`; the `tn-toolbar` keeps its `tn-cluster` of filters.

Add a visually hidden title so each page still has a document heading for screen readers: in each of the three pages put `<h1 className="tn-sr-only">Home</h1>` (`Pipeline`, `Organisations`) as the first child. Check `tn-page.css` / `tenon.css` for an existing visually-hidden class (search `sr-only` or `visually-hidden`); if none, add to `styles.css`:
```css
.tn-custom-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```
and use `tn-custom-sr-only`.

jsdom does not compute visibility from CSS, so the three new tests assert the class rather than absence. Change each of them from `expect(screen.queryByRole('heading', { level: 1 })).toBeNull()` to:
```tsx
expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
```
(with the class name you chose). They still fail before this step and pass after it.

- [ ] **Step 3: Calm the numbers**

- `HomePage.tsx`: every `<Stat … tone=… />` loses its `tone` prop (Tenon's default is neutral).
- `OrgPage.tsx`: the two `Stat`s lose `tone`. (Task 6 replaces them with fact rows; this keeps the step small.)

- [ ] **Step 4: Bench's column heads and section heads**

Add to `src/styles.css`:
```css
/* Column and section heads in Bench's style: small, bold, uppercase, tracked (bench/kanban/board.css, .tenon-column__head). */
.tenon-column__head {
  padding: 11px 13px 9px; min-height: 41px; gap: 8px;
  font-size: var(--tenon-typography-size-sm); font-weight: 700;
  letter-spacing: .03em; text-transform: uppercase;
}
.tenon-column__title { font: inherit; letter-spacing: inherit; margin: 0; }
.tenon-column__count { font-weight: 600; color: var(--tenon-text-faint); }

/* A Stat's figure in ink, its label small and uppercase, as Bench's COMPLETED box. */
.tenon-stat { color: var(--tenon-text-default); }
```
Read `node_modules/@tiagopedras/tenon/dist/tenon-react.css` for the Stat's eyebrow class (search `tenon-stat`) and add a rule giving it `font-size: var(--tenon-typography-size-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tenon-text-subtle);`.

- [ ] **Step 5: Verify**

Run: `npm run check && npm test`
Expected: all pass. Some existing tests may look for a heading by name (`getByRole('heading', { name: 'Needs attention' })`): those still work, since only the case is CSS. Fix any test that relied on the removed `h1` by finding the content instead, and say which in your report.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/pages
git commit -m "Web: Bench's uppercase heads, no repeated page titles, neutral figures"
```

---

### Task 5: `Drawer`

Bench's drawer (`board.css` "drawer", line ~2506): fixed to the right, full height, 400px wide (Binder: 440px), `max-width: 100vw`, raised surface, a left hairline, `box-shadow: -8px 0 24px` of a dark shade, slides in with `transform: translateX(103%)` → `none` over `.18s`; a scrim behind it at 28% dark fades in; head row `padding: 12px 14px; border-bottom: 1px solid var(--tenon-stroke-default)`. On a phone (≤640px) it is the whole screen.

**Files:**
- Create: `src/components/Drawer.tsx`, `src/components/Drawer.test.tsx`
- Modify: `src/styles.css`, `src/app/SearchBox.tsx` (skip `/` while a drawer is open)

- [ ] **Step 1: Write the tests**

`src/components/Drawer.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { Drawer } from './Drawer'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Drawer open={open} title="Acme" onClose={() => { setOpen(false); onClose() }} actions={<button>Log</button>}>
        <button>Inside</button>
      </Drawer>
    </>
  )
}

test('closed, nothing is in the page', () => {
  render(<Harness />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('open, it is a labelled dialog with its title, actions and body, and focus moves in', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  const dialog = screen.getByRole('dialog', { name: 'Acme' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument()
  expect(dialog).toContainElement(document.activeElement as HTMLElement)
})

test('Escape and Close both close it, and focus returns to what opened it', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<Harness onClose={onClose} />)
  const opener = screen.getByRole('button', { name: 'Open it' })
  await user.click(opener)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(opener).toHaveFocus()
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('clicking the scrim closes it', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  await user.click(screen.getByTestId('drawer-scrim'))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('Tab stays inside the drawer', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  const dialog = screen.getByRole('dialog')
  for (let i = 0; i < 6; i++) {
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  }
})
```

Run: `npx vitest run src/components/Drawer.test.tsx`
Expected: FAIL, cannot find `./Drawer`.

- [ ] **Step 2: Write the component**

`src/components/Drawer.tsx`:
```tsx
import { Button } from '@tiagopedras/tenon'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface DrawerProps {
  open: boolean
  /** The drawer's name: shown in its head and read out as the dialog's label. */
  title: ReactNode
  onClose: () => void
  /** Buttons in the head, before Close. */
  actions?: ReactNode
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * A panel that slides in from the right over the page, in the shape Bench's task drawer has. It is a modal dialog:
 * a scrim dims the page, focus moves in and stays in, Escape or the scrim or Close shut it, and focus goes back to
 * whatever had it before. On a phone it is the whole screen. Written to move into Tenon unchanged.
 */
export function Drawer({ open, title, onClose, actions, children }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null)
  const before = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    before.current = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      // A Tenon modal opened from inside the drawer (Edit, Log) owns Escape and Tab while it is up.
      if (document.querySelector('.tenon-modal')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <>
      <div className="tn-custom-scrim" data-testid="drawer-scrim" onClick={() => onClose()} />
      <div ref={panel} className="tn-custom-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="tn-custom-drawer-head">
          <h2 id={titleId} className="tn-custom-drawer-title">{title}</h2>
          <div className="tn-custom-drawer-actions">
            {actions}
            <Button size="sm" variant="ghost" onClick={() => onClose()}>Close</Button>
          </div>
        </div>
        <div className="tn-custom-drawer-body">{children}</div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/components/Drawer.test.tsx`
Expected: PASS.

- [ ] **Step 4: The CSS**

Add to `src/styles.css`:
```css
/* Drawer, in the shape of Bench's task drawer (bench/kanban/board.css, "drawer"). */
.tn-custom-scrim {
  position: fixed; inset: 0; z-index: 30;
  background: color-mix(in srgb, var(--tenon-text-default) 28%, transparent);
  animation: tn-custom-fade .15s ease;
}
.tn-custom-drawer {
  position: fixed; top: 0; right: 0; z-index: 31;
  height: 100%; width: 440px; max-width: 100vw;
  display: flex; flex-direction: column;
  background: var(--tenon-background-raised);
  border-left: var(--tenon-dimension-012) solid var(--tenon-stroke-default);
  box-shadow: var(--tenon-elevation-overlay);
  animation: tn-custom-slide .18s ease;
  outline: none;
}
.tn-custom-drawer-head {
  display: flex; align-items: center; gap: var(--tenon-dimension-100);
  padding: 12px 14px;
  border-bottom: var(--tenon-dimension-012) solid var(--tenon-stroke-default);
}
.tn-custom-drawer-title {
  flex: 1 1 auto; min-width: 0; margin: 0;
  font-size: var(--tenon-typography-size-md); font-weight: 650;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tn-custom-drawer-actions { display: flex; align-items: center; gap: var(--tenon-dimension-075); flex: none; }
.tn-custom-drawer-body {
  flex: 1 1 auto; overflow-y: auto;
  padding: var(--tenon-dimension-150) 14px var(--tenon-dimension-400);
  display: flex; flex-direction: column; gap: var(--tenon-dimension-150);
}
@keyframes tn-custom-slide { from { transform: translateX(103%); } to { transform: none; } }
@keyframes tn-custom-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .tn-custom-drawer, .tn-custom-scrim { animation: none; } }
@media (max-width: 640px) { .tn-custom-drawer { width: 100vw; border-left: 0; } }
```
Check the token names exist in `tenon.css` (`--tenon-elevation-overlay`, `--tenon-typography-size-md`); Bench's stylesheet uses `--tenon-elevation-overlay` already. Use the nearest existing size token if `-md` is missing.

- [ ] **Step 5: `/` must not jump to search while the drawer is open**

In `src/app/SearchBox.tsx`, beside the existing line `if (document.querySelector('.tenon-modal')) return`, add:
```ts
      if (document.querySelector('.tn-custom-drawer')) return
```
Add a test to `src/app/Layout.test.tsx`:
```tsx
test('slash does nothing while a drawer is open', async () => {
  const user = userEvent.setup()
  app()
  const panel = document.createElement('div')
  panel.className = 'tn-custom-drawer'
  document.body.appendChild(panel)
  await user.keyboard('/')
  expect(screen.getByRole('searchbox', { name: 'Search' })).not.toHaveFocus()
  panel.remove()
})
```

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm test`
Expected: all pass.

```bash
git add src/components/Drawer.tsx src/components/Drawer.test.tsx src/styles.css src/app/SearchBox.tsx src/app/Layout.test.tsx
git commit -m "Web: a side drawer in Bench's shape"
```

---

### Task 6: Shared sections, `OrgDetail`, and the restyled organisation page

The organisation page becomes two parts: `OrgPage` loads the record; `OrgDetail` draws it in a **frame**, `"page"` or `"drawer"`. Each section draws through `Section`, which is a plain Tenon `Column` on the page and a collapsible Column in the drawer (Tenon's `Column` takes `collapsible`, `open` and `collapseKey`, renders a `<details>` whose `<summary>` is the head, and spreads other props, such as `onToggle`, onto the `<details>`).

Value and last contact move from the two `Stat` boxes into the Overview's fact rows, in both frames (calmer, and the same parts in both places).

**Current code:** `src/pages/OrgPage.tsx` holds `OrgPage` (loads by slug) and `OrgView` (header with name, `StatusPicker`, Log/Edit/Research/Call/Email buttons, caption line, two `Stat`s, then a `tn-grid` with Overview, Timeline, Research on the left and People, Work on the right, the phone action bar, `OrgForm` and `QuickLog`). The sections are `TimelineSection`, `PeopleSection`, `WorkSection` (in `src/pages/org/`) and `ResearchSection` (in `src/components/`), each rendering its own `<Column titleAs="h2" title="…">`.

**Files:**
- Create: `src/pages/org/Section.tsx`, `src/pages/org/Section.test.tsx`, `src/pages/org/OrgDetail.tsx`
- Modify: `src/pages/OrgPage.tsx`, `src/pages/org/PeopleSection.tsx`, `src/pages/org/TimelineSection.tsx`, `src/pages/org/WorkSection.tsx`, `src/components/ResearchSection.tsx`, `src/styles.css`
- Test: `src/pages/OrgPage.test.tsx`, `src/pages/org/WorkSection.test.tsx`, `src/components/ResearchSection.test.tsx` (must stay green)

- [ ] **Step 1: Section tests**

`src/pages/org/Section.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { FrameContext, Section } from './Section'

afterEach(() => localStorage.clear())

test('on the page a section is a plain column with an h2', () => {
  render(<Section id="people" title="People"><p>body</p></Section>)
  expect(screen.getByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument()
  expect(document.querySelector('details')).toBeNull()
})

test('in the drawer it collapses, starts open, and remembers being closed', async () => {
  const user = userEvent.setup()
  const { unmount } = render(
    <FrameContext.Provider value="drawer"><Section id="people" title="People"><p>body</p></Section></FrameContext.Provider>,
  )
  const details = document.querySelector('details')!
  expect(details.open).toBe(true)
  expect(screen.getByRole('heading', { level: 3, name: 'People' })).toBeInTheDocument()
  await user.click(screen.getByText('People'))
  expect(details.open).toBe(false)
  expect(localStorage.getItem('binder.drawer.people')).toBe('closed')
  unmount()
  render(<FrameContext.Provider value="drawer"><Section id="people" title="People"><p>body</p></Section></FrameContext.Provider>)
  expect(document.querySelector('details')!.open).toBe(false)
})

test("a button in a drawer section's head does not fold the section", async () => {
  const user = userEvent.setup()
  const onAdd = vi.fn()
  render(
    <FrameContext.Provider value="drawer">
      <Section id="people" title="People" action={<button onClick={onAdd}>Add person</button>}><p>body</p></Section>
    </FrameContext.Provider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add person' }))
  expect(onAdd).toHaveBeenCalled()
  expect(document.querySelector('details')!.open).toBe(true)
})
```

Run: `npx vitest run src/pages/org/Section.test.tsx`
Expected: FAIL, cannot find `./Section`.

- [ ] **Step 2: Write Section**

`src/pages/org/Section.tsx`:
```tsx
import { Column, type ColumnProps } from '@tiagopedras/tenon'
import { createContext, useContext, useState, type ReactNode } from 'react'

/** Where an organisation's sections are drawn: on its own page, or in the drawer over a list. */
export type Frame = 'page' | 'drawer'
export const FrameContext = createContext<Frame>('page')
export const useFrame = () => useContext(FrameContext)

const key = (id: string) => `binder.drawer.${id}`

function readOpen(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) !== 'closed'
  } catch {
    return true
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    if (open) localStorage.removeItem(key(id))
    else localStorage.setItem(key(id), 'closed')
  } catch {
    // Storage can be off (a private window); the section still folds, it just isn't remembered.
  }
}

interface SectionProps extends Pick<ColumnProps, 'count' | 'titleAfter' | 'id'> {
  /** Names the section, and the key its open state is remembered under in the drawer. */
  id: string
  title: ReactNode
  action?: ReactNode
  children: ReactNode
}

/**
 * One section of an organisation: a Tenon Column with an h2 on the page, and in the drawer a collapsible Column
 * with an h3 whose open state is kept per device, as Bench's drawer sections are.
 */
export function Section({ id, title, action, count, titleAfter, children }: SectionProps) {
  const frame = useFrame()
  const [open, setOpen] = useState(() => readOpen(id))
  if (frame === 'page') {
    return <Column titleAs="h2" title={title} action={action} count={count} titleAfter={titleAfter}>{children}</Column>
  }
  return (
    <Column
      titleAs="h3"
      title={title}
      count={count}
      titleAfter={titleAfter}
      // A click on a button in the summary would also fold the section; stop the summary's default, keep the button's own handler.
      action={action && <span onClick={(e) => e.preventDefault()}>{action}</span>}
      collapsible
      open={open}
      collapseKey={id}
      onToggle={(e: React.SyntheticEvent<HTMLElement>) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        writeOpen(id, now)
      }}
    >
      {children}
    </Column>
  )
}
```
Add `import type React from 'react'` if the `React.SyntheticEvent` type is not otherwise in scope (or import `SyntheticEvent` from 'react').

Note: jsdom fires `toggle` on `<details>` asynchronously or not at all in some versions. If the "remembers being closed" test fails only because `toggle` never fires in jsdom, change the handler to an `onClick` on the summary area instead: Tenon's `<summary>` is the column head; wrap nothing, but listen with `onClickCapture` on the Column (spread onto `<details>`), check `(e.target as Element).closest('summary')` and that the click wasn't inside a `button`, then compute `!open`, call `setOpen` and `writeOpen`. Keep whichever works in both jsdom and Chromium, and say which in your report.

- [ ] **Step 3: Run the Section tests**

Run: `npx vitest run src/pages/org/Section.test.tsx`
Expected: PASS.

- [ ] **Step 4: Sections draw through Section**

In each file replace the outer `<Column titleAs="h2" title="X" …>` … `</Column>` with `<Section id="…" title="X" …>` … `</Section>`, keeping every other prop that exists (`action`, `count`) and the children unchanged, and import `Section` from `./Section` (or `../pages/org/Section` from `src/components/ResearchSection.tsx`). Remove `Column` from the Tenon import if it is no longer used.

| File | id |
|---|---|
| `src/pages/org/PeopleSection.tsx` | `people` |
| `src/pages/org/TimelineSection.tsx` | `timeline` |
| `src/pages/org/WorkSection.tsx` | `work` |
| `src/components/ResearchSection.tsx` | `research` (read its `<Column …>` at line ~85: keep its `id`/`action` props; if it sets `id="research"` for the page's `#research` link, keep that on the Section through the `id` prop) |

`TimelineSection` also takes a limit for the drawer. Change its `Props` to:
```ts
interface Props {
  items: Loaded<TimelineItem[]>
  contacts: Contact[]
  onEdit: (i: TimelineInteraction) => void
  /** Show only the newest `limit` entries, then a link to the rest. */
  limit?: number
  /** Where "Show all" goes when a limit hides entries. */
  moreHref?: string
}
```
and in the body, draw `items.data.slice(0, limit ?? items.data.length)` instead of `items.data`, and after the `</ol>`:
```tsx
        {limit !== undefined && moreHref && items.data.length > limit && (
          <Link to={moreHref} className="tenon-caption">Show all {items.data.length}</Link>
        )}
```
(the `<ol>` and this link need a fragment around them; import `Link` from `react-router-dom`). Add a test to a new `src/pages/org/TimelineSection.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { TimelineItem } from '../../api/types'
import { renderApp } from '../../test/render'
import { TimelineSection } from './TimelineSection'

const entries = Array.from({ length: 7 }, (_, n) => ({
  kind: 'status', id: n + 1, at: '2026-11-10T12:00:00+00:00', from_status: 'lead', to_status: 'contacted', by_email: 'ana@example.com',
})) as unknown as TimelineItem[]
const loaded = { data: entries, error: undefined, reload() {}, setData() {} } as never

test('a limit shows the newest entries and links to the rest', () => {
  renderApp(<TimelineSection items={loaded} contacts={[]} onEdit={() => {}} limit={5} moreHref="/o/acme" />)
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByRole('link', { name: 'Show all 7' })).toHaveAttribute('href', '/o/acme')
})

test('without a limit every entry shows and there is no link', () => {
  renderApp(<TimelineSection items={loaded} contacts={[]} onEdit={() => {}} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(7)
  expect(screen.queryByRole('link', { name: /Show all/ })).toBeNull()
})
```
Check the `Loaded` type in `src/lib/useApi.ts` and the `TimelineStatus` fields in `src/api/types.ts`, and adjust the fixture so it type-checks without `never` if you can.

- [ ] **Step 5: Move the view into OrgDetail**

Create `src/pages/org/OrgDetail.tsx` and move into it everything from `OrgPage.tsx` except `OrgPage` itself: `facts()`, `ViewProps`, and `OrgView`, renamed `OrgDetail`, with one new prop `frame: Frame`. Then change it as follows.

`facts()` gains the two figures as its first rows:
```tsx
function facts(org: Org): [string, ReactNode][] {
  const all: [string, ReactNode][] = [
    ['Next step', org.next_step ? <NextStep org={org} /> : null],
    ['Value', org.value_estimate != null ? money(org.value_estimate) : null],
    ['Last contact', ago(org.last_contact)],
    ['Sector', org.sector],
    ['Size', org.size],
    ['Location', org.location],
    ['Source', org.source],
    ['Tags', org.tags.length ? org.tags.map((t) => <Tag key={t}>{t}</Tag>) : null],
  ]
  return all.filter(([, v]) => v)
}
```
and the `<div className="tn-cluster">` with the two `Stat`s is deleted (remove `Stat` and `lastContactTone` imports if unused).

The Overview `Column` becomes `<Section id="overview" title="Overview">`.

The header and body depend on the frame. Wrap the whole return in `<FrameContext.Provider value={frame}>`. For `frame === 'page'` keep today's structure: the `<header className="tn-stack tn-custom-stage" …>` with the `h1`, picker and buttons, then the `tn-grid tn-custom-split` with the two columns, the phone bar, `OrgForm` and `QuickLog`. For `frame === 'drawer'`, render instead:
```tsx
      <div className="tn-stack">
        <div className="tn-cluster tn-custom-drawer-tools">
          <StatusPicker org={org} aria="Status" onChange={(s) => void changeStatus(s)} disabled={busy} />
          <Button size="sm" variant="primary" onClick={() => setLog('new')}>Log</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          <LinkButton size="sm" variant="ghost" href={`/o/${org.slug}`}>Open page</LinkButton>
        </div>
        <p className="tenon-caption tn-custom-faint">
          {label(org.kind)} · owned by {person(org.owner_email)}
          {org.website && <> · {siteLink}</>}
        </p>
        {(notice ?? refreshError) && <Alert tone="error">{notice ?? `Could not refresh: ${refreshError}`}</Alert>}
        {/* the Overview Section, unchanged */}
        <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
        <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} limit={5} moreHref={`/o/${org.slug}`} />
        <ResearchSection subject={{ kind: 'org', id: org.id }} orgId={org.id} people={contacts} />
        {meta.bench && <WorkSection orgId={org.id} slug={org.slug} />}
      </div>
```
followed by the same `OrgForm` and `QuickLog` as the page. Pull the Overview section into a local `const overview = (<Section id="overview" title="Overview">…</Section>)` so both frames render the one element.

Check `LinkButton` accepts `size` (read `Button.d.ts`); drop `size` if not. `LinkButton href` is a plain `<a>`: for "Open page" that is a full navigation, which is fine. If a client-side navigation is wanted, use `<Link className=…>` instead and say so in the report.

`OrgDetail` takes one more optional prop for the drawer:
```ts
  /** Told whenever the record changes here (status, edit, a log moving last contact), so a list behind can update. */
  onChanged?: (org: Org) => void
```
Call it wherever `setOrg(x)` is called with a new record: after `changeStatus` succeeds, after `OrgForm`'s `onSaved`, and in the 409 branch with `e.current`. `onDeleted` in the drawer frame calls a new optional prop `onDeleted?: () => void` instead of `navigate('/list')`; on the page keep `navigate('/list')`.

`OrgPage.tsx` keeps only:
```tsx
export function OrgPage() {
  const { slug = '' } = useParams()
  const org = useApi(() => api.orgBySlug(slug), [slug])
  if (org.error && !org.data) return <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
  if (!org.data) return <Loading />
  // A failed refresh keeps the page that is already on screen.
  return <OrgDetail key={org.data.id} frame="page" org={org.data} setOrg={org.setData} reloadOrg={org.reload} refreshError={org.error?.message} />
}
```
with its imports trimmed to what it uses.

- [ ] **Step 6: The page's own CSS**

The page header's left rule (`.tn-custom-stage`) stays. Add for the drawer's tool row:
```css
.tn-custom-drawer-tools { gap: var(--tenon-dimension-075); }
.tn-custom-drawer-tools .tn-custom-status { min-width: 10rem; }
```

- [ ] **Step 7: Verify**

Run: `npm run check && npm test`
Expected: all pass. `OrgPage.test.tsx` checks the page as it was; if a test asserted a `Stat` by role or the eyebrow text "Value"/"Last contact" inside a Stat, it now finds the same words in the fact rows (`dt`). Update only assertions about the Stat element itself, and say which.

- [ ] **Step 8: Commit**

```bash
git add src/pages src/components/ResearchSection.tsx src/styles.css
git commit -m "Web: organisation sections shared by the page and a drawer frame"
```

---

### Task 7: `?org=` and `OrgDrawer`

**Files:**
- Create: `src/lib/useOrgDrawer.ts`, `src/lib/useOrgDrawer.test.tsx`, `src/components/OrgDrawer.tsx`, `src/components/OrgDrawer.test.tsx`

- [ ] **Step 1: Hook tests**

`src/lib/useOrgDrawer.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { expect, test } from 'vitest'
import { useOrgDrawer } from './useOrgDrawer'

function Probe() {
  const d = useOrgDrawer()
  const l = useLocation()
  const back = useNavigate()
  return (
    <>
      <p>at {l.pathname + l.search}</p>
      <p>slug {d.slug ?? '-'}</p>
      <button onClick={() => d.open('acme')}>open</button>
      <button onClick={d.close}>close</button>
      <button onClick={() => back(-1)}>back</button>
    </>
  )
}

function app(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="*" element={<Probe />} /></Routes>
    </MemoryRouter>,
  )
}

test('open puts the slug in the address and keeps the other params', async () => {
  const user = userEvent.setup()
  app('/pipeline?owner=ana%40example.com')
  await user.click(screen.getByRole('button', { name: 'open' }))
  expect(screen.getByText('at /pipeline?owner=ana%40example.com&org=acme')).toBeInTheDocument()
  expect(screen.getByText('slug acme')).toBeInTheDocument()
})

test('Back closes a drawer this page opened', async () => {
  const user = userEvent.setup()
  app('/pipeline')
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'back' }))
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
})

test('close after open goes back, so Back afterwards does not reopen it', async () => {
  const user = userEvent.setup()
  app('/pipeline')
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('slug -')).toBeInTheDocument()
})

test('a shared link opens with the drawer, and close drops the param without leaving the page', async () => {
  const user = userEvent.setup()
  app('/list?org=acme')
  expect(screen.getByText('slug acme')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('at /list')).toBeInTheDocument()
})
```

Run: `npx vitest run src/lib/useOrgDrawer.test.tsx`
Expected: FAIL, cannot find `./useOrgDrawer`.

- [ ] **Step 2: Write the hook**

`src/lib/useOrgDrawer.ts`:
```ts
import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * The organisation open in the drawer, kept in the address as ?org=<slug> so a reload keeps it and the link can be
 * shared. Opening pushes a history entry, so Back closes it. Closing a drawer this page opened goes back; closing
 * one that came in with the link drops the param in place.
 */
export function useOrgDrawer() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const slug = params.get('org') ?? undefined

  const open = useCallback(
    (next: string) => {
      const p = new URLSearchParams(params)
      p.set('org', next)
      setParams(p, { state: { drawer: true } })
    },
    [params, setParams],
  )

  const close = useCallback(() => {
    if ((location.state as { drawer?: boolean } | null)?.drawer) {
      navigate(-1)
      return
    }
    const p = new URLSearchParams(params)
    p.delete('org')
    setParams(p, { replace: true })
  }, [location.state, navigate, params, setParams])

  return { slug, open, close }
}
```

- [ ] **Step 3: Run the hook tests**

Run: `npx vitest run src/lib/useOrgDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 4: OrgDrawer tests**

`src/components/OrgDrawer.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { OrgDrawer } from './OrgDrawer'

const acme = org({ id: 1, slug: 'acme', name: 'Acme', sector: 'Retail' })
const routes = {
  'GET /api/orgs/by-slug/acme': () => acme,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], open: 0, done: 0 }),
}

test('with no slug nothing shows', () => {
  stubFetch(routes)
  renderApp(<OrgDrawer slug={undefined} onClose={() => {}} />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('a slug loads the organisation into a drawer named after it', async () => {
  stubFetch(routes)
  renderApp(<OrgDrawer slug="acme" onClose={() => {}} />)
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open page' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Retail')).toBeInTheDocument()
})

test('a status change in the drawer is reported to the page behind', async () => {
  const user = userEvent.setup()
  const onChanged = vi.fn()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...acme, status: 'contacted' }) })
  renderApp(<OrgDrawer slug="acme" onClose={() => {}} onChanged={onChanged} />)
  await user.click(await screen.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await vi.waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: 'contacted' })))
})
```
Read `src/pages/OrgPage.test.tsx` for the exact stubs the page needs (research and work routes, their response shapes) and copy them into `routes`.

Run: `npx vitest run src/components/OrgDrawer.test.tsx`
Expected: FAIL, cannot find `./OrgDrawer`.

- [ ] **Step 5: Write OrgDrawer**

`src/components/OrgDrawer.tsx`:
```tsx
import { Alert } from '@tiagopedras/tenon'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { OrgDetail } from '../pages/org/OrgDetail'
import { useApi } from '../lib/useApi'
import { Drawer } from './Drawer'
import { Loading } from './Loading'

interface Props {
  /** The organisation to show; undefined keeps the drawer shut. */
  slug: string | undefined
  onClose: () => void
  /** The record changed in the drawer: the list behind it should take the new copy. */
  onChanged?: (org: Org) => void
  /** The record was deleted from the drawer. */
  onDeleted?: (slug: string) => void
}

/** One organisation in the drawer over Pipeline, List or Home. */
export function OrgDrawer({ slug, onClose, onChanged, onDeleted }: Props) {
  return slug ? <Loaded slug={slug} onClose={onClose} onChanged={onChanged} onDeleted={onDeleted} /> : null
}

function Loaded({ slug, onClose, onChanged, onDeleted }: Props & { slug: string }) {
  const org = useApi(() => api.orgBySlug(slug), [slug])
  const title = org.data?.name ?? 'Organisation'
  return (
    <Drawer open title={title} onClose={onClose}>
      {org.error && !org.data ? (
        <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
      ) : !org.data ? (
        <Loading />
      ) : (
        <OrgDetail
          key={org.data.id}
          frame="drawer"
          org={org.data}
          setOrg={org.setData}
          reloadOrg={org.reload}
          refreshError={org.error?.message}
          onChanged={onChanged}
          onDeleted={() => {
            onDeleted?.(slug)
            onClose()
          }}
        />
      )}
    </Drawer>
  )
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm test`
Expected: all pass.

```bash
git add src/lib/useOrgDrawer.ts src/lib/useOrgDrawer.test.tsx src/components/OrgDrawer.tsx src/components/OrgDrawer.test.tsx
git commit -m "Web: ?org= opens an organisation in the drawer"
```

---

### Task 8: Sector colour, short money, initials, owner chips

Bench's bucket strip (`board.css` "the bucket strip", line ~139): a row with `gap: 6px`, `padding: 12px 16px 2px`, holding one pill of tabs (`.tabs`, as the header's) where each tab has an optional colour dot and a count. Binder's chips filter by owner.

**Files:**
- Modify: `src/lib/colour.ts`, `src/lib/colour.test.ts`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/styles.css`
- Create: `src/components/OwnerChips.tsx`, `src/components/OwnerChips.test.tsx`

- [ ] **Step 1: Tests for the helpers**

Append to `src/lib/colour.test.ts`:
```ts
import { sectorColour } from './colour'

test('a sector always gets the same chart colour, whatever its case or spacing', () => {
  expect(sectorColour('Retail')).toEqual(sectorColour(' retail '))
  expect(sectorColour('Retail').chart).toBeGreaterThanOrEqual(1)
  expect(sectorColour('Retail').chart).toBeLessThanOrEqual(10)
  expect(sectorColour('Retail').mark).toBe(`var(--tenon-chart-${sectorColour('Retail').chart})`)
})

test('different sectors spread across the colours', () => {
  const names = ['Retail', 'Healthcare', 'Software', 'Logistics', 'Design agency', 'Food & drink', 'Education', 'Finance']
  expect(new Set(names.map((n) => sectorColour(n).chart)).size).toBeGreaterThanOrEqual(5)
})
```
Append to `src/lib/format.test.ts`:
```ts
import { initials, moneyShort } from './format'

test('moneyShort rounds to thousands and millions in euros', () => {
  expect(moneyShort(950)).toBe('€950')
  expect(moneyShort(12000)).toBe('€12k')
  expect(moneyShort(12500)).toBe('€12.5k')
  expect(moneyShort(1_200_000)).toBe('€1.2M')
  expect(moneyShort(null)).toBe('')
})

test('initials come from the name part of an email', () => {
  expect(initials('ana.example@example.com')).toBe('AE')
  expect(initials('rui@example.com')).toBe('R')
  expect(initials(null)).toBe('')
})
```
(Merge the new imports into each file's existing import line rather than adding a second one.)

Run: `npx vitest run src/lib`
Expected: FAIL, `sectorColour`, `moneyShort`, `initials` not exported.

- [ ] **Step 2: Write the helpers**

Append to `src/lib/colour.ts`:
```ts
/**
 * A sector's colour, for the label at the top of a card, the way Bench colours a bucket. The sector is free text, so
 * its name is hashed to one of Tenon's ten chart colours: the same name always lands on the same colour. Drawn as
 * text on a raised card, where each chart colour reaches AA in both themes (see .tn-custom-chart in styles.css).
 */
export function sectorColour(sector: string): Colour {
  const name = sector.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return chart(((h % 10) + 1) as TagChart)
}
```
Read `src/lib/format.ts` around `money()` (line ~74) and `person()` (line ~91) for their style, then add after `money`:
```ts
/** A value in euros for a card's chip: €950, €12k, €12.5k, €1.2M. Empty when there is none. */
export function moneyShort(n: number | null | undefined): string {
  if (n == null) return ''
  const trim = (x: number) => String(Math.round(x * 10) / 10)
  if (Math.abs(n) >= 1_000_000) return `€${trim(n / 1_000_000)}M`
  if (Math.abs(n) >= 1000) return `€${trim(n / 1000)}k`
  return `€${Math.round(n)}`
}
```
and after `person`:
```ts
/** Up to two capitals from the name part of an email, for an owner chip: ana.example@… is AE. */
export function initials(email: string | null | undefined): string {
  if (!email) return ''
  const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}
```

Run: `npx vitest run src/lib`
Expected: PASS. If the spread test fails (fewer than 5 colours for the 8 names), change the multiplier 31 to 33 and rerun; report the value used.

- [ ] **Step 3: OwnerChips tests**

`src/components/OwnerChips.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { byOwner, OwnerChips, useOwnerFilter } from './OwnerChips'

const orgs = [
  org({ id: 1, owner_email: 'ana@example.com' }),
  org({ id: 2, owner_email: 'ana@example.com' }),
  org({ id: 3, owner_email: 'rui@example.com' }),
  org({ id: 4, owner_email: null }),
]

function Page() {
  const [owner, setOwner] = useOwnerFilter()
  const l = useLocation()
  return (
    <>
      <OwnerChips orgs={orgs} value={owner} onChange={setOwner} />
      <p>at {l.search}</p>
      <p>shown {byOwner(orgs, owner).length}</p>
    </>
  )
}

function app(path = '/pipeline') {
  renderApp(<Routes><Route path="*" element={<Page />} /></Routes>, path)
}

test('All, Me first, then other owners, then No owner, each with its count', () => {
  app()
  const chips = screen.getAllByRole('button').map((b) => b.textContent)
  expect(chips).toEqual(['All4', 'Me2', 'rui1', 'No owner1'])
  expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true')
})

test('picking an owner filters and goes in the address', async () => {
  const user = userEvent.setup()
  app()
  await user.click(screen.getByRole('button', { name: /^Me/ }))
  expect(screen.getByText('at ?owner=ana%40example.com')).toBeInTheDocument()
  expect(screen.getByText('shown 2')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /No owner/ }))
  expect(screen.getByText('at ?owner=none')).toBeInTheDocument()
  expect(screen.getByText('shown 1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /All/ }))
  expect(screen.getByText('at')).toBeInTheDocument()
})

test('a filter in a shared link is applied on load', () => {
  app('/pipeline?owner=rui%40example.com')
  expect(screen.getByRole('button', { name: /^rui/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('shown 1')).toBeInTheDocument()
})
```
The names come from `person()` in `format.ts`: read it to see what it returns for `rui@example.com` (the test above assumes `rui`; change the expected text to whatever `person()` gives and say so). `renderApp`'s session is signed in as `ana@example.com`.

Run: `npx vitest run src/components/OwnerChips.test.tsx`
Expected: FAIL, cannot find `./OwnerChips`.

- [ ] **Step 4: Write OwnerChips**

`src/components/OwnerChips.tsx`:
```tsx
import { useSearchParams } from 'react-router-dom'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { person } from '../lib/format'

/** '' is everyone, 'none' is organisations without an owner, anything else is an owner's email. */
export type OwnerValue = string

/** The owner filter in the address, as ?owner=. Changing it replaces the entry, so Back leaves the page rather than stepping through filters. */
export function useOwnerFilter(): [OwnerValue, (v: OwnerValue) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get('owner') ?? ''
  const set = (v: OwnerValue) => {
    const p = new URLSearchParams(params)
    if (v) p.set('owner', v)
    else p.delete('owner')
    setParams(p, { replace: true })
  }
  return [value, set]
}

/** The organisations one owner chip stands for. */
export function byOwner(orgs: Org[], value: OwnerValue): Org[] {
  if (!value) return orgs
  if (value === 'none') return orgs.filter((o) => !o.owner_email)
  return orgs.filter((o) => o.owner_email === value)
}

interface Props {
  /** Every organisation the page could show, before this filter: the counts come from here. */
  orgs: Org[]
  value: OwnerValue
  onChange: (v: OwnerValue) => void
}

/**
 * A row of owner chips with counts, in the shape of Bench's bucket strip: All, Me, every other owner by name, and No
 * owner when any organisation has none. Each chip is a toggle button.
 */
export function OwnerChips({ orgs, value, onChange }: Props) {
  const { me } = useSession()
  const counts = new Map<string, number>()
  for (const o of orgs) {
    const k = o.owner_email ?? 'none'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const others = Array.from(counts.keys())
    .filter((k) => k !== 'none' && k !== me.email)
    .sort((a, b) => person(a).localeCompare(person(b)))
  const chips: { value: OwnerValue; label: string; count: number }[] = [
    { value: '', label: 'All', count: orgs.length },
    ...(counts.has(me.email) ? [{ value: me.email, label: 'Me', count: counts.get(me.email)! }] : []),
    ...others.map((k) => ({ value: k, label: person(k), count: counts.get(k)! })),
    ...(counts.has('none') ? [{ value: 'none', label: 'No owner', count: counts.get('none')! }] : []),
  ]
  return (
    <div className="tn-custom-pill tn-custom-chips" role="group" aria-label="Owner">
      {chips.map((c) => (
        <button
          key={c.value || 'all'}
          type="button"
          className="tn-custom-pill-tab"
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
        >
          {c.label}
          <span className="tn-custom-chip-count">{c.count}</span>
        </button>
      ))}
    </div>
  )
}
```


- [ ] **Step 5: The CSS**

Add to `src/styles.css`:
```css
/* Owner chips: the header's pill, with a count per chip, as Bench's bucket strip. */
.tn-custom-chips { flex-wrap: wrap; }
.tn-custom-chips .tn-custom-pill-tab { border: 0; background: transparent; cursor: pointer; font: inherit; font-size: var(--tenon-typography-size-sm); font-weight: 560; }
.tn-custom-chips .tn-custom-pill-tab[aria-pressed="true"] { background: var(--tenon-background-raised); color: var(--tenon-text-default); }
.tn-custom-chip-count {
  min-width: 1.4em; padding: 0 5px; border-radius: var(--tenon-radius-full);
  background: var(--tenon-background-raised); color: var(--tenon-text-subtle);
  font-size: var(--tenon-typography-size-xs); font-weight: 650; text-align: center;
}
.tn-custom-pill-tab[aria-pressed="true"] .tn-custom-chip-count { background: var(--tenon-background-neutral); }

/* The row the chips sit in, with the page's own filter box at its right end. */
.tn-custom-filterbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.tn-custom-filterbar > :last-child { margin-left: auto; }
```

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm test`
Expected: all pass.

```bash
git add src/lib src/components/OwnerChips.tsx src/components/OwnerChips.test.tsx src/styles.css
git commit -m "Web: owner chips, sector colours, short money and initials"
```

---

### Task 9: Bench's card, and the Pipeline

Bench's card (`board.css` "card", line ~2241, and `.bucket` line ~2387): left accent bar; an eyebrow row with the bucket name in `font-size: var(--tenon-typography-size-xs); font-weight: 700; letter-spacing: .03em; text-transform: uppercase` in the bucket's colour; the title bold; then a row of small chips. Clicking a card opens the drawer.

**Current code:** `OrgCard` (above, `src/components/OrgCard.tsx`) puts a `<Link>` in `title`, the status Tag in `tags`, owner and last contact in `meta`, the next step in `summary`. `PipelinePage` renders `StatusPicker` in every card's `footer`.

**Files:**
- Modify: `src/components/OrgCard.tsx`, `src/pages/PipelinePage.tsx`, `src/pages/PipelinePage.test.tsx`, `src/styles.css`
- Create: `src/components/OrgCard.test.tsx`

- [ ] **Step 1: Card tests**

`src/components/OrgCard.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { OrgCard } from './OrgCard'

const acme = org({
  id: 1, slug: 'acme', name: 'Acme', sector: 'Retail', next_step: 'Send the proposal', next_step_due: '2026-11-20',
  value_estimate: 12000, owner_email: 'rui@example.com',
})

test('a card shows sector, name, next step and the chips', () => {
  renderApp(<OrgCard org={acme} />)
  expect(screen.getByText('Retail')).toHaveClass('tn-custom-sector')
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Send the proposal')).toBeInTheDocument()
  expect(screen.getByText('€12k')).toBeInTheDocument()
  expect(screen.getByText('R')).toHaveAttribute('title', expect.stringContaining('rui'))
})

test('no sector, no label', () => {
  renderApp(<OrgCard org={org({ sector: null })} />)
  expect(document.querySelector('.tn-custom-sector')).toBeNull()
})

test('with onOpen, clicking the name opens instead of navigating', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} />)
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  expect(onOpen).toHaveBeenCalledWith(acme)
})

test('a modified click still follows the link, so it can open in a new tab', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} />)
  await user.keyboard('{Meta>}')
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  await user.keyboard('{/Meta}')
  expect(onOpen).not.toHaveBeenCalled()
})
```

Run: `npx vitest run src/components/OrgCard.test.tsx`
Expected: FAIL.

- [ ] **Step 2: The new OrgCard**

Replace `OrgCard` in `src/components/OrgCard.tsx` (keep `NextStep` exported as it is):
```tsx
interface OrgCardProps extends Omit<CardProps, 'title'> {
  org: Org
  /** Show the status Tag. Off on the pipeline, where the column says it. */
  showStatus?: boolean
  /** Open the organisation in place (the drawer). A plain or keyboard click calls this; a modified click follows the link. */
  onOpen?: (org: Org) => void
}

/**
 * One organisation as a card in Bench's layout: sector as the eyebrow in its colour, the name, the next step, and a
 * row of chips (due date, value, the owner's initials). The left stripe is the stage's colour. Any other Card prop
 * (drag handlers, footer) passes through.
 */
export function OrgCard({ org, showStatus = true, onOpen, ...rest }: OrgCardProps) {
  const sector = org.sector?.trim()
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onOpen(org)
  }
  return (
    <Card
      eyebrow={sector ? (
        <span className="tn-custom-sector" style={{ '--tn-sector': sectorColour(sector).mark } as CSSProperties}>{sector}</span>
      ) : undefined}
      title={<Link to={`/o/${org.slug}`} onClick={open}>{org.name}</Link>}
      titleAs="h3"
      accent={stageColour(org.status).mark}
      tags={showStatus ? <StatusTag status={org.status} /> : undefined}
      summary={org.next_step ? <span className="tn-custom-muted">{org.next_step}</span> : undefined}
      footer={
        <span className="tn-custom-chiprow">
          {org.next_step_due && <DueDate due={org.next_step_due} />}
          {org.value_estimate != null && <Tag>{moneyShort(org.value_estimate)}</Tag>}
          {org.owner_email && (
            <span className="tn-custom-avatar" title={`Owned by ${person(org.owner_email)}`}>{initials(org.owner_email)}</span>
          )}
        </span>
      }
      {...rest}
    />
  )
}
```
Imports: `Card, Tag, type CardProps` from Tenon; `type CSSProperties, type MouseEvent` from 'react'; `sectorColour, stageColour` from '../lib/colour'; `initials, moneyShort, person` from '../lib/format'; `DueDate` and `StatusTag` as before. Remove `ago` if unused. A caller that passes its own `footer` (Home passes the attention reasons) replaces the chip row; that is intended for Home, which Task 11 handles.

- [ ] **Step 3: The card CSS**

```css
/* A card's sector label: Bench's bucket name, small, bold, uppercase, in the sector's chart colour. */
.tn-custom-sector {
  font-size: var(--tenon-typography-size-xs); font-weight: 700;
  letter-spacing: .03em; text-transform: uppercase;
  color: var(--tn-sector);
}
/* Bench's card title weight, and the chip row under it. */
.tenon-card .tenon-card__title { font-weight: 650; }
.tn-custom-chiprow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--tenon-dimension-050); }
.tn-custom-avatar {
  display: inline-grid; place-items: center;
  min-width: 1.6rem; height: 1.6rem; padding: 0 4px;
  border-radius: var(--tenon-radius-full);
  background: var(--tenon-background-neutral); color: var(--tenon-text-subtle);
  font-size: var(--tenon-typography-size-xs); font-weight: 650;
}
```
Read the card's class names in `tenon-react.css` (search `tenon-card__`) and adjust `.tenon-card__title` if the title element has another class.

- [ ] **Step 4: Pipeline tests, rewritten**

The card no longer carries a picker; status moves by drag, or in the drawer. Replace these tests in `src/pages/PipelinePage.test.tsx`:
- 'on a phone, a card moves with its status picker, and Won says it became a client'
- 'desktop cards also carry a status picker, and a failed move shows a notice and reloads'
- 'two quick moves do not undo each other'
- 'a stale move shows the current record without reloading the list'

with:
```tsx
const routes = {
  'GET /api/orgs?kind=lead': () => [a, b],
  'GET /api/orgs/by-slug/acme': () => a,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], open: 0, done: 0 }),
}

test('cards carry no status picker', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByTestId('stage-lead')
  expect(screen.queryByRole('button', { name: /Status of/ })).toBeNull()
})

test('clicking a card opens it in the drawer, and a move there updates the board', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, status: 'contacted' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await waitFor(() => expect(within(screen.getByTestId('stage-contacted')).getByRole('link', { name: 'Acme' })).toBeInTheDocument())
})

test('Won from the drawer says it became a client and takes it off the board', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, kind: 'client', status: 'active' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByTestId('stage-lead')?.textContent).not.toContain('Acme'))
})

test('the owner chips filter the board', async () => {
  const user = userEvent.setup()
  const c = org({ id: 3, name: 'Cobalt', slug: 'cobalt', status: 'lead', owner_email: 'rui@example.com' })
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [a, b, c] })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: /^Me/ }))
  expect(screen.queryByRole('link', { name: 'Cobalt' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
})

test('the filter box at the end of the chip row narrows the cards on screen', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await user.type(await screen.findByRole('searchbox', { name: 'Filter cards' }), 'bol')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the Lead column offers to add an organisation', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  const lead = await screen.findByTestId('stage-lead')
  expect(within(lead).getByRole('button', { name: '+ Add organisation' })).toBeInTheDocument()
  expect(within(screen.getByTestId('stage-contacted')).queryByRole('button', { name: '+ Add organisation' })).toBeNull()
})
```
Keep the other existing tests. The drag move keeps today's 409 and error handling (`move()`), so also keep one test on `move()`'s failure path through drag: Testing Library can fire `dragStart` on the card and `drop` on a column:
```tsx
test('a failed drag move shows a notice and reloads', async () => {
  const calls = stubFetch({
    ...routes,
    'PATCH /api/orgs/1': () => new Response(JSON.stringify({ detail: 'Server error' }), { status: 500 }),
  })
  renderApp(<PipelinePage />)
  const card = (await screen.findByRole('link', { name: 'Acme' })).closest('article')!
  fireEvent.dragStart(card, { dataTransfer: { setData() {}, effectAllowed: '' } })
  fireEvent.dragOver(screen.getByTestId('stage-contacted'))
  fireEvent.drop(screen.getByTestId('stage-contacted'))
  expect(await screen.findByText('Server error')).toBeInTheDocument()
  await waitFor(() => expect(calls.filter((x) => x.key === 'GET /api/orgs?kind=lead')).toHaveLength(2))
})
```
(import `fireEvent` from `@testing-library/react`). Read the work route's real response shape in `src/api/types.ts` (`Work`) and use it in `routes`.

Run: `npx vitest run src/pages/PipelinePage.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 5: The Pipeline**

In `src/pages/PipelinePage.tsx`:
1. Add state and hooks at the top of `PipelinePage`:
```tsx
  const { me } = useSession()  // merge with the existing `const { meta } = useSession()`
  const [owner, setOwner] = useOwnerFilter()
  const drawer = useOrgDrawer()
  const [creating, setCreating] = useState(false)
```
2. A filter box for the cards on screen (Bench's "Search tasks…" at the end of its bucket strip; the header search still searches everything). Add `const [find, setFind] = useState('')` beside the other state, and after the loading checks filter before grouping:
```tsx
  const needle = find.trim().toLowerCase()
  const shown = byOwner(orgs.data, owner).filter(
    (o) => !needle || [o.name, o.sector, o.next_step].some((v) => v?.toLowerCase().includes(needle)),
  )
  const groups = byStatus(shown, meta.lead_statuses)
```
3. A drawer change goes through the same placement as a move, and a client gets the notice:
```tsx
  function changed(saved: Org) {
    orgs.setData((prev) => place(prev, saved))
    if (saved.kind === 'client') setNotice({ tone: 'success', text: `${saved.name} is now a client.` })
  }
```
4. The top of both returns (phone and desktop) becomes:
```tsx
      <h1 className="tn-custom-sr-only">Pipeline</h1>
      <div className="tn-custom-filterbar">
        <OwnerChips orgs={orgs.data} value={owner} onChange={setOwner} />
        <input type="search" className="tn-custom-find" aria-label="Filter cards" placeholder="Filter cards…"
          value={find} onChange={(e) => setFind(e.target.value)} />
      </div>
      {note}
```
(use the visually hidden class chosen in Task 4).
5. Every `OrgCard` loses `footer={<StatusPicker …/>}` and gains `onOpen={(o) => drawer.open(o.slug)}`. Remove the `StatusPicker` import.
6. In the desktop board, the Lead column (the first of `meta.lead_statuses`, `lead`) gets a footer:
```tsx
            footer={s === meta.lead_statuses[0] ? (
              <button type="button" className="tn-custom-add" onClick={() => setCreating(true)}>+ Add organisation</button>
            ) : undefined}
```
7. At the end of both returns, before the closing `</div>`:
```tsx
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={changed}
        onDeleted={() => orgs.reload()} />
      <OrgForm open={creating} onClose={() => setCreating(false)}
        onSaved={(o) => { setCreating(false); orgs.setData((prev) => place(prev, o)); drawer.open(o.slug) }} />
```
Imports: `OrgDrawer`, `OrgForm`, `OwnerChips`, `byOwner`, `useOwnerFilter`, `useOrgDrawer`. Remove `useSession`'s unused names.

Then the CSS:
```css
/* Columns run to the foot of the window, and the board scrolls sideways when the stages don't fit. */
.tn-custom-board { min-width: 0; overflow-x: auto; align-items: stretch; min-height: calc(100vh - 170px); }
.tn-custom-board > .tenon-column { flex: 0 0 300px; }
/* The board's own filter box, Bench's "Search tasks…". Tenon v0.18's Input is the same skin; use it instead of the
   bare input if it takes type="search" and aria-label (read Input.d.ts), and drop this rule. */
.tn-custom-find {
  width: 200px; max-width: 100%; padding: 6px 10px;
  border: var(--tenon-dimension-012) solid var(--tenon-stroke-default); border-radius: var(--tenon-radius-default);
  background: var(--tenon-background-raised); color: var(--tenon-text-default); font: inherit; font-size: var(--tenon-typography-size-sm);
}
/* Bench's dashed "+ Add task". */
.tn-custom-add {
  width: 100%; padding: 8px; border: var(--tenon-dimension-012) dashed var(--tenon-stroke-default);
  border-radius: var(--tenon-radius-md); background: transparent;
  color: var(--tenon-text-subtle); font: inherit; font-size: var(--tenon-typography-size-sm); cursor: pointer;
}
.tn-custom-add:hover { color: var(--tenon-text-default); border-color: var(--tenon-text-faint); }
```
Delete the old `.tn-custom-board` and `.tn-custom-board:has(button[aria-expanded="true"])` rules: no card has a menu now. Read `tn-page.css` for `.tn-board`'s own layout (flex or grid) and make the two rules above fit it: the aim is fixed-width columns, sideways scroll, columns at least as tall as the window below the header.

- [ ] **Step 6: Verify**

Run: `npm run check && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/OrgCard.tsx src/components/OrgCard.test.tsx src/pages/PipelinePage.tsx src/pages/PipelinePage.test.tsx src/styles.css
git commit -m "Web: Bench's cards, owner chips and the drawer on the Pipeline"
```

---

### Task 10: The List

The owner dropdown gives way to the chips (the same `?owner=` param, so old links keep working). Kind, status, tag and sort stay as they are. Rows open the drawer.

**Files:**
- Modify: `src/pages/ListPage.tsx`, `src/pages/ListPage.test.tsx`, `src/styles.css`

- [ ] **Step 1: Tests**

Read `src/pages/ListPage.test.tsx`. Any test that picks an owner from the `Owner` dropdown now clicks the chip instead (`getByRole('button', { name: /^Me/ })` or the owner's name). Add:
```tsx
test('a row opens the organisation in the drawer', async () => {
  const user = userEvent.setup()
  // reuse the file's GET /api/orgs?sort=updated stub, plus the organisation's routes (by-slug, contacts, timeline, research, work)
  renderApp(<ListPage />, '/list')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})

test('the owner dropdown is gone; the chips filter instead', async () => {
  renderApp(<ListPage />, '/list')
  await screen.findByRole('group', { name: 'Owner' })
  expect(screen.queryByRole('button', { name: 'Owner' })).toBeNull()
})
```
`filterOrgs` keeps its `owner` field; its existing unit tests stay. It must treat `owner === 'none'` as "no owner": add
```tsx
test('filterOrgs with owner none keeps organisations without an owner', () => {
  expect(filterOrgs([org({ id: 1, owner_email: null }), org({ id: 2 })], { kind: '', status: '', owner: 'none', tag: '' }).map((o) => o.id)).toEqual([1])
})
```

Run: `npx vitest run src/pages/ListPage.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 2: Implement**

In `src/pages/ListPage.tsx`:
- `filterOrgs`: replace `(!f.owner || o.owner_email === f.owner)` with `(!f.owner || (f.owner === 'none' ? !o.owner_email : o.owner_email === f.owner))`.
- Delete the `Owner` `Dropdown`. Above the existing `tn-toolbar`, add the hidden title and the chip row; the chips count what the other filters leave:
```tsx
      <h1 className="tn-custom-sr-only">Organisations</h1>
      <div className="tn-custom-filterbar">
        <OwnerChips orgs={filterOrgs(all, { ...f, owner: '' })} value={f.owner} onChange={(v) => put('owner', v)} />
      </div>
```
- `const drawer = useOrgDrawer()`; the name `Link` in the table and `OrgCard` on the phone get the open behaviour: on the table row use
```tsx
<td><Link to={`/o/${o.slug}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); drawer.open(o.slug) }}>{o.name}</Link></td>
```
and on the phone `<OrgCard key={o.id} org={o} onOpen={(x) => drawer.open(x.slug)} />`.
- At the end: `<OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={() => orgs.reload()} onDeleted={() => orgs.reload()} />`.
- The table's header row and cells take Bench's style. Add a sector column after Name:
```tsx
<th scope="col">Sector</th>
…
<td>{o.sector ? <span className="tn-custom-sector" style={{ '--tn-sector': sectorColour(o.sector).mark } as CSSProperties}>{o.sector}</span> : null}</td>
```
CSS:
```css
/* The list in Bench's style: an uppercase head row and hairline rows. */
.tn-custom-table thead th {
  font-size: var(--tenon-typography-size-xs); font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  color: var(--tenon-text-faint);
}
.tn-custom-table tbody td { border-top: var(--tenon-dimension-012) solid var(--tenon-stroke-subtle); }
```
Read `tn-page.css`'s `.tn-table-wrap` rules first and only add what it doesn't already draw.

- [ ] **Step 3: Verify and commit**

Run: `npm run check && npm test`
Expected: all pass.

```bash
git add src/pages/ListPage.tsx src/pages/ListPage.test.tsx src/styles.css
git commit -m "Web: owner chips and the drawer on the List"
```

---

### Task 11: Home

Bench's COMPLETED box: a raised panel, a small uppercase label, a big neutral number, a muted line under it. Binder's three figures go in one panel, side by side. Needs attention keeps the pipeline's cards (with the attention reasons as the footer) and opens the drawer.

**Files:**
- Modify: `src/pages/HomePage.tsx`, `src/pages/HomePage.test.tsx`, `src/styles.css`

- [ ] **Step 1: Tests**

Add to `src/pages/HomePage.test.tsx` (reuse the file's stubs, plus the org routes for the drawer):
```tsx
test('the three figures sit in one panel', async () => {
  renderApp(<HomePage />)
  const panel = await screen.findByTestId('figures')
  expect(within(panel).getByText('Open pipeline')).toBeInTheDocument()
  expect(within(panel).getByText('Needs attention')).toBeInTheDocument()
  expect(within(panel).getByText('Active clients')).toBeInTheDocument()
})

test('a card under Needs attention opens the drawer', async () => {
  const user = userEvent.setup()
  renderApp(<HomePage />)
  // the attention stub's first organisation
  await user.click(await screen.findByRole('link', { name: 'Acme' })) // the name of the attention stub's first organisation
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
```

Run: `npx vitest run src/pages/HomePage.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 2: Implement**

In `HomePage.tsx`:
- Replace `<div className="tn-stat-strip">…</div>` with
```tsx
        <section className="tn-custom-figures" data-testid="figures" aria-label="Figures">
          <Stat eyebrow="Open pipeline" value={money(figures.pipeline)} caption={`${figures.openLeads} open leads`} />
          <Stat eyebrow="Needs attention" value={String(figures.attention)} caption={`${figures.overdue} with a missed next step`} />
          <Stat eyebrow="Active clients" value={String(figures.active)} caption={`${figures.paused} paused`} />
        </section>
```
- `const drawer = useOrgDrawer()`; each attention `OrgCard` gets `onOpen={(o) => drawer.open(o.slug)}`; the activity links stay links to the page (they carry `#i-<id>` anchors into the timeline).
- At the end: `<OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={() => { attention.reload(); orgs.reload(); activity.reload() }} onDeleted={() => { attention.reload(); orgs.reload() }} />`.
- Add the hidden `<h1 className="tn-custom-sr-only">Home</h1>` if Task 4 put it elsewhere, keep it first.

CSS:
```css
/* Home's figures: one raised panel, three of Bench's COMPLETED boxes side by side. */
.tn-custom-figures {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  background: var(--tenon-background-raised);
  border: var(--tenon-dimension-012) solid var(--tenon-stroke-default);
  border-radius: var(--tenon-radius-md);
}
.tn-custom-figures > .tenon-stat { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.tn-custom-figures > .tenon-stat + .tenon-stat { border-left: var(--tenon-dimension-012) solid var(--tenon-stroke-subtle); }
@media (max-width: 767px) {
  .tn-custom-figures { grid-template-columns: minmax(0, 1fr); }
  .tn-custom-figures > .tenon-stat + .tenon-stat { border-left: 0; border-top: var(--tenon-dimension-012) solid var(--tenon-stroke-subtle); }
}
```
Read `tenon-react.css` for the Stat's own box (class names, border, background) and adjust the second rule so the three read as one panel.

- [ ] **Step 3: Verify and commit**

Run: `npm run check && npm test`
Expected: all pass.

```bash
git add src/pages/HomePage.tsx src/pages/HomePage.test.tsx src/styles.css
git commit -m "Web: Home's figures in one panel, and its cards open the drawer"
```

---

### Task 12: Contact page, search results, forms

Their layout doesn't change. They pick up the shell, the uppercase heads (already, from Task 4) and Bench's button sizes.

**Files:**
- Modify: `src/pages/ContactPage.tsx`, `src/pages/SearchPage.tsx`, `src/components/OrgForm.tsx`, `src/components/ContactForm.tsx`, `src/components/QuickLog.tsx`, `src/styles.css`
- Test: their existing tests stay green

- [ ] **Step 1: Read the three pages and three forms**

Note every `Button` without `size`. Bench's buttons are small everywhere except a form's own Save (`board.css` `.btn` and `.btn.small`).

- [ ] **Step 2: Changes**

- `ContactPage.tsx`: the contact's name stays the `h1`. Header buttons get `size="sm"`. If it shows the organisation as a link, keep it a link to the page.
- `SearchPage.tsx`: if it renders a visible page title, make it the visually hidden `h1` ("Search"); each result group's Column already has Bench's head from Task 4. Organisation hits open the drawer the way List rows do (`useOrgDrawer` + `OrgDrawer`); contact and note hits stay links.
- Forms (`OrgForm`, `ContactForm`, `QuickLog`): secondary actions (Cancel, Delete) get `size="sm"`; the primary Save keeps its size. Field-group headings, if any (`h3`/`legend`), get the class `tn-custom-group` with:
```css
.tn-custom-group {
  margin: 0; font-size: var(--tenon-typography-size-sm); font-weight: 650;
  letter-spacing: .04em; text-transform: uppercase; color: var(--tenon-text-faint);
}
```
(Bench's `.field > span`). If a form has no group headings, skip this rule.

- [ ] **Step 3: Verify and commit**

Run: `npm run check && npm test`
Expected: all pass; fix any test that found a button by size-specific markup and say which.

```bash
git add src
git commit -m "Web: contact page, search and forms in Bench's sizes"
```

---

### Task 13: End-to-end flows, screenshots, docs

**Files:**
- Modify: `e2e/flows.spec.ts`, `../CLAUDE.md`, `../README.md`

- [ ] **Step 1: Update the flows**

In `e2e/flows.spec.ts`:
- 'the list opens an organisation': clicking the name now opens the drawer. Change the expectation to
```ts
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await expect(page).toHaveURL(/\?org=/)
```
- 'the pipeline moves a lead to the next stage': desktop keeps the drag. The phone branch changes to the drawer:
```ts
    await page.getByRole('link', { name }).click()
    const drawer = page.getByRole('dialog', { name })
    await drawer.getByRole('button', { name: 'Status', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Contacted' }).click()
    await drawer.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('radio', { name: /^Contacted/ }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
```
- Delete 'a card status menu on the pipeline is not cut off by the board' (no card has a menu now).
- Add:
```ts
test('the drawer opens from the pipeline, Back closes it, and the link reopens it', async ({ page, request }) => {
  const name = unique('Drawer Works')
  const org = await newOrg(request, name)
  await page.goto('/pipeline')
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`org=${org.slug}`))
  await page.goBack()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.goto(`/pipeline?org=${org.slug}`)
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).not.toHaveURL(/org=/)
})

test('owner chips filter the pipeline and stay in the address', async ({ page, request }) => {
  const name = unique('Chip Owned')
  await newOrg(request, name)
  await page.goto('/pipeline')
  await page.getByRole('button', { name: /^Me/ }).click()
  await expect(page).toHaveURL(/owner=/)
  await expect(page.getByRole('link', { name })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Me/ })).toHaveAttribute('aria-pressed', 'true')
})
```
Read `playwright.config.ts` for who the e2e server signs in as in local mode, so "Me" matches the owner `newOrg` records (an organisation is owned by whoever creates it if the API sets `owner_email` from the session; check `binder/` routes or the existing seed behaviour — the earlier local run showed "owned by dev"). If new organisations get no owner, pass `owner_email` in `newOrg`'s body for this test using that same local identity.

- [ ] **Step 2: Run everything**

Run: `npm run check && npm test && npm run e2e`
Expected: all pass, desktop and phone projects.

- [ ] **Step 3: Screenshots for the owner**

With Binder built and running locally on a scratch database seeded with invented organisations (several sectors, two owners, some overdue), take 1280×800 screenshots of Home, Pipeline, Pipeline with the drawer open, List and an organisation page, in light and dark, into the session scratchpad (not the repo). Report their paths. Do not run Bench for this; the owner has Bench's screenshots already.

While the pipeline is open, check the sector labels' contrast in both colour schemes: in Playwright, for every `.tn-custom-sector`, read `getComputedStyle(el).color` and the card's `getComputedStyle(card).backgroundColor`, compute the WCAG contrast ratio, and require at least 4.5 for each of the ten chart colours (seed sectors until all ten appear, using `sectorColour` to pick names). Report any that fall short; if any do, the fix is to draw that chart colour on the raised chip the way `.tn-custom-chart` does, not to change Tenon's colours.

- [ ] **Step 4: Docs**

`../CLAUDE.md`: in the web rules where it says CSS reads `var(--tenon-…)` tokens only, add: "The one exception is the wordmark's brand colours, in `web/src/app/Wordmark.tsx`, as Bench does with its own." In "Where the work stands", add plan 6 (this plan's file) as done once merged; for now add it as in progress on `feature/ui-consistency`. Read both sections first and match their wording style.

`../README.md`: wherever it describes the screens (Pipeline's status picker on cards, organisation page), update to: cards open the organisation in a drawer (`?org=<slug>`), status changes by drag or in the drawer, owner chips filter Pipeline and List (`?owner=`). Read it first; change only what is now wrong.

- [ ] **Step 5: Commit**

```bash
git add e2e/flows.spec.ts ../CLAUDE.md ../README.md
git commit -m "Web: flows for the drawer and owner chips; docs for plan 6"
```

---

## After the plan (owner's calls, not tasks)

- Open the PR from `feature/ui-consistency`; the owner merges.
- Propose `AppHeader` and `Drawer` to Tenon in an issue on `tiagopedras/tenon`, only when the owner says to.
- Tenon v0.19–v0.21 add OFFDESK brand themes; moving both apps onto them is a separate decision.
