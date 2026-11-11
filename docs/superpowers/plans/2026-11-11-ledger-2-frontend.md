# Ledger 2: Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Ledger web app (Home, Pipeline, List, Search, Organisation, Contact and Quick log) for desktop and phone, served by the existing FastAPI backend.

**Architecture:** A React + TypeScript single-page app in `web/`, built by Vite to `web/dist/`. FastAPI serves that folder and sends `index.html` for every non-API path, so links like `/o/<slug>` (which Bench will use) load the app. The app talks only to the `/api` routes from plan 1, whose shapes are in the README's API section. Tenon v0.17.0 supplies every component and token. One breakpoint at 768px switches between the desktop and phone layouts.

**Tech Stack:** React 18.3.1, react-router-dom 6.28.0, TypeScript 5.6.3, Vite 5.4.21, Tenon (`github:tiagopedras/tenon#v0.17.0`), Vitest 2.1.8 + Testing Library + jsdom, Playwright 1.49.1. Backend: FastAPI on Python 3.9.

**Branch:** `feature/frontend`. It already has the carry-over commit (`Carry-over fixes to response shapes`). Merge to `main` through a PR at the end.

---

## Decisions taken for this plan

- **Left out until their plans:** the Research and Work (Bench tasks) sections of the organisation page, the contact's research brief, and the quick log's "Paste and summarise" toggle. Plans 3 and 4 add them along with their APIs. Nothing in plan 2 draws a placeholder for them.
- **Editing** is one Tenon `Modal` per record (organisation, contact, interaction). On a phone the modal is a bottom sheet. One save sends one PATCH with only the changed fields plus `updated_at`. A 409 shows a message inside the form and loads the other person's version (`current`) into it.
- **Routing** is react-router-dom v6 with path routes. **Loading** is a small `useApi` hook written here, no query library.
- **Tests:** Vitest + Testing Library for the client, helpers and components. Playwright for the five spec flows at 390px and 1280px against a real backend on a throwaway database.
- **Money** is shown in pounds (`£`), with no pence.
- **Logging an interaction does not change the organisation's own next step.** The two are edited separately in v1.
- **Filtering on the List page happens in the browser** over the full list (the team's list is small). Sorting uses the API's `sort`.

## File map

Backend:
- Create `ledger/web.py`: serves `web/dist`, falls back to `index.html`.
- Modify `ledger/config.py`: `LEDGER_WEB` setting (`web_dir`).
- Modify `ledger/app.py`: install the web routes last.
- Create `tests/test_web.py`.

Frontend (`web/`):
- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`
- `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/manifest.webmanifest`, `scripts/icons.mjs`
- `src/main.tsx`: mounts the app.
- `src/styles.css`: Ledger's layout, using Tenon tokens only.
- `src/api/types.ts`: response and request shapes.
- `src/api/client.ts`: `request()` and `ApiError`.
- `src/api/endpoints.ts`: one typed function per route (`api.*`).
- `src/lib/format.ts`: labels, dates, money, links.
- `src/lib/forms.ts`: `orNull`, `text`, `changed`, `saveErrorText`.
- `src/lib/useApi.ts`: the loading hook.
- `src/lib/useIsPhone.ts`: the 768px breakpoint.
- `src/app/session.tsx`: loads `/api/meta` and `/api/whoami` once and provides them.
- `src/app/App.tsx`: routes.
- `src/app/Layout.tsx`: top bar, nav, phone tab bar, New button.
- `src/app/SearchBox.tsx`: the top-bar search, opened with `/`.
- `src/components/Loading.tsx`, `StatusTag.tsx`, `StatusPicker.tsx`, `ConfirmDelete.tsx`, `OrgCard.tsx`, `InteractionEntry.tsx`
- `src/components/OrgForm.tsx`, `ContactForm.tsx`, `QuickLog.tsx`: the three edit modals.
- `src/pages/HomePage.tsx`, `SearchPage.tsx`, `ListPage.tsx`, `PipelinePage.tsx`, `OrgPage.tsx`, `ContactPage.tsx`
- `src/pages/org/PeopleSection.tsx`, `src/pages/org/TimelineSection.tsx`
- `src/test/setup.ts`, `src/test/render.tsx`, `src/test/fixtures.ts`
- `e2e/flows.spec.ts`, `e2e/pwa.spec.ts`

Docs: `README.md`, `CLAUDE.md`, `.gitignore`.

## Rules that apply to every task

- Python is 3.9: `Optional`/`List`/`Dict`, never `X | Y`.
- Run `.venv/bin/pytest -q` and, from `web/`, `npm run check && npm test` before every commit. All must pass.
- Commit messages are plain, with no attribution lines and no mention of AI tools.
- CSS reads `var(--tenon-…)` tokens only: no hex colours, no font names.
- Tests use `@example.com` addresses.

---

### Task 1: The backend serves the built frontend

**Files:**
- Create: `ledger/web.py`
- Modify: `ledger/config.py` (the `Settings` dataclass and `load_settings`)
- Modify: `ledger/app.py` (end of `create_app`)
- Test: `tests/test_web.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_web.py`:

```python
import os

import pytest
from fastapi.testclient import TestClient

from ledger.app import create_app
from ledger.config import load_settings

from tests.conftest import TEAM


@pytest.fixture
def web(tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>")
    (dist / "assets" / "app-abc.js").write_text("console.log(1)")
    (dist / "manifest.webmanifest").write_text('{"name": "Ledger"}')
    (tmp_path / "secret.txt").write_text("not for you")
    env = {"LEDGER_DB": str(tmp_path / "t.db"), "LEDGER_WEB": str(dist), "LEDGER_AUTH": "header"}
    c = TestClient(create_app(load_settings(env)))
    c.headers.update(TEAM)
    return c


def test_web_dir_defaults_to_web_dist():
    assert load_settings({}).web_dir.endswith(os.path.join("web", "dist"))


def test_app_paths_get_index(web):
    for path in ("/", "/o/acme-studio", "/pipeline"):
        r = web.get(path)
        assert r.status_code == 200, path
        assert "id=root" in r.text
        assert r.headers["cache-control"] == "no-cache"


def test_built_assets_are_served_and_cached(web):
    r = web.get("/assets/app-abc.js")
    assert r.status_code == 200 and r.text == "console.log(1)"
    assert "immutable" in r.headers["cache-control"]


def test_manifest_has_its_media_type(web):
    r = web.get("/manifest.webmanifest")
    assert r.headers["content-type"].startswith("application/manifest+json")


def test_unknown_api_path_is_a_json_404(web):
    r = web.get("/api/nope")
    assert r.status_code == 404
    assert isinstance(r.json()["detail"], str)


def test_api_routes_still_answer(web):
    assert web.get("/api/whoami").json()["email"] == "ana@example.com"


def test_a_route_added_later_still_answers(web):
    @web.app.get("/later")
    def later():
        return {"ok": True}

    assert web.get("/later").json() == {"ok": True}


def test_no_file_outside_the_build_is_served(web):
    r = web.get("/%2e%2e/secret.txt")
    assert "not for you" not in r.text


def test_unbuilt_frontend_says_so(tmp_path):
    env = {"LEDGER_DB": str(tmp_path / "t.db"), "LEDGER_WEB": str(tmp_path / "missing")}
    r = TestClient(create_app(load_settings(env))).get("/")
    assert r.status_code == 404
    assert "npm run build" in r.json()["detail"]
```

- [ ] **Step 2: Run them to see them fail**

Run: `.venv/bin/pytest -q tests/test_web.py`
Expected: FAIL, first with `AttributeError: 'Settings' object has no attribute 'web_dir'`.

- [ ] **Step 3: Add the setting**

In `ledger/config.py`, add `from pathlib import Path` to the imports and, under `LOOPBACK`:

```python
DEFAULT_WEB = str(Path(__file__).resolve().parent.parent / "web" / "dist")
```

Add a field at the end of `Settings`:

```python
    web_dir: str = DEFAULT_WEB  # the built frontend, see ledger/web.py
```

Add one line to the module docstring, after the paragraph about header mode:

```
LEDGER_WEB is the built frontend folder (default: web/dist in the repo).
```

In `load_settings`, pass it in the `Settings(...)` call:

```python
        tz=tz,
        web_dir=env.get("LEDGER_WEB", DEFAULT_WEB),
    )
```

- [ ] **Step 4: Write `ledger/web.py`**

It is the 404 handler, not a catch-all route. A `/{path:path}` route would
match before any route added after it, and `tests/test_orgs.py` adds routes to
a built app (`@c.app.get("/boom-check")`), so a catch-all would break those
tests and any later router.

```python
"""Serves the built frontend (web/dist). A GET outside /api that no route
answers gets the file of that name from the build if there is one, and
index.html otherwise, so a path like /o/<slug> loads the app and its router
takes it from there. This is the 404 handler rather than a catch-all route,
so it never shadows a route, whenever that route is added. nginx's sign-in
check covers these files; the API's own guard covers /api."""

import mimetypes
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

mimetypes.add_type("application/manifest+json", ".webmanifest")

NO_CACHE = {"Cache-Control": "no-cache"}
FOREVER = {"Cache-Control": "public, max-age=31536000, immutable"}  # Vite hashes every name under assets/


def _is_app_path(request: Request) -> bool:
    path = request.url.path
    return request.method in ("GET", "HEAD") and path != "/api" and not path.startswith("/api/")


def install(app: FastAPI, web_dir: str) -> None:
    root = Path(web_dir).resolve()

    @app.exception_handler(StarletteHTTPException)
    async def _not_found(request: Request, exc: StarletteHTTPException):
        if exc.status_code != 404 or not _is_app_path(request):
            return await http_exception_handler(request, exc)  # FastAPI's own: {"detail": ...}
        index = root / "index.html"
        if not index.is_file():
            return JSONResponse({"detail": "The frontend is not built. Run npm run build in web/."}, status_code=404)
        rel = request.url.path.lstrip("/")
        target = (root / rel).resolve()
        if rel and target.is_file() and target.is_relative_to(root):
            return FileResponse(target, headers=FOREVER if rel.startswith("assets/") else NO_CACHE)
        return FileResponse(index, headers=NO_CACHE)
```

- [ ] **Step 5: Install it in `ledger/app.py`**

Change the import line to `from . import errors, web` and add, after `errors.install(app)`:

```python
    web.install(app, settings.web_dir)
```

- [ ] **Step 6: Run the tests**

Run: `.venv/bin/pytest -q`
Expected: all pass (125 tests), `tests/test_orgs.py` among them.

- [ ] **Step 7: Commit**

```bash
git add ledger/web.py ledger/config.py ledger/app.py tests/test_web.py
git commit -m "Serve the built frontend, with index.html for app paths"
```

---

### Task 2: Scaffold `web/`

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/app/App.tsx`, `web/src/styles.css`, `web/src/test/setup.ts`
- Modify: `.gitignore`

- [ ] **Step 1: `web/package.json`**

```json
{
  "name": "ledger-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "check": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "vite build && playwright test",
    "icons": "node scripts/icons.mjs"
  },
  "dependencies": {
    "@tiagopedras/tenon": "github:tiagopedras/tenon#v0.17.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.28.0",
    "thinking-orbs": "^0.3.2"
  },
  "devDependencies": {
    "@playwright/test": "1.49.1",
    "@testing-library/dom": "10.4.0",
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.1.0",
    "@testing-library/user-event": "14.5.2",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.4",
    "jsdom": "25.0.1",
    "typescript": "5.6.3",
    "vite": "5.4.21",
    "vitest": "2.1.8"
  }
}
```

`thinking-orbs` is Tenon's one runtime dependency, which Tenon leaves to the app (Bench does the same).

- [ ] **Step 2: `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 3: `web/vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/* `npm run dev` serves the app on :5173 and sends /api to the backend on
 * :8770 (`LEDGER_DB=ledger.db .venv/bin/python -m ledger` from the repo root).
 * `npm run build` writes web/dist, which the backend serves (ledger/web.py). */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8770' } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
```

- [ ] **Step 4: `web/index.html`**

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `web/src/main.tsx` and a first `App`**

`web/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@tiagopedras/tenon/tenon.css'
import '@tiagopedras/tenon/tenon-react.css'
import './styles.css'
import { App } from './app/App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

`web/src/app/App.tsx` (replaced in Task 8):

```tsx
export function App() {
  return <p>Ledger</p>
}
```

- [ ] **Step 6: `web/src/styles.css`**

The whole stylesheet now, so later tasks only add markup:

```css
/* Ledger's own layout. Colours, type and sizes come from Tenon tokens only. */
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--tenon-background-default);
  color: var(--tenon-text-default);
  font-family: var(--tenon-text-body-family);
  font-size: var(--tenon-text-body-size);
  line-height: var(--tenon-text-body-line-height);
}
a { color: var(--tenon-text-link); text-decoration: none; }
a:hover { color: var(--tenon-text-link-hovered); text-decoration: underline; }
h1, h2, h3, p { margin: 0; }

.lg-app { min-height: 100vh; display: flex; flex-direction: column; }
.lg-top {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: var(--tenon-dimension-150);
  padding: var(--tenon-dimension-100) var(--tenon-dimension-200);
  background: var(--tenon-background-raised);
  border-bottom: 1px solid var(--tenon-stroke-subtle);
}
.lg-brand {
  font-family: var(--tenon-text-title-family); font-size: var(--tenon-text-title-size);
  font-weight: var(--tenon-text-title-weight); color: var(--tenon-text-default);
}
.lg-nav { display: flex; gap: var(--tenon-dimension-050); }
.lg-nav a, .lg-tabs a {
  padding: var(--tenon-dimension-075) var(--tenon-dimension-150);
  border-radius: var(--tenon-radius-md); color: var(--tenon-text-subtle);
}
.lg-nav a.active, .lg-tabs a.active { background: var(--tenon-background-selected); color: var(--tenon-text-default); }
.lg-search {
  flex: 1; min-width: 0; max-width: 420px; margin-left: auto;
  padding: var(--tenon-dimension-075) var(--tenon-dimension-150);
  border: 1px solid var(--tenon-stroke-default); border-radius: var(--tenon-radius-md);
  background: var(--tenon-background-input); color: var(--tenon-text-default); font: inherit;
}
.lg-search:focus { outline: 2px solid var(--tenon-stroke-focus); outline-offset: 1px; }
.lg-me { color: var(--tenon-text-subtle); white-space: nowrap; }
.lg-main { flex: 1; width: 100%; max-width: 1280px; margin: 0 auto; padding: var(--tenon-dimension-300) var(--tenon-dimension-200); }
.lg-tabs {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; height: 56px;
  display: flex; justify-content: space-around; align-items: center;
  background: var(--tenon-background-raised); border-top: 1px solid var(--tenon-stroke-subtle);
  padding-bottom: env(safe-area-inset-bottom);
}
.lg-loading { display: flex; justify-content: center; padding: var(--tenon-dimension-400); }
.lg-faint { color: var(--tenon-text-subtle); }
.lg-overdue { color: var(--tenon-text-error); }
.lg-grow { flex: 1; }
.lg-page { display: flex; flex-direction: column; gap: var(--tenon-dimension-300); }

/* Home */
.lg-home { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tenon-dimension-300); align-items: start; }
.lg-activity { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tenon-dimension-100); }
.lg-activity li { display: flex; flex-direction: column; }

/* Search */
.lg-hits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tenon-dimension-150); }
.lg-hits mark { background: var(--tenon-background-warning-subtle); color: inherit; border-radius: var(--tenon-radius-sm); }

/* List */
.lg-filters { display: flex; flex-wrap: wrap; gap: var(--tenon-dimension-100); align-items: center; }
.lg-table { width: 100%; border-collapse: collapse; }
.lg-table th {
  text-align: left; color: var(--tenon-text-subtle);
  font-family: var(--tenon-text-label-family); font-size: var(--tenon-text-label-size); font-weight: var(--tenon-text-label-weight);
}
.lg-table th, .lg-table td { padding: var(--tenon-dimension-100); border-bottom: 1px solid var(--tenon-stroke-subtle); vertical-align: top; }
.lg-num { text-align: right; }
.lg-cards { display: flex; flex-direction: column; gap: var(--tenon-dimension-100); }

/* Pipeline */
.lg-board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); gap: var(--tenon-dimension-150); overflow-x: auto; align-items: start; }
.lg-drop { outline: 2px dashed var(--tenon-stroke-accent); outline-offset: 2px; }
.lg-stages { overflow-x: auto; }
.lg-count { color: var(--tenon-text-subtle); }

/* Organisation and contact pages */
.lg-org-head { display: flex; flex-direction: column; gap: var(--tenon-dimension-100); }
.lg-org-title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--tenon-dimension-150); }
.lg-actions { display: flex; flex-wrap: wrap; gap: var(--tenon-dimension-100); }
.lg-org-body { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--tenon-dimension-300); align-items: start; }
.lg-column { display: flex; flex-direction: column; gap: var(--tenon-dimension-300); }
.lg-section { display: flex; flex-direction: column; gap: var(--tenon-dimension-150); }
.lg-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--tenon-dimension-100); }
.lg-facts { display: grid; grid-template-columns: max-content 1fr; gap: var(--tenon-dimension-075) var(--tenon-dimension-200); margin: 0; }
.lg-facts dt { color: var(--tenon-text-subtle); }
.lg-facts dd { margin: 0; display: flex; flex-wrap: wrap; gap: var(--tenon-dimension-050); }
.lg-people, .lg-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tenon-dimension-150); }
.lg-people li { display: grid; grid-template-columns: 1fr auto; gap: 0 var(--tenon-dimension-100); }
.lg-people li > div:first-child { display: flex; gap: var(--tenon-dimension-075); align-items: center; flex-wrap: wrap; }
.lg-people li > button { grid-row: 1 / span 2; grid-column: 2; align-self: center; }
.lg-entry { display: flex; flex-direction: column; gap: var(--tenon-dimension-050); }
.lg-entry-head { display: flex; align-items: center; gap: var(--tenon-dimension-100); flex-wrap: wrap; }
.lg-entry-head > button { margin-left: auto; }
.lg-entry-text { white-space: pre-wrap; }
.lg-tl-status { color: var(--tenon-text-subtle); }
.lg-bar {
  position: fixed; left: 0; right: 0; bottom: 56px; z-index: 9;
  display: flex; gap: var(--tenon-dimension-100);
  padding: var(--tenon-dimension-100) var(--tenon-dimension-200);
  background: var(--tenon-background-raised); border-top: 1px solid var(--tenon-stroke-subtle);
}
.lg-bar > * { flex: 1; }

/* Forms */
.lg-form { display: flex; flex-direction: column; gap: var(--tenon-dimension-150); }
.lg-field { display: flex; flex-direction: column; gap: var(--tenon-dimension-050); }
.lg-chips { display: flex; flex-wrap: wrap; gap: var(--tenon-dimension-075); }
.lg-check { display: flex; align-items: center; gap: var(--tenon-dimension-100); }

@media (max-width: 767px) {
  .lg-main { padding: var(--tenon-dimension-200) var(--tenon-dimension-200) calc(56px + var(--tenon-dimension-400)); }
  .lg-main:has(.lg-bar) { padding-bottom: calc(112px + var(--tenon-dimension-400)); }
  .lg-home, .lg-org-body { grid-template-columns: 1fr; }
  .lg-search { max-width: none; }
  /* A modal is a bottom sheet on a phone. Modal puts className on its box. */
  .tenon-modal:has(.lg-sheet) { align-items: flex-end; padding: 0; }
  .lg-sheet { width: 100%; max-height: 92vh; border-radius: var(--tenon-radius-xl) var(--tenon-radius-xl) 0 0; }
}
```

- [ ] **Step 7: `web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom has no matchMedia. Every test sees the desktop layout unless it stubs this.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
```

- [ ] **Step 8: Ignore Playwright output**

Append to `.gitignore`:

```
web/test-results/
web/playwright-report/
```

(`node_modules/`, `dist/` and `*.db*` are already ignored.)

- [ ] **Step 9: Install, type-check, build and serve**

```bash
cd web && npm install && npm run check && npm run build && cd ..
LEDGER_DB=ledger.db .venv/bin/python -m ledger &
sleep 2; curl -s http://127.0.0.1:8770/o/anything | head -c 200; kill %1
```

Expected: `npm install` fetches Tenon from GitHub. `check` and `build` print no errors and `web/dist/index.html` exists. The curl prints the built `index.html`, with `<script type="module" … src="/assets/index-….js">`.

- [ ] **Step 10: Commit**

```bash
git add .gitignore web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/index.html web/src
git commit -m "Scaffold the web app: Vite, React, Tenon, Vitest"
```

---

### Task 3: API types and client

**Files:**
- Create: `web/src/api/types.ts`, `web/src/api/client.ts`
- Test: `web/src/api/client.test.ts`

- [ ] **Step 1: Write `web/src/api/types.ts`**

No behaviour, so no test of its own. The compiler checks every use.

```ts
/* Response and request shapes. The README's API section is the reference:
 * change the two together. */

export type Kind = 'lead' | 'client'

export interface Org {
  id: number
  slug: string
  name: string
  kind: Kind
  status: string
  website: string | null
  sector: string | null
  size: string | null
  location: string | null
  owner_email: string | null
  source: string | null
  value_estimate: number | null
  tags: string[]
  summary: string | null
  next_step: string | null
  next_step_due: string | null
  last_contact: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

export interface Contact {
  id: number
  org_id: number
  org_name: string
  org_slug: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  notes: string | null
  is_primary: boolean
  relationship: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

export interface Interaction {
  id: number
  org_id: number
  type: string
  happened_at: string
  summary: string
  next_step: string | null
  next_step_due: string | null
  contact_ids: number[]
  author_email: string
  created_at: string
  updated_at: string
  updated_by: string
}

export interface StatusChange {
  id: number
  org_id: number
  from_status: string | null
  to_status: string
  at: string
  by_email: string
}

export type TimelineInteraction = Omit<Interaction, 'author_email'> & { kind: 'interaction'; at: string; by_email: string }
export type TimelineStatus = StatusChange & { kind: 'status' }
export type TimelineItem = TimelineInteraction | TimelineStatus

export interface ActivityItem {
  kind: 'interaction' | 'status'
  id: number
  org_id: number
  org_name: string
  org_slug: string
  at: string
  type: string | null
  summary: string | null
  from_status: string | null
  to_status: string | null
  by_email: string
}

export interface SearchHit {
  kind: 'org' | 'contact' | 'interaction'
  id: number
  org_id: number
  org_name: string
  org_slug: string
  title: string
  snippet: string
}

export type Reason = 'overdue' | 'quiet' | 'stuck'

export interface AttentionItem {
  org: Org
  reasons: Reason[]
}

export interface Meta {
  kinds: Kind[]
  lead_statuses: string[]
  open_lead_statuses: string[]
  client_statuses: string[]
  interaction_types: string[]
  relationships: string[]
}

export interface Who {
  email: string
  name: string
  teams: string[]
}

/* Request bodies. A PATCH carries the updated_at it loaded and only the
 * fields that changed. */

export interface OrgFields {
  name: string
  website: string | null
  sector: string | null
  size: string | null
  location: string | null
  owner_email: string | null
  source: string | null
  value_estimate: number | null
  tags: string[]
  summary: string | null
  next_step: string | null
  next_step_due: string | null
}
export type OrgInput = Pick<OrgFields, 'name'> & Partial<OrgFields> & { kind?: Kind }
export type OrgPatch = Partial<OrgFields> & { status?: string; updated_at: string }

export interface ContactFields {
  name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  notes: string | null
  is_primary: boolean
  relationship: string | null
}
export type ContactInput = Pick<ContactFields, 'name'> & Partial<ContactFields>
export type ContactPatch = Partial<ContactFields> & { updated_at: string }

export interface InteractionFields {
  type: string
  summary: string
  happened_at: string
  next_step: string | null
  next_step_due: string | null
  contact_ids: number[]
}
export type InteractionInput = Pick<InteractionFields, 'type' | 'summary'> & Partial<InteractionFields>
export type InteractionPatch = Partial<InteractionFields> & { updated_at: string }
```

- [ ] **Step 2: Write the failing client tests**

`web/src/api/client.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import { ApiError, request } from './client'

function stub(res: Response | Error) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (res instanceof Error) throw res
    return res
  })
  vi.stubGlobal('fetch', f)
  return f
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('request', () => {
  test('a GET sends no X-Ledger and returns the JSON', async () => {
    const f = stub(json({ ok: 1 }))
    expect(await request('GET', '/api/x')).toEqual({ ok: 1 })
    const headers = f.mock.calls[0][1]!.headers as Record<string, string>
    expect(headers['X-Ledger']).toBeUndefined()
  })

  test('a write sends X-Ledger and the body as JSON', async () => {
    const f = stub(json({ id: 1 }, 201))
    await request('POST', '/api/orgs', { name: 'Acme' })
    const init = f.mock.calls[0][1]!
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Ledger']).toBe('1')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"name":"Acme"}')
  })

  test('204 returns undefined', async () => {
    stub(new Response(null, { status: 204 }))
    expect(await request('DELETE', '/api/orgs/1')).toBeUndefined()
  })

  test('an error becomes an ApiError with detail, current and errors', async () => {
    stub(json({ detail: 'Changed since you loaded it', current: { id: 1 } }, 409))
    const err = await request('PATCH', '/api/orgs/1', {}).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, detail: 'Changed since you loaded it', current: { id: 1 } })
    expect(err.message).toBe('Changed since you loaded it')

    stub(json({ detail: 'name: Field required', errors: [{ loc: ['body', 'name'], msg: 'Field required', type: 'missing' }] }, 422))
    const bad = await request('POST', '/api/orgs', {}).catch((e) => e)
    expect(bad.errors).toHaveLength(1)
  })

  test('a body that is not JSON still gives a sentence', async () => {
    stub(new Response('<html>Bad gateway</html>', { status: 502 }))
    const err = await request('GET', '/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 502, detail: 'Request failed (502)' })
  })

  test('no network is status 0', async () => {
    stub(new TypeError('Failed to fetch'))
    const err = await request('GET', '/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 0 })
    expect(err.detail).toMatch(/cannot be reached/)
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd web && npx vitest run src/api/client.test.ts`
Expected: FAIL, `Failed to resolve import "./client"`.

- [ ] **Step 4: Write `web/src/api/client.ts`**

```ts
/* The one place the app calls fetch. Every error body from the API has
 * `detail`, a sentence to show people. A 409 adds `current`, the record as it
 * is now; a request-validation 422 adds `errors`. */

export interface FieldError {
  loc: (string | number)[]
  msg: string
  type: string
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly current?: unknown
  readonly errors?: FieldError[]

  constructor(status: number, detail: string, current?: unknown, errors?: FieldError[]) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.current = current
    this.errors = errors
  }
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') headers['X-Ledger'] = '1' // the API refuses a write without it
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Ledger cannot be reached. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data && typeof data.detail === 'string' ? data.detail : `Request failed (${res.status})`
    throw new ApiError(res.status, detail, data?.current, data?.errors)
  }
  return data as T
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/api/client.test.ts && npm run check`
Expected: 6 passed, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/api
git commit -m "Web: API types and the fetch client"
```

---

### Task 4: One function per route

**Files:**
- Create: `web/src/api/endpoints.ts`
- Test: `web/src/api/endpoints.test.ts`

- [ ] **Step 1: Write the failing test**

`web/src/api/endpoints.test.ts`:

```ts
import { expect, test, vi } from 'vitest'
import { api } from './endpoints'

function capture() {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', f)
  return () => f.mock.calls.map(([url, init]) => `${init?.method} ${url}`)
}

test('query strings leave out empty filters and encode the rest', async () => {
  const calls = capture()
  await api.orgs({ kind: 'lead', status: '', sort: 'name' })
  await api.search('acme & co')
  await api.orgBySlug('acme studio')
  await api.activity(10)
  expect(calls()).toEqual([
    'GET /api/orgs?kind=lead&sort=name',
    'GET /api/search?q=acme+%26+co',
    'GET /api/orgs/by-slug/acme%20studio',
    'GET /api/activity?limit=10',
  ])
})

test('writes go to the right place with the right method', async () => {
  const calls = capture()
  await api.patchOrg(3, { updated_at: 'x', status: 'contacted' })
  await api.createInteraction(3, { type: 'call', summary: 'Hi' })
  await api.deleteContact(9)
  expect(calls()).toEqual(['PATCH /api/orgs/3', 'POST /api/orgs/3/interactions', 'DELETE /api/contacts/9'])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/api/endpoints.test.ts`
Expected: FAIL, `Failed to resolve import "./endpoints"`.

- [ ] **Step 3: Write `web/src/api/endpoints.ts`**

```ts
import { request } from './client'
import type {
  ActivityItem, AttentionItem, Contact, ContactInput, ContactPatch, Interaction, InteractionInput,
  InteractionPatch, Kind, Meta, Org, OrgInput, OrgPatch, SearchHit, TimelineItem, Who,
} from './types'

export type OrgSort = 'updated' | 'name' | 'last_contact' | 'value'

export interface OrgFilters {
  kind?: Kind | ''
  status?: string
  owner?: string
  tag?: string
  q?: string
  sort?: OrgSort
}

function query(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const text = s.toString()
  return text ? `?${text}` : ''
}

const slug = (s: string) => encodeURIComponent(s)

export const api = {
  whoami: () => request<Who>('GET', '/api/whoami'),
  meta: () => request<Meta>('GET', '/api/meta'),
  search: (q: string) => request<SearchHit[]>('GET', `/api/search${query({ q })}`),
  attention: () => request<AttentionItem[]>('GET', '/api/attention'),
  activity: (limit = 30) => request<ActivityItem[]>('GET', `/api/activity?limit=${limit}`),

  orgs: (f: OrgFilters = {}) => request<Org[]>('GET', `/api/orgs${query({ ...f })}`),
  org: (id: number) => request<Org>('GET', `/api/orgs/${id}`),
  orgBySlug: (s: string) => request<Org>('GET', `/api/orgs/by-slug/${slug(s)}`),
  createOrg: (body: OrgInput) => request<Org>('POST', '/api/orgs', body),
  patchOrg: (id: number, body: OrgPatch) => request<Org>('PATCH', `/api/orgs/${id}`, body),
  deleteOrg: (id: number) => request<void>('DELETE', `/api/orgs/${id}`),

  contacts: (orgId: number) => request<Contact[]>('GET', `/api/orgs/${orgId}/contacts`),
  contact: (id: number) => request<Contact>('GET', `/api/contacts/${id}`),
  createContact: (orgId: number, body: ContactInput) => request<Contact>('POST', `/api/orgs/${orgId}/contacts`, body),
  patchContact: (id: number, body: ContactPatch) => request<Contact>('PATCH', `/api/contacts/${id}`, body),
  deleteContact: (id: number) => request<void>('DELETE', `/api/contacts/${id}`),

  timeline: (orgId: number) => request<TimelineItem[]>('GET', `/api/orgs/${orgId}/timeline`),
  contactInteractions: (contactId: number) => request<Interaction[]>('GET', `/api/contacts/${contactId}/interactions`),
  createInteraction: (orgId: number, body: InteractionInput) =>
    request<Interaction>('POST', `/api/orgs/${orgId}/interactions`, body),
  patchInteraction: (id: number, body: InteractionPatch) => request<Interaction>('PATCH', `/api/interactions/${id}`, body),
  deleteInteraction: (id: number) => request<void>('DELETE', `/api/interactions/${id}`),
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/api && npm run check`
Expected: 8 passed, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/endpoints.ts web/src/api/endpoints.test.ts
git commit -m "Web: a typed function for each API route"
```

---

### Task 5: Formatting and form helpers

**Files:**
- Create: `web/src/lib/format.ts`, `web/src/lib/forms.ts`
- Test: `web/src/lib/format.test.ts`, `web/src/lib/forms.test.ts`

- [ ] **Step 1: Write the failing tests**

`web/src/lib/format.test.ts`. Dates are built with local-time constructors so the tests pass in any time zone:

```ts
import { describe, expect, test } from 'vitest'
import {
  ago, day, fromLocalInput, isOverdue, label, money, person, REASON_TEXT, statusLine, statusTone,
  toLocalInput, todayIso, webHref,
} from './format'

describe('format', () => {
  test('label turns a code into words', () => {
    expect(label('in_conversation')).toBe('In conversation')
    expect(label('call')).toBe('Call')
  })

  test('every status has a tone, and an unknown one is neutral', () => {
    expect(statusTone('won')).toBe('success')
    expect(statusTone('lost')).toBe('error')
    expect(statusTone('what')).toBe('neutral')
  })

  test('day shows a plain date and a time the same way', () => {
    expect(day('2026-11-12')).toBe('12 Nov 2026')
    expect(day(new Date(2026, 10, 12, 9, 0).toISOString())).toBe('12 Nov 2026')
    expect(day(null)).toBe('')
  })

  test('ago counts calendar days', () => {
    const now = new Date(2026, 10, 12, 15, 0)
    expect(ago(new Date(2026, 10, 12, 1, 0).toISOString(), now)).toBe('today')
    expect(ago(new Date(2026, 10, 11, 23, 0).toISOString(), now)).toBe('yesterday')
    expect(ago(new Date(2026, 10, 9, 10, 0).toISOString(), now)).toBe('3 days ago')
    expect(ago(new Date(2026, 8, 1, 10, 0).toISOString(), now)).toBe('1 Sept 2026')
    expect(ago(null, now)).toBe('never')
  })

  test('a due date is overdue only after its day', () => {
    const now = new Date(2026, 10, 12, 9, 0)
    expect(todayIso(now)).toBe('2026-11-12')
    expect(isOverdue('2026-11-11', now)).toBe(true)
    expect(isOverdue('2026-11-12', now)).toBe(false)
    expect(isOverdue(null, now)).toBe(false)
  })

  test('money is whole pounds', () => {
    expect(money(12000)).toBe('£12,000')
    expect(money(null)).toBe('')
  })

  test('datetime-local values go both ways in the browser zone', () => {
    const at = new Date(2026, 10, 12, 9, 5)
    expect(toLocalInput(at.toISOString())).toBe('2026-11-12T09:05')
    expect(fromLocalInput('2026-11-12T09:05')).toBe(at.toISOString())
  })

  test('people, links and status lines', () => {
    expect(person('ana@example.com')).toBe('ana')
    expect(person(null)).toBe('No owner')
    expect(webHref('acme.example.com')).toBe('https://acme.example.com')
    expect(webHref('http://acme.example.com')).toBe('http://acme.example.com')
    expect(statusLine(null, 'lead')).toBe('Added as Lead')
    expect(statusLine('lead', 'contacted')).toBe('Moved from Lead to Contacted')
    expect(REASON_TEXT.quiet).toBe('No contact in 14 days')
  })
})
```

The September check uses `'1 Sept 2026'`, which is what `en-GB` prints in current Node and browsers. If your Node prints `'1 Sep 2026'`, the formatter is right and the expectation should follow it: run `node -e "console.log(new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date(2026,8,1)))"` to see.

`web/src/lib/forms.test.ts`:

```ts
import { expect, test } from 'vitest'
import { ApiError } from '../api/client'
import { changed, orNull, saveErrorText, text } from './forms'

test('orNull trims, and empty means null', () => {
  expect(orNull('  hi ')).toBe('hi')
  expect(orNull('   ')).toBeNull()
  expect(text(null)).toBe('')
})

test('changed keeps only the fields that differ, lists compared by value', () => {
  const before = { name: 'Acme', tags: ['a'], sector: null as string | null }
  expect(changed(before, { name: 'Acme', tags: ['a'], sector: 'Retail' })).toEqual({ sector: 'Retail' })
  expect(changed(before, { name: 'Acme', tags: ['a', 'b'], sector: null })).toEqual({ tags: ['a', 'b'] })
})

test('a 409 gets its own sentence; other errors say what the API said', () => {
  expect(saveErrorText(new ApiError(409, 'Changed since you loaded it'))).toMatch(/^Someone changed this/)
  expect(saveErrorText(new ApiError(422, 'name: Field required'))).toBe('name: Field required')
  expect(saveErrorText('?')).toBe('Something went wrong. Try again.')
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib`
Expected: FAIL, `Failed to resolve import "./format"` and `"./forms"`.

- [ ] **Step 3: Write `web/src/lib/format.ts`**

```ts
import type { TagTone } from '@tiagopedras/tenon'
import type { Reason } from '../api/types'

/** `in_conversation` → `In conversation`. */
export function label(code: string): string {
  const s = code.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const TONES: Record<string, TagTone> = {
  lead: 'neutral',
  contacted: 'info',
  in_conversation: 'accent',
  proposal_sent: 'running',
  won: 'success',
  lost: 'error',
  parked: 'warning',
  active: 'success',
  paused: 'warning',
  past: 'neutral',
}

export function statusTone(status: string): TagTone {
  return TONES[status] ?? 'neutral'
}

export const REASON_TEXT: Record<Reason, string> = {
  overdue: 'Next step overdue',
  quiet: 'No contact in 14 days',
  stuck: 'Same stage for 30 days',
}

export function statusLine(from: string | null, to: string): string {
  return from ? `Moved from ${label(from)} to ${label(to)}` : `Added as ${label(to)}`
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** A plain YYYY-MM-DD is a day in the browser's zone, not midnight UTC. */
function parse(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function day(value: string | null | undefined): string {
  return value ? DAY.format(parse(value)) : ''
}

export function todayIso(now: Date = new Date()): string {
  return isoDay(now)
}

export function ago(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const days = Math.round((startOfDay(now) - startOfDay(parse(iso))) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return day(iso)
}

export function isOverdue(due: string | null | undefined, now: Date = new Date()): boolean {
  return !!due && due < todayIso(now)
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })

export function money(n: number | null | undefined): string {
  return n == null ? '' : GBP.format(n)
}

/** The value for an <input type="datetime-local">, in the browser's zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value back to UTC ISO, which the API accepts. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** The name part of an email, which is how people are shown in v1. */
export function person(email: string | null | undefined): string {
  return email ? email.split('@')[0] : 'No owner'
}

/** A website as typed ("acme.com") made into a link. */
export function webHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
```

- [ ] **Step 4: Write `web/src/lib/forms.ts`**

```ts
import { ApiError } from '../api/client'

/** A form's text, trimmed. An empty field is null, so clearing it clears the stored value. */
export const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

/** A stored value as form text. */
export const text = (v: string | null | undefined): string => v ?? ''

/** The fields of `after` whose value differs from `before`'s. A PATCH sends only these. */
export function changed<F extends object>(before: F, after: F): Partial<F> {
  const out: Partial<F> = {}
  for (const k of Object.keys(after) as (keyof F)[]) {
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) out[k] = after[k]
  }
  return out
}

export function saveErrorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'Someone changed this while you had it open. It now shows their version: make your change again.'
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Try again.'
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib && npm run check`
Expected: 11 passed, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib
git commit -m "Web: formatting and form helpers"
```

---

### Task 6: `useApi` and `useIsPhone`

**Files:**
- Create: `web/src/lib/useApi.ts`, `web/src/lib/useIsPhone.ts`
- Test: `web/src/lib/useApi.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/lib/useApi.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useApi } from './useApi'

function Probe({ load, dep }: { load: () => Promise<string>; dep: number }) {
  const r = useApi(load, [dep])
  if (r.error) return <p>error {r.error.message}</p>
  return <p>{r.data ?? 'nothing'}{r.loading ? ' (loading)' : ''}</p>
}

test('loads, and loads again when a dep changes', async () => {
  let n = 0
  const load = () => Promise.resolve(`v${++n}`)
  const { rerender } = render(<Probe load={load} dep={1} />)
  expect(await screen.findByText('v1')).toBeInTheDocument()
  rerender(<Probe load={load} dep={2} />)
  expect(await screen.findByText('v2')).toBeInTheDocument()
})

test('keeps the old data on screen while it reloads', async () => {
  let release!: (v: string) => void
  const slow = () => new Promise<string>((r) => { release = r })
  const { rerender } = render(<Probe load={() => Promise.resolve('old')} dep={1} />)
  expect(await screen.findByText('old')).toBeInTheDocument()
  rerender(<Probe load={slow} dep={2} />)
  expect(screen.getByText('old (loading)')).toBeInTheDocument()
  await act(async () => release('new'))
  expect(screen.getByText('new')).toBeInTheDocument()
})

test('a slow first answer never overwrites a newer one', async () => {
  let releaseFirst!: (v: string) => void
  const first = () => new Promise<string>((r) => { releaseFirst = r })
  const { rerender } = render(<Probe load={first} dep={1} />)
  rerender(<Probe load={() => Promise.resolve('second')} dep={2} />)
  expect(await screen.findByText('second')).toBeInTheDocument()
  await act(async () => releaseFirst('first'))
  expect(screen.getByText('second')).toBeInTheDocument()
})

test('an error is kept for the caller to show', async () => {
  render(<Probe load={() => Promise.reject(new Error('down'))} dep={1} />)
  expect(await screen.findByText('error down')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/useApi.test.tsx`
Expected: FAIL, `Failed to resolve import "./useApi"`.

- [ ] **Step 3: Write `web/src/lib/useApi.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Loaded<T> {
  data: T | undefined
  error: Error | undefined
  /** True while a load is in flight. `data` keeps the last answer meanwhile. */
  loading: boolean
  reload: () => void
  /** Put a saved record in place without a round trip. */
  setData: (data: T) => void
}

/** Runs `load` when the component mounts and again whenever `deps` change.
 * Only the newest call's answer is kept, so a slow old answer cannot
 * overwrite a newer one. */
export function useApi<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    const call = ++latest.current
    setLoading(true)
    load().then(
      (d) => {
        if (call !== latest.current) return
        setData(d)
        setError(undefined)
        setLoading(false)
      },
      (e: unknown) => {
        if (call !== latest.current) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      },
    )
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}
```

- [ ] **Step 4: Write `web/src/lib/useIsPhone.ts`**

```ts
import { useEffect, useState } from 'react'

/** The app's one breakpoint. Below 768px is the phone layout. */
const QUERY = '(max-width: 767px)'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia(QUERY)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib && npm run check`
Expected: 15 passed, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/useApi.ts web/src/lib/useApi.test.tsx web/src/lib/useIsPhone.ts
git commit -m "Web: useApi loading hook and the phone breakpoint"
```

---

### Task 7: Session, shared pieces and test helpers

**Files:**
- Create: `web/src/app/session.tsx`, `web/src/components/Loading.tsx`, `web/src/components/StatusTag.tsx`, `web/src/components/StatusPicker.tsx`, `web/src/components/ConfirmDelete.tsx`
- Create: `web/src/test/render.tsx`, `web/src/test/fixtures.ts`
- Test: `web/src/components/StatusPicker.test.tsx`

- [ ] **Step 1: Write the test helpers**

`web/src/test/fixtures.ts`:

```ts
import type { ActivityItem, Contact, Interaction, Org } from '../api/types'

export const AT = '2026-11-10T12:00:00.000000+00:00'

export function org(o: Partial<Org> = {}): Org {
  return {
    id: 1, slug: 'acme', name: 'Acme', kind: 'lead', status: 'lead', website: null, sector: null,
    size: null, location: null, owner_email: 'ana@example.com', source: null, value_estimate: null,
    tags: [], summary: null, next_step: null, next_step_due: null, last_contact: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

export function contact(o: Partial<Contact> = {}): Contact {
  return {
    id: 5, org_id: 1, org_name: 'Acme', org_slug: 'acme', name: 'Bo', role: null, email: null,
    phone: null, linkedin_url: null, notes: null, is_primary: false, relationship: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

export function interaction(o: Partial<Interaction> = {}): Interaction {
  return {
    id: 7, org_id: 1, type: 'call', happened_at: AT, summary: 'Talked budgets', next_step: null,
    next_step_due: null, contact_ids: [], author_email: 'ana@example.com',
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

export function activity(o: Partial<ActivityItem> = {}): ActivityItem {
  return {
    kind: 'status', id: 1, org_id: 2, org_name: 'Bolt', org_slug: 'bolt', at: AT, type: null,
    summary: null, from_status: 'lead', to_status: 'contacted', by_email: 'ana@example.com', ...o,
  }
}
```

`web/src/test/render.tsx`:

```tsx
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { SessionContext, type Session } from '../app/session'

export const SESSION: Session = {
  meta: {
    kinds: ['lead', 'client'],
    lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent', 'won', 'lost', 'parked'],
    open_lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent'],
    client_statuses: ['active', 'paused', 'past'],
    interaction_types: ['call', 'email', 'meeting', 'note'],
    relationships: ['cold', 'warm', 'strong'],
  },
  me: { email: 'ana@example.com', name: 'Ana', teams: ['offdesk'] },
}

/** Render inside the session and a router at `path`. */
export function renderApp(ui: ReactElement, path = '/') {
  return render(
    <SessionContext.Provider value={SESSION}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </SessionContext.Provider>,
  )
}

export interface Call {
  key: string
  body: unknown
}

/** Stub fetch with one handler per "METHOD /path?query". A handler returns
 * the JSON body, a Response, or undefined for 204. An unstubbed call is a 500,
 * which the test will show as an error on screen. */
export function stubFetch(routes: Record<string, (body: unknown) => unknown>): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ key, body })
      const handler = routes[key]
      if (!handler) return new Response(JSON.stringify({ detail: `No stub for ${key}` }), { status: 500 })
      const out = handler(body)
      if (out instanceof Response) return out
      if (out === undefined) return new Response(null, { status: 204 })
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  return calls
}
```

- [ ] **Step 2: Write `web/src/app/session.tsx`**

```tsx
import { Alert } from '@tiagopedras/tenon'
import { createContext, useContext, type ReactNode } from 'react'
import { api } from '../api/endpoints'
import type { Meta, Who } from '../api/types'
import { Loading } from '../components/Loading'
import { useApi } from '../lib/useApi'

/** What every page needs: the vocabularies from /api/meta and who is signed in. */
export interface Session {
  meta: Meta
  me: Who
}

export const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const s = useApi(() => Promise.all([api.meta(), api.whoami()]).then(([meta, me]) => ({ meta, me })), [])
  if (s.error) return <Alert tone="error" title="Ledger did not load">{s.error.message}</Alert>
  if (!s.data) return <Loading />
  return <SessionContext.Provider value={s.data}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession is used outside SessionProvider')
  return s
}
```

- [ ] **Step 3: Write the shared components**

`web/src/components/Loading.tsx`:

```tsx
import { Spinner } from '@tiagopedras/tenon'

/* The ring, not the default orb: the orb draws on a canvas, which jsdom lacks. */
export function Loading() {
  return (
    <div className="lg-loading">
      <Spinner variant="ring" label="Loading" />
    </div>
  )
}
```

`web/src/components/StatusTag.tsx`:

```tsx
import { Tag } from '@tiagopedras/tenon'
import { label, statusTone } from '../lib/format'

export function StatusTag({ status }: { status: string }) {
  return <Tag tone={statusTone(status)}>{label(status)}</Tag>
}
```

`web/src/components/ConfirmDelete.tsx`:

```tsx
import { Button } from '@tiagopedras/tenon'
import { useState } from 'react'

/** Two clicks to delete: the first asks, the second deletes. No browser dialog. */
export function ConfirmDelete({ what, onConfirm }: { what: string; onConfirm: () => void }) {
  const [asked, setAsked] = useState(false)
  return asked ? (
    <Button variant="destructive" onClick={onConfirm}>Delete this {what}</Button>
  ) : (
    <Button variant="danger" onClick={() => setAsked(true)}>Delete</Button>
  )
}
```

- [ ] **Step 4: Write the failing StatusPicker test**

`web/src/components/StatusPicker.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { StatusPicker } from './StatusPicker'

test('a lead picks from lead statuses and reports the choice', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  renderApp(<StatusPicker org={org()} aria="Status" onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(7)
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  expect(onChange).toHaveBeenCalledWith('contacted')
})

test('a client picks from client statuses', async () => {
  const user = userEvent.setup()
  renderApp(<StatusPicker org={org({ kind: 'client', status: 'active' })} aria="Status" onChange={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Active', 'Paused', 'Past'])
})
```

- [ ] **Step 5: Run it to see it fail**

Run: `npx vitest run src/components`
Expected: FAIL, `Failed to resolve import "./StatusPicker"`.

- [ ] **Step 6: Write `web/src/components/StatusPicker.tsx`**

```tsx
import { Dropdown } from '@tiagopedras/tenon'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'

/** A status dropdown for one organisation. A lead offers lead statuses
 * (picking Won makes it a client), a client offers client statuses. */
export function StatusPicker({ org, aria, onChange }: { org: Org; aria: string; onChange: (status: string) => void }) {
  const { meta } = useSession()
  const list = org.kind === 'lead' ? meta.lead_statuses : meta.client_statuses
  return (
    <Dropdown
      aria-label={aria}
      value={org.status}
      onChange={onChange}
      options={list.map((s) => ({ value: s, label: label(s) }))}
    />
  )
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (25 tests), no type errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/app/session.tsx web/src/components web/src/test
git commit -m "Web: session context, status tag and picker, test helpers"
```

---

### Task 8: Layout, routes and the search box

**Files:**
- Create: `web/src/app/Layout.tsx`, `web/src/app/SearchBox.tsx`
- Modify: `web/src/app/App.tsx` (replace)
- Test: `web/src/app/Layout.test.tsx`

The pages don't exist yet, so `App.tsx` imports them in the tasks that create them. This task routes to a placeholder for each.

- [ ] **Step 1: Write the failing test**

`web/src/app/Layout.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { renderApp } from '../test/render'
import { Layout } from './Layout'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

function app(path = '/') {
  return renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<Where />} />
      </Route>
    </Routes>,
    path,
  )
}

test('the top bar shows the nav and who is signed in', () => {
  app()
  expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('href', '/pipeline')
  expect(screen.getByText('Ana')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
})

test('slash focuses search, and typing opens the results page', async () => {
  const user = userEvent.setup()
  app()
  await user.keyboard('/')
  const box = screen.getByRole('searchbox', { name: 'Search' })
  expect(box).toHaveFocus()
  await user.keyboard('acme')
  expect(box).toHaveValue('acme')
  expect(await screen.findByText('at /search?q=acme')).toBeInTheDocument()
})

test('slash inside a field types a slash', async () => {
  const user = userEvent.setup()
  app()
  const box = screen.getByRole('searchbox', { name: 'Search' })
  await user.click(box)
  await user.keyboard('a/b')
  expect(box).toHaveValue('a/b')
})

test('the box shows the query when the page opens on search', () => {
  app('/search?q=bolt')
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('bolt')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app`
Expected: FAIL, `Failed to resolve import "./Layout"`.

- [ ] **Step 3: Write `web/src/app/SearchBox.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** The global search. `/` anywhere outside a field focuses it; typing opens
 * /search?q=… after a short pause; Escape leaves it. */
export function SearchBox() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const onSearch = pathname === '/search'
  const [text, setText] = useState(onSearch ? params.get('q') ?? '' : '')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!onSearch) setText('')
  }, [onSearch])

  useEffect(() => {
    const q = text.trim()
    if (!q || (onSearch && q === (params.get('q') ?? ''))) return
    const t = setTimeout(() => navigate(`/search?q=${encodeURIComponent(q)}`, { replace: onSearch }), 200)
    return () => clearTimeout(t)
  }, [text])

  return (
    <input
      ref={input}
      className="lg-search"
      type="search"
      aria-label="Search"
      placeholder="Search   /"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') input.current?.blur()
      }}
    />
  )
}
```

- [ ] **Step 4: Write `web/src/app/Layout.tsx`**

`OrgForm` arrives in Task 11; until then the New button is left out, and Task 11 adds it.

```tsx
import { Button } from '@tiagopedras/tenon'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useIsPhone } from '../lib/useIsPhone'
import { SearchBox } from './SearchBox'
import { useSession } from './session'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/pipeline', label: 'Pipeline', end: false },
  { to: '/list', label: 'List', end: false },
]

function Nav({ className }: { className: string }) {
  return (
    <nav className={className}>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
      ))}
    </nav>
  )
}

export function Layout() {
  const { me } = useSession()
  const phone = useIsPhone()
  return (
    <div className="lg-app">
      <header className="lg-top">
        <Link to="/" className="lg-brand">Ledger</Link>
        {!phone && <Nav className="lg-nav" />}
        <SearchBox />
        {!phone && <span className="lg-me">{me.name}</span>}
        {/* nginx answers /auth/logout and ends the Offdesk sign-in. */}
        <form method="post" action="/auth/logout">
          <Button size="sm" variant="ghost" type="submit">Sign out</Button>
        </form>
      </header>
      <main className="lg-main">
        <Outlet />
      </main>
      {phone && <Nav className="lg-tabs" />}
    </div>
  )
}
```

- [ ] **Step 5: Replace `web/src/app/App.tsx`**

```tsx
import { Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { SessionProvider } from './session'

function NotFound() {
  return <p className="lg-faint">There is nothing at this address.</p>
}

function Soon({ name }: { name: string }) {
  return <p className="lg-faint">{name}</p>
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Soon name="Home" />} />
          <Route path="pipeline" element={<Soon name="Pipeline" />} />
          <Route path="list" element={<Soon name="List" />} />
          <Route path="search" element={<Soon name="Search" />} />
          <Route path="o/:slug" element={<Soon name="Organisation" />} />
          <Route path="c/:id" element={<Soon name="Contact" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
```

Each later page task replaces one `<Soon … />` with its page and adds the import. The last one deletes `Soon`.

- [ ] **Step 6: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (29 tests), no type errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/app
git commit -m "Web: layout, routes and the slash search box"
```

---

### Task 9: Search page

**Files:**
- Create: `web/src/pages/SearchPage.tsx`
- Modify: `web/src/app/App.tsx` (the `search` route)
- Test: `web/src/pages/SearchPage.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/pages/SearchPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { SearchHit } from '../api/types'
import { renderApp, stubFetch } from '../test/render'
import { hitLink, SearchPage, Snippet } from './SearchPage'

const hit = (o: Partial<SearchHit>): SearchHit => ({
  kind: 'org', id: 1, org_id: 1, org_name: 'Acme', org_slug: 'acme', title: 'Acme', snippet: '[Acme] studio', ...o,
})

test('each kind of hit links to its page', () => {
  expect(hitLink(hit({}))).toBe('/o/acme')
  expect(hitLink(hit({ kind: 'contact', id: 5 }))).toBe('/c/5')
  expect(hitLink(hit({ kind: 'interaction', id: 7 }))).toBe('/o/acme#i-7')
})

test('the snippet marks the matched words', () => {
  render(<Snippet text="Met [Acme] about [rebrand]" />)
  expect(screen.getByText('Acme').tagName).toBe('MARK')
  expect(screen.getByText('rebrand').tagName).toBe('MARK')
})

test('results are grouped, and empty groups are left out', async () => {
  stubFetch({
    'GET /api/search?q=acme': () => [
      hit({}),
      hit({ kind: 'contact', id: 5, title: 'Bo Ray', snippet: 'Bo at [Acme]' }),
    ],
  })
  renderApp(<SearchPage />, '/search?q=acme')
  expect(await screen.findByRole('heading', { name: 'Organisations' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Contacts' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Interactions' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bo Ray' })).toHaveAttribute('href', '/c/5')
})

test('no hits says so', async () => {
  stubFetch({ 'GET /api/search?q=zzz': () => [] })
  renderApp(<SearchPage />, '/search?q=zzz')
  expect(await screen.findByText('No matches for “zzz”.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/SearchPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./SearchPage"`.

- [ ] **Step 3: Write `web/src/pages/SearchPage.tsx`**

```tsx
import { Alert } from '@tiagopedras/tenon'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { SearchHit } from '../api/types'
import { Loading } from '../components/Loading'
import { useApi } from '../lib/useApi'

const GROUPS: { kind: SearchHit['kind']; title: string }[] = [
  { kind: 'org', title: 'Organisations' },
  { kind: 'contact', title: 'Contacts' },
  { kind: 'interaction', title: 'Interactions' },
]

export function hitLink(h: SearchHit): string {
  if (h.kind === 'contact') return `/c/${h.id}`
  if (h.kind === 'interaction') return `/o/${h.org_slug}#i-${h.id}`
  return `/o/${h.org_slug}`
}

/** The API marks matches as [word]. */
export function Snippet({ text }: { text: string }) {
  return (
    <span className="lg-faint">
      {text.split(/(\[[^\]]*\])/).map((part, i) =>
        part.startsWith('[') && part.endsWith(']') ? <mark key={i}>{part.slice(1, -1)}</mark> : part,
      )}
    </span>
  )
}

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const hits = useApi(() => (q ? api.search(q) : Promise.resolve([] as SearchHit[])), [q])

  if (!q) return <p className="lg-faint">Type in the search box to find organisations, people and notes.</p>
  if (hits.error) return <Alert tone="error">{hits.error.message}</Alert>
  if (!hits.data) return <Loading />
  if (hits.data.length === 0) return <p className="lg-faint">No matches for “{q}”.</p>

  return (
    <div className="lg-page">
      {GROUPS.map((g) => {
        const list = hits.data!.filter((h) => h.kind === g.kind)
        if (list.length === 0) return null
        return (
          <section key={g.kind} className="lg-section">
            <h2 className="tenon-heading-3">{g.title}</h2>
            <ul className="lg-hits">
              {list.map((h) => (
                <li key={`${h.kind}${h.id}`}>
                  <Link to={hitLink(h)}>{h.title}</Link>
                  {h.kind !== 'org' && <span className="lg-faint"> · {h.org_name}</span>}
                  <div><Snippet text={h.snippet} /></div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Route it**

In `web/src/app/App.tsx`, add `import { SearchPage } from '../pages/SearchPage'` and replace the search route with:

```tsx
          <Route path="search" element={<SearchPage />} />
```

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (33 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/SearchPage.tsx web/src/pages/SearchPage.test.tsx web/src/app/App.tsx
git commit -m "Web: search results grouped by kind"
```

---

### Task 10: Organisation card and Home

**Files:**
- Create: `web/src/components/OrgCard.tsx`, `web/src/pages/HomePage.tsx`
- Modify: `web/src/app/App.tsx` (the index route)
- Test: `web/src/pages/HomePage.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/pages/HomePage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { activity, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { HomePage } from './HomePage'

test('shows what needs attention, with its reasons, and recent activity', async () => {
  stubFetch({
    'GET /api/attention': () => [
      { org: org({ next_step: 'Send the deck', next_step_due: '2000-01-01' }), reasons: ['overdue', 'quiet'] },
    ],
    'GET /api/activity?limit=30': () => [
      activity(),
      activity({ kind: 'interaction', id: 2, type: 'call', summary: 'Rang about rates', from_status: null, to_status: null }),
    ],
  })
  renderApp(<HomePage />)
  expect(await screen.findByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Next step overdue')).toBeInTheDocument()
  expect(screen.getByText('No contact in 14 days')).toBeInTheDocument()
  expect(screen.getByText(/Send the deck/)).toHaveClass('lg-overdue')
  expect(await screen.findByText('Moved from Lead to Contacted')).toBeInTheDocument()
  expect(screen.getByText('Call: Rang about rates')).toBeInTheDocument()
})

test('says so when nothing needs attention', async () => {
  stubFetch({ 'GET /api/attention': () => [], 'GET /api/activity?limit=30': () => [] })
  renderApp(<HomePage />)
  expect(await screen.findByText('Nothing needs you today.')).toBeInTheDocument()
  expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/HomePage.test.tsx`
Expected: FAIL, `Failed to resolve import "./HomePage"`.

- [ ] **Step 3: Write `web/src/components/OrgCard.tsx`**

```tsx
import { Card, type CardProps } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import type { Org } from '../api/types'
import { ago, day, isOverdue, person } from '../lib/format'
import { StatusTag } from './StatusTag'

export function NextStep({ org }: { org: Pick<Org, 'next_step' | 'next_step_due'> }) {
  if (!org.next_step) return null
  return (
    <span className={isOverdue(org.next_step_due) ? 'lg-overdue' : undefined}>
      {org.next_step}
      {org.next_step_due && ` · ${day(org.next_step_due)}`}
    </span>
  )
}

/** One organisation as a Tenon card: name, status, owner, last contact and
 * next step. Any other Card prop (drag handlers, footer, action) passes through. */
export function OrgCard({ org, ...rest }: { org: Org } & Omit<CardProps, 'title'>) {
  return (
    <Card
      title={<Link to={`/o/${org.slug}`}>{org.name}</Link>}
      tags={<StatusTag status={org.status} />}
      meta={`${person(org.owner_email)} · last contact ${ago(org.last_contact)}`}
      summary={org.next_step ? <NextStep org={org} /> : undefined}
      {...rest}
    />
  )
}
```

- [ ] **Step 4: Write `web/src/pages/HomePage.tsx`**

```tsx
import { Alert, Column, ColumnEmpty, Tag } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { ActivityItem } from '../api/types'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { ago, label, person, REASON_TEXT, statusLine } from '../lib/format'
import { useApi } from '../lib/useApi'

function what(a: ActivityItem): string {
  if (a.kind === 'status') return statusLine(a.from_status, a.to_status ?? '')
  return `${label(a.type ?? '')}: ${a.summary ?? ''}`
}

export function HomePage() {
  const attention = useApi(api.attention, [])
  const activity = useApi(() => api.activity(30), [])
  return (
    <div className="lg-home">
      <Column title="Needs attention" count={attention.data?.length}>
        {attention.error ? (
          <Alert tone="error">{attention.error.message}</Alert>
        ) : !attention.data ? (
          <Loading />
        ) : attention.data.length === 0 ? (
          <ColumnEmpty>Nothing needs you today.</ColumnEmpty>
        ) : (
          attention.data.map((a) => (
            <OrgCard
              key={a.org.id}
              org={a.org}
              footer={a.reasons.map((r) => (
                <Tag key={r} tone={r === 'overdue' ? 'urgent' : 'soon'}>{REASON_TEXT[r]}</Tag>
              ))}
            />
          ))
        )}
      </Column>
      <Column title="Recent activity">
        {activity.error ? (
          <Alert tone="error">{activity.error.message}</Alert>
        ) : !activity.data ? (
          <Loading />
        ) : activity.data.length === 0 ? (
          <ColumnEmpty>Nothing has happened yet.</ColumnEmpty>
        ) : (
          <ul className="lg-activity">
            {activity.data.map((a) => (
              <li key={`${a.kind}${a.id}`}>
                <span><Link to={`/o/${a.org_slug}`}>{a.org_name}</Link></span>
                <span>{what(a)}</span>
                <span className="lg-faint">{person(a.by_email)} · {ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Column>
    </div>
  )
}
```

- [ ] **Step 5: Route it**

In `web/src/app/App.tsx`, add `import { HomePage } from '../pages/HomePage'` and replace the index route with:

```tsx
          <Route index element={<HomePage />} />
```

- [ ] **Step 6: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (35 tests), no type errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/OrgCard.tsx web/src/pages/HomePage.tsx web/src/pages/HomePage.test.tsx web/src/app/App.tsx
git commit -m "Web: Home with needs-attention and recent activity"
```

---

### Task 11: Organisation form (create and edit)

**Files:**
- Create: `web/src/components/OrgForm.tsx`
- Modify: `web/src/app/Layout.tsx` (the New button)
- Test: `web/src/components/OrgForm.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/components/OrgForm.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { OrgForm, orgBody, orgForm } from './OrgForm'

test('orgBody trims, splits tags and turns empty into null', () => {
  const f = { ...orgForm(undefined, SESSION.me), name: ' Acme ', tags: 'design, , retail', value: '1200', website: ' ' }
  expect(orgBody(f)).toMatchObject({
    name: 'Acme', tags: ['design', 'retail'], value_estimate: 1200, website: null, owner_email: 'ana@example.com',
  })
  expect(orgBody({ ...f, value: '' }).value_estimate).toBeNull()
})

test('a new organisation is posted as a lead owned by me', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs': (b) => org({ name: (b as { name: string }).name }) })
  const onSaved = vi.fn()
  renderApp(<OrgForm open onClose={() => {}} onSaved={onSaved} />)
  await user.type(screen.getByLabelText(/^Name/), 'Acme')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ name: 'Acme', kind: 'lead', owner_email: 'ana@example.com', tags: [] })
})

test('an edit sends only what changed, and a 409 loads their version', async () => {
  const user = userEvent.setup()
  const mine = org({ sector: 'Retail' })
  const theirs = org({ sector: 'Food', updated_at: '2026-11-11T09:00:00.000000+00:00' })
  const calls = stubFetch({
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Changed since you loaded it', current: theirs }), { status: 409 }),
  })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Location'), 'Leeds')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(calls[0].body).toEqual({ location: 'Leeds', updated_at: mine.updated_at })
  expect(screen.getByLabelText('Sector')).toHaveValue('Food')
})

test('delete takes two clicks', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'DELETE /api/orgs/1': () => undefined })
  const onDeleted = vi.fn()
  renderApp(<OrgForm open org={org()} onClose={() => {}} onSaved={() => {}} onDeleted={onDeleted} />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(calls).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Delete this organisation' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalled())
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/OrgForm.test.tsx`
Expected: FAIL, `Failed to resolve import "./OrgForm"`.

- [ ] **Step 3: Write `web/src/components/OrgForm.tsx`**

```tsx
import { Alert, Button, Field, Modal, SegmentedControl } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Kind, Org, OrgFields, Who } from '../api/types'
import { useSession } from '../app/session'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useIsPhone } from '../lib/useIsPhone'
import { ConfirmDelete } from './ConfirmDelete'

export interface OrgFormState {
  name: string
  kind: Kind
  owner_email: string
  website: string
  sector: string
  size: string
  location: string
  source: string
  value: string
  tags: string
  summary: string
  next_step: string
  next_step_due: string
}

/** The form's text for an organisation, or for a new one owned by `me`. */
export function orgForm(org: Org | undefined, me: Who): OrgFormState {
  return {
    name: text(org?.name),
    kind: org?.kind ?? 'lead',
    owner_email: org ? text(org.owner_email) : me.email,
    website: text(org?.website),
    sector: text(org?.sector),
    size: text(org?.size),
    location: text(org?.location),
    source: text(org?.source),
    value: org?.value_estimate == null ? '' : String(org.value_estimate),
    tags: (org?.tags ?? []).join(', '),
    summary: text(org?.summary),
    next_step: text(org?.next_step),
    next_step_due: text(org?.next_step_due),
  }
}

export function orgBody(f: OrgFormState): OrgFields {
  const value = f.value.trim() === '' ? null : Number(f.value)
  return {
    name: f.name.trim(),
    owner_email: orNull(f.owner_email),
    website: orNull(f.website),
    sector: orNull(f.sector),
    size: orNull(f.size),
    location: orNull(f.location),
    source: orNull(f.source),
    value_estimate: value !== null && Number.isFinite(value) ? value : null,
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    summary: orNull(f.summary),
    next_step: orNull(f.next_step),
    next_step_due: f.next_step_due || null,
  }
}

interface Props {
  open: boolean
  /** Left out for a new organisation. */
  org?: Org
  onClose: () => void
  onSaved: (org: Org) => void
  /** Given only where deleting makes sense; the Delete button shows only then. */
  onDeleted?: () => void
}

export function OrgForm({ open, org, onClose, onSaved, onDeleted }: Props) {
  const { me } = useSession()
  const phone = useIsPhone()
  const [base, setBase] = useState(org)
  const [form, setForm] = useState(() => orgForm(org, me))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBase(org)
    setForm(orgForm(org, me))
    setError(undefined)
  }, [open, org, me])

  const set = (k: keyof OrgFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const body = orgBody(form)
      const saved = base
        ? await api.patchOrg(base.id, { ...changed<OrgFields>(base, body), updated_at: base.updated_at })
        : await api.createOrg({ ...body, kind: form.kind })
      onSaved(saved)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Org
        setBase(current)
        setForm(orgForm(current, me))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base) return
    try {
      await api.deleteOrg(base.id)
      onDeleted?.()
    } catch (e) {
      setError(saveErrorText(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={base ? `Edit ${base.name}` : 'New organisation'}
      size="md"
      className={phone ? 'lg-sheet' : undefined}
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="organisation" onConfirm={() => void remove()} />}
          <span className="lg-grow" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="org-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="org-form" className="lg-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required value={form.name} onChange={set('name')} autoFocus />
        {!base && (
          <div className="lg-field">
            <span className="tenon-label">Kind</span>
            <SegmentedControl
              aria-label="Kind"
              value={form.kind}
              onChange={(kind) => setForm((f) => ({ ...f, kind }))}
              options={[{ value: 'lead', label: 'Lead' }, { value: 'client', label: 'Client' }]}
            />
          </div>
        )}
        <Field label="Owner email" type="email" value={form.owner_email} onChange={set('owner_email')} />
        <Field label="Website" value={form.website} onChange={set('website')} />
        <Field label="Sector" value={form.sector} onChange={set('sector')} />
        <Field label="Size" value={form.size} onChange={set('size')} />
        <Field label="Location" value={form.location} onChange={set('location')} />
        <Field label="Source" hint="How they came to us" value={form.source} onChange={set('source')} />
        <Field label="Value (£)" type="number" min={0} value={form.value} onChange={set('value')} />
        <Field label="Tags" hint="Separated by commas" value={form.tags} onChange={set('tags')} />
        <Field label="Summary" multiline rows={3} value={form.summary} onChange={set('summary')} />
        <Field label="Next step" value={form.next_step} onChange={set('next_step')} />
        <Field label="Next step due" type="date" value={form.next_step_due} onChange={set('next_step_due')} />
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Add the New button to the layout**

In `web/src/app/Layout.tsx`:

1. Imports: add `import { useState } from 'react'`, change the router import to `import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'`, and add `import { OrgForm } from '../components/OrgForm'`.
2. At the top of `Layout()`, add:

```tsx
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
```

3. In the header, between `<SearchBox />` and the `lg-me` span, add:

```tsx
        <Button size="sm" onClick={() => setCreating(true)}>New</Button>
```

4. After the phone `Nav`, before the closing `</div>`, add:

```tsx
      <OrgForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(o) => {
          setCreating(false)
          navigate(`/o/${o.slug}`)
        }}
      />
```

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (39 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/OrgForm.tsx web/src/components/OrgForm.test.tsx web/src/app/Layout.tsx
git commit -m "Web: organisation form for create and edit, with 409 handling"
```

---

### Task 12: List page

**Files:**
- Create: `web/src/pages/ListPage.tsx`
- Modify: `web/src/app/App.tsx` (the `list` route)
- Test: `web/src/pages/ListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/pages/ListPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { filterOrgs, ListPage, options } from './ListPage'

const lead = org({ id: 1, name: 'Acme', slug: 'acme', tags: ['design'] })
const client = org({ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'active', owner_email: 'bo@example.com' })

test('filterOrgs applies every filter that is set', () => {
  const all = { kind: '', status: '', owner: '', tag: '' }
  expect(filterOrgs([lead, client], all)).toEqual([lead, client])
  expect(filterOrgs([lead, client], { ...all, kind: 'client' })).toEqual([client])
  expect(filterOrgs([lead, client], { ...all, tag: 'design' })).toEqual([lead])
  expect(filterOrgs([lead, client], { ...all, owner: 'bo@example.com' })).toEqual([client])
})

test('options are unique and sorted, after an Any choice', () => {
  expect(options(['b', null, 'a', 'b'], 'Anyone')).toEqual([
    { value: '', label: 'Anyone' }, { value: 'a', label: 'a' }, { value: 'b', label: 'b' },
  ])
})

test('the URL holds the filters', async () => {
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=client')
  expect(await screen.findByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('changing the sort asks the API again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=updated': () => [lead, client],
    'GET /api/orgs?sort=name': () => [lead, client],
  })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toContain('GET /api/orgs?sort=name')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/ListPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./ListPage"`.

- [ ] **Step 3: Write `web/src/pages/ListPage.tsx`**

```tsx
import { Alert, Dropdown, SegmentedControl, type DropdownOption } from '@tiagopedras/tenon'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type OrgSort } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { NextStep, OrgCard } from '../components/OrgCard'
import { StatusTag } from '../components/StatusTag'
import { ago, label, money, person } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'

export interface ListFilters {
  kind: string
  status: string
  owner: string
  tag: string
}

export function filterOrgs(orgs: Org[], f: ListFilters): Org[] {
  return orgs.filter(
    (o) =>
      (!f.kind || o.kind === f.kind) &&
      (!f.status || o.status === f.status) &&
      (!f.owner || o.owner_email === f.owner) &&
      (!f.tag || o.tags.includes(f.tag)),
  )
}

export function options(values: (string | null)[], any: string, show: (v: string) => string = (v) => v): DropdownOption[] {
  const unique = Array.from(new Set(values.filter((v): v is string => !!v))).sort()
  return [{ value: '', label: any }, ...unique.map((v) => ({ value: v, label: show(v) }))]
}

const SORTS: DropdownOption<OrgSort>[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name' },
  { value: 'last_contact', label: 'Last contact' },
  { value: 'value', label: 'Value' },
]

export function ListPage() {
  const { meta } = useSession()
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const f: ListFilters = {
    kind: params.get('kind') ?? '',
    status: params.get('status') ?? '',
    owner: params.get('owner') ?? '',
    tag: params.get('tag') ?? '',
  }
  const raw = params.get('sort')
  const sort: OrgSort = SORTS.some((s) => s.value === raw) ? (raw as OrgSort) : 'updated'
  const orgs = useApi(() => api.orgs({ sort }), [sort])

  const put = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'kind') next.delete('status')
    setParams(next, { replace: true })
  }

  // `won` is never stored: a won lead is an active client.
  const leadStatuses = meta.lead_statuses.filter((s) => s !== 'won')
  const statuses = f.kind === 'client' ? meta.client_statuses : f.kind === 'lead' ? leadStatuses : [...leadStatuses, ...meta.client_statuses]
  const all = orgs.data ?? []
  const rows = filterOrgs(all, f)

  return (
    <div className="lg-page">
      <div className="lg-filters">
        <SegmentedControl
          aria-label="Kind"
          value={f.kind}
          onChange={(v) => put('kind', v)}
          options={[{ value: '', label: 'All' }, { value: 'lead', label: 'Leads' }, { value: 'client', label: 'Clients' }]}
        />
        <Dropdown aria-label="Status" value={f.status} onChange={(v) => put('status', v)}
          options={[{ value: '', label: 'Any status' }, ...statuses.map((s) => ({ value: s, label: label(s) }))]} />
        <Dropdown aria-label="Owner" value={f.owner} onChange={(v) => put('owner', v)}
          options={options(all.map((o) => o.owner_email), 'Anyone', person)} />
        <Dropdown aria-label="Tag" value={f.tag} onChange={(v) => put('tag', v)}
          options={options(all.flatMap((o) => o.tags), 'Any tag')} />
        <Dropdown aria-label="Sort" value={sort} onChange={(v) => put('sort', v === 'updated' ? '' : v)} options={SORTS} />
      </div>
      {orgs.error ? (
        <Alert tone="error">{orgs.error.message}</Alert>
      ) : !orgs.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="lg-faint">Nothing matches these filters.</p>
      ) : phone ? (
        <div className="lg-cards">{rows.map((o) => <OrgCard key={o.id} org={o} />)}</div>
      ) : (
        <table className="lg-table">
          <thead>
            <tr>
              <th>Name</th><th>Status</th><th>Owner</th><th>Last contact</th><th>Next step</th><th className="lg-num">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/o/${o.slug}`}>{o.name}</Link></td>
                <td><StatusTag status={o.status} /></td>
                <td>{person(o.owner_email)}</td>
                <td>{ago(o.last_contact)}</td>
                <td><NextStep org={o} /></td>
                <td className="lg-num">{money(o.value_estimate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Route it**

In `web/src/app/App.tsx`, add `import { ListPage } from '../pages/ListPage'` and replace the list route with:

```tsx
          <Route path="list" element={<ListPage />} />
```

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (43 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/ListPage.tsx web/src/pages/ListPage.test.tsx web/src/app/App.tsx
git commit -m "Web: list page with filters in the URL, table or cards"
```

---

### Task 13: Pipeline

**Files:**
- Create: `web/src/pages/PipelinePage.tsx`
- Modify: `web/src/app/App.tsx` (the `pipeline` route)
- Test: `web/src/pages/PipelinePage.test.tsx`

Desktop drags a card between columns with native HTML5 drag and drop: Tenon's `useReorder` reorders within one list and leaves moves between lists to the app. A phone shows one stage at a time, with a status picker on each card.

- [ ] **Step 1: Write the failing test**

`web/src/pages/PipelinePage.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { byStatus, PipelinePage } from './PipelinePage'

const a = org({ id: 1, name: 'Acme', slug: 'acme', status: 'lead' })
const b = org({ id: 2, name: 'Bolt', slug: 'bolt', status: 'contacted' })

test('byStatus gives every stage a list, even an empty one', () => {
  const g = byStatus([a, b], ['lead', 'contacted', 'won'])
  expect(g.lead).toEqual([a])
  expect(g.contacted).toEqual([b])
  expect(g.won).toEqual([])
})

test('desktop draws a column per lead status', async () => {
  stubFetch({ 'GET /api/orgs?kind=lead': () => [a, b] })
  renderApp(<PipelinePage />)
  const lead = await screen.findByTestId('stage-lead')
  expect(within(lead).getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(within(screen.getByTestId('stage-contacted')).getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  expect(within(screen.getByTestId('stage-won')).getByText('Drop a lead here when it is won.')).toBeInTheDocument()
})

test('on a phone, a card moves with its status picker, and Won says it became a client', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?kind=lead': () => [a, b],
    'PATCH /api/orgs/1': () => org({ ...a, kind: 'client', status: 'active' }),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: 'Status of Acme' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  expect(calls[1].body).toEqual({ updated_at: a.updated_at, status: 'won' })
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull())
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/PipelinePage.test.tsx`
Expected: FAIL, `Failed to resolve import "./PipelinePage"`.

- [ ] **Step 3: Write `web/src/pages/PipelinePage.tsx`**

```tsx
import { Alert, Column, ColumnEmpty, SegmentedControl } from '@tiagopedras/tenon'
import { useState } from 'react'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { StatusPicker } from '../components/StatusPicker'
import { label } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'

export function byStatus(orgs: Org[], statuses: string[]): Record<string, Org[]> {
  const out: Record<string, Org[]> = Object.fromEntries(statuses.map((s) => [s, [] as Org[]]))
  for (const o of orgs) (out[o.status] ??= []).push(o)
  return out
}

const EMPTY: Record<string, string> = { won: 'Drop a lead here when it is won.' }

export function PipelinePage() {
  const { meta } = useSession()
  const phone = useIsPhone()
  const orgs = useApi(() => api.orgs({ kind: 'lead' }), [])
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>()
  const [stage, setStage] = useState(meta.lead_statuses[0])
  const [dragId, setDragId] = useState<number>()
  const [over, setOver] = useState<string>()

  async function move(org: Org, status: string) {
    if (status === org.status) return
    setNotice(undefined)
    try {
      const saved = await api.patchOrg(org.id, { updated_at: org.updated_at, status })
      const rest = (orgs.data ?? []).filter((o) => o.id !== org.id)
      orgs.setData(saved.kind === 'lead' ? [...rest, saved] : rest)
      if (saved.kind === 'client') setNotice({ tone: 'success', text: `${saved.name} is now a client.` })
    } catch (e) {
      setNotice({ tone: 'error', text: saveErrorText(e) })
      orgs.reload()
    }
  }

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  const groups = byStatus(orgs.data, meta.lead_statuses)
  const note = notice && <Alert tone={notice.tone}>{notice.text}</Alert>

  if (phone) {
    return (
      <div className="lg-page">
        {note}
        <div className="lg-stages">
          <SegmentedControl
            aria-label="Stage"
            value={stage}
            onChange={setStage}
            options={meta.lead_statuses.map((s) => ({
              value: s,
              label: <>{label(s)} <span className="lg-count">{groups[s].length}</span></>,
            }))}
          />
        </div>
        <div className="lg-cards">
          {groups[stage].length === 0 && <ColumnEmpty>{EMPTY[stage] ?? 'None at this stage.'}</ColumnEmpty>}
          {groups[stage].map((o) => (
            <OrgCard key={o.id} org={o}
              action={<StatusPicker org={o} aria={`Status of ${o.name}`} onChange={(s) => void move(o, s)} />} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="lg-page">
      {note}
      <div className="lg-board">
        {meta.lead_statuses.map((s) => (
          <Column
            key={s}
            data-testid={`stage-${s}`}
            title={label(s)}
            count={groups[s].length}
            className={over === s ? 'lg-drop' : undefined}
            onDragOver={(e) => {
              if (dragId === undefined) return
              e.preventDefault()
              setOver(s)
            }}
            onDragLeave={() => setOver((o) => (o === s ? undefined : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(undefined)
              const org = orgs.data!.find((o) => o.id === dragId)
              setDragId(undefined)
              if (org) void move(org, s)
            }}
          >
            {groups[s].length === 0 && <ColumnEmpty>{EMPTY[s] ?? 'None'}</ColumnEmpty>}
            {groups[s].map((o) => (
              <OrgCard
                key={o.id}
                org={o}
                draggable
                dragging={dragId === o.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(o.id))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragId(o.id)
                }}
                onDragEnd={() => setDragId(undefined)}
              />
            ))}
          </Column>
        ))}
      </div>
    </div>
  )
}
```

`data-testid` passes through `Column`'s rest props onto its element. The Playwright test in Task 18 finds the drop targets the same way.

- [ ] **Step 4: Route it**

In `web/src/app/App.tsx`, add `import { PipelinePage } from '../pages/PipelinePage'` and replace the pipeline route with:

```tsx
          <Route path="pipeline" element={<PipelinePage />} />
```

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (46 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/PipelinePage.tsx web/src/pages/PipelinePage.test.tsx web/src/app/App.tsx
git commit -m "Web: pipeline, drag on desktop and a stage picker on a phone"
```

---

### Task 14: Organisation page (header, overview, status, edit)

**Files:**
- Create: `web/src/pages/OrgPage.tsx`
- Modify: `web/src/app/App.tsx` (the `o/:slug` route)
- Test: `web/src/pages/OrgPage.test.tsx`

People and Timeline come in Tasks 15 and 16. This task leaves a marked spot for each in the layout.

- [ ] **Step 1: Write the failing test**

`web/src/pages/OrgPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { contact, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { OrgPage } from './OrgPage'

const acme = org({ summary: 'Design studio in Leeds', sector: 'Design', value_estimate: 5000, tags: ['design'], website: 'acme.example.com' })

function page() {
  return renderApp(<Routes><Route path="/o/:slug" element={<OrgPage />} /></Routes>, '/o/acme')
}

function stubs(extra: Record<string, (b: unknown) => unknown> = {}) {
  return stubFetch({
    'GET /api/orgs/by-slug/acme': () => acme,
    'GET /api/orgs/1/contacts': () => [contact({ is_primary: true, phone: '+44 20 0000 0000', email: 'bo@example.com' })],
    'GET /api/orgs/1/timeline': () => [],
    ...extra,
  })
}

test('shows the header, quick actions and overview', async () => {
  stubs()
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'acme.example.com' })).toHaveAttribute('href', 'https://acme.example.com')
  expect(screen.getByText('Design studio in Leeds')).toBeInTheDocument()
  expect(screen.getByText('£5,000')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Call Bo' })).toHaveAttribute('href', 'tel:+44 20 0000 0000')
  expect(screen.getByRole('link', { name: 'Email Bo' })).toHaveAttribute('href', 'mailto:bo@example.com')
})

test('changing the status saves it and reloads the timeline', async () => {
  const user = userEvent.setup()
  const calls = stubs({ 'PATCH /api/orgs/1': () => org({ ...acme, status: 'contacted' }) })
  page()
  await user.click(await screen.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs/1/timeline')).toHaveLength(2))
  expect(calls.find((c) => c.key === 'PATCH /api/orgs/1')!.body).toEqual({ updated_at: acme.updated_at, status: 'contacted' })
  expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('Contacted')
})

test('an unknown slug says so', async () => {
  stubFetch({ 'GET /api/orgs/by-slug/acme': () => new Response(JSON.stringify({ detail: "No organisation 'acme'" }), { status: 404 }) })
  page()
  expect(await screen.findByText("No organisation 'acme'")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/OrgPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./OrgPage"`.

- [ ] **Step 3: Write `web/src/pages/OrgPage.tsx`**

```tsx
import { Alert, Button, LinkButton, Tag } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { Loading } from '../components/Loading'
import { NextStep } from '../components/OrgCard'
import { OrgForm } from '../components/OrgForm'
import { StatusPicker } from '../components/StatusPicker'
import { label, money, person, webHref } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'

export function OrgPage() {
  const { slug = '' } = useParams()
  const org = useApi(() => api.orgBySlug(slug), [slug])
  if (org.error) return <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
  if (!org.data) return <Loading />
  return <OrgView key={org.data.id} org={org.data} setOrg={org.setData} reloadOrg={org.reload} />
}

function facts(org: Org): [string, ReactNode][] {
  const all: [string, ReactNode][] = [
    ['Next step', org.next_step ? <NextStep org={org} /> : null],
    ['Sector', org.sector],
    ['Size', org.size],
    ['Location', org.location],
    ['Source', org.source],
    ['Value', money(org.value_estimate)],
    ['Tags', org.tags.length ? org.tags.map((t) => <Tag key={t}>{t}</Tag>) : null],
  ]
  return all.filter(([, v]) => v)
}

function OrgView({ org, setOrg, reloadOrg }: { org: Org; setOrg: (o: Org) => void; reloadOrg: () => void }) {
  const phone = useIsPhone()
  const navigate = useNavigate()
  const contacts = useApi(() => api.contacts(org.id), [org.id])
  const timeline = useApi(() => api.timeline(org.id), [org.id])
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string>()
  const primary = contacts.data?.find((c) => c.is_primary)

  async function changeStatus(status: string) {
    if (status === org.status) return
    setNotice(undefined)
    try {
      setOrg(await api.patchOrg(org.id, { updated_at: org.updated_at, status }))
      timeline.reload()
    } catch (e) {
      setNotice(saveErrorText(e))
      reloadOrg()
    }
  }

  return (
    <div className="lg-page">
      <header className="lg-org-head">
        <div className="lg-org-title">
          <h1 className="tenon-heading-1">{org.name}</h1>
          <StatusPicker org={org} aria="Status" onChange={(s) => void changeStatus(s)} />
        </div>
        <p className="lg-faint">
          {label(org.kind)} · owned by {person(org.owner_email)}
          {org.website && <> · <a href={webHref(org.website)} target="_blank" rel="noreferrer">{org.website}</a></>}
        </p>
        <div className="lg-actions">
          {/* LOG BUTTON: Task 16 adds it here. */}
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          {!phone && primary?.phone && <LinkButton variant="secondary" href={`tel:${primary.phone}`}>Call {primary.name}</LinkButton>}
          {primary?.email && <LinkButton variant="secondary" href={`mailto:${primary.email}`}>Email {primary.name}</LinkButton>}
        </div>
        {notice && <Alert tone="error">{notice}</Alert>}
      </header>

      <div className="lg-org-body">
        <div className="lg-column">
          <section className="lg-section">
            <h2 className="tenon-heading-3">Overview</h2>
            {org.summary ? <p className="lg-entry-text">{org.summary}</p> : <p className="lg-faint">No summary yet.</p>}
            <dl className="lg-facts">
              {facts(org).map(([k, v]) => (
                <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
              ))}
            </dl>
          </section>
          {/* TIMELINE: Task 16 adds it here. */}
        </div>
        <div className="lg-column">
          {/* PEOPLE: Task 15 adds it here. */}
        </div>
      </div>

      {phone && (
        <div className="lg-bar">
          {/* LOG BAR BUTTON: Task 16 adds it here. */}
          {primary?.phone && <LinkButton variant="secondary" href={`tel:${primary.phone}`}>Call</LinkButton>}
        </div>
      )}

      <OrgForm
        open={editing}
        org={org}
        onClose={() => setEditing(false)}
        onSaved={(o) => {
          setEditing(false)
          setOrg(o)
          timeline.reload()
        }}
        onDeleted={() => navigate('/list')}
      />
    </div>
  )
}
```

The four `{/* … */}` comments mark where Tasks 15 and 16 insert code, and those tasks delete them. While the timeline is unused, `timeline.reload()` still runs so the status test can see it.

- [ ] **Step 4: Route it**

In `web/src/app/App.tsx`, add `import { OrgPage } from '../pages/OrgPage'` and replace the `o/:slug` route with:

```tsx
          <Route path="o/:slug" element={<OrgPage />} />
```

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (49 tests), no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/OrgPage.tsx web/src/pages/OrgPage.test.tsx web/src/app/App.tsx
git commit -m "Web: organisation page with status, overview and edit"
```

---

### Task 15: Contact form and the People section

**Files:**
- Create: `web/src/components/ContactForm.tsx`, `web/src/pages/org/PeopleSection.tsx`
- Modify: `web/src/pages/OrgPage.tsx` (the PEOPLE comment)
- Test: `web/src/components/ContactForm.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/components/ContactForm.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { contact } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactForm, contactBody, contactForm } from './ContactForm'

test('contactBody: empty is null, no relationship is null', () => {
  const f = { ...contactForm(), name: ' Bo ', email: '', relationship: '' }
  expect(contactBody(f)).toMatchObject({ name: 'Bo', email: null, relationship: null, is_primary: false })
})

test('adds a person to the organisation', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs/1/contacts': () => contact() })
  const onSaved = vi.fn()
  renderApp(<ContactForm open orgId={1} onClose={() => {}} onSaved={onSaved} />)
  await user.type(screen.getByLabelText(/^Name/), 'Bo')
  await user.click(screen.getByRole('radio', { name: 'Warm' }))
  await user.click(screen.getByLabelText('Who to talk to'))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ name: 'Bo', relationship: 'warm', is_primary: true })
})

test('an edit sends only what changed', async () => {
  const user = userEvent.setup()
  const bo = contact({ role: 'CEO' })
  const calls = stubFetch({ 'PATCH /api/contacts/5': () => bo })
  renderApp(<ContactForm open orgId={1} contact={bo} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Phone'), '0113')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0].body).toEqual({ phone: '0113', updated_at: bo.updated_at })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/ContactForm.test.tsx`
Expected: FAIL, `Failed to resolve import "./ContactForm"`.

- [ ] **Step 3: Write `web/src/components/ContactForm.tsx`**

```tsx
import { Alert, Button, Field, Modal, SegmentedControl } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, ContactFields } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useIsPhone } from '../lib/useIsPhone'
import { ConfirmDelete } from './ConfirmDelete'

export interface ContactFormState {
  name: string
  role: string
  email: string
  phone: string
  linkedin_url: string
  notes: string
  is_primary: boolean
  relationship: string
}

export function contactForm(c?: Contact): ContactFormState {
  return {
    name: text(c?.name),
    role: text(c?.role),
    email: text(c?.email),
    phone: text(c?.phone),
    linkedin_url: text(c?.linkedin_url),
    notes: text(c?.notes),
    is_primary: c?.is_primary ?? false,
    relationship: text(c?.relationship),
  }
}

export function contactBody(f: ContactFormState): ContactFields {
  return {
    name: f.name.trim(),
    role: orNull(f.role),
    email: orNull(f.email),
    phone: orNull(f.phone),
    linkedin_url: orNull(f.linkedin_url),
    notes: orNull(f.notes),
    is_primary: f.is_primary,
    relationship: f.relationship || null,
  }
}

interface Props {
  open: boolean
  orgId: number
  /** Left out to add a new person. */
  contact?: Contact
  onClose: () => void
  onSaved: (c: Contact) => void
  onDeleted?: () => void
}

export function ContactForm({ open, orgId, contact, onClose, onSaved, onDeleted }: Props) {
  const { meta } = useSession()
  const phone = useIsPhone()
  const [base, setBase] = useState(contact)
  const [form, setForm] = useState(() => contactForm(contact))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBase(contact)
    setForm(contactForm(contact))
    setError(undefined)
  }, [open, contact])

  const set = (k: keyof ContactFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const body = contactBody(form)
      const saved = base
        ? await api.patchContact(base.id, { ...changed<ContactFields>(base, body), updated_at: base.updated_at })
        : await api.createContact(orgId, body)
      onSaved(saved)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Contact
        setBase(current)
        setForm(contactForm(current))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base) return
    try {
      await api.deleteContact(base.id)
      onDeleted?.()
    } catch (e) {
      setError(saveErrorText(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={base ? `Edit ${base.name}` : 'Add a person'}
      size="md"
      className={phone ? 'lg-sheet' : undefined}
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="person" onConfirm={() => void remove()} />}
          <span className="lg-grow" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="contact-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="contact-form" className="lg-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required value={form.name} onChange={set('name')} autoFocus />
        <Field label="Role" value={form.role} onChange={set('role')} />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} />
        <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
        <Field label="LinkedIn" type="url" value={form.linkedin_url} onChange={set('linkedin_url')} />
        <div className="lg-field">
          <span className="tenon-label">Relationship</span>
          <SegmentedControl
            aria-label="Relationship"
            value={form.relationship}
            onChange={(relationship) => setForm((f) => ({ ...f, relationship }))}
            options={[{ value: '', label: 'Not sure' }, ...meta.relationships.map((r) => ({ value: r, label: label(r) }))]}
          />
        </div>
        <label className="lg-check">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
          />
          Who to talk to
        </label>
        <Field label="Notes" multiline rows={3} value={form.notes} onChange={set('notes')} />
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Write `web/src/pages/org/PeopleSection.tsx`**

```tsx
import { Alert, Button, Tag } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Contact } from '../../api/types'
import { ContactForm } from '../../components/ContactForm'
import { Loading } from '../../components/Loading'
import { label } from '../../lib/format'
import type { Loaded } from '../../lib/useApi'

export function PeopleSection({ orgId, contacts }: { orgId: number; contacts: Loaded<Contact[]> }) {
  const [editing, setEditing] = useState<Contact | 'new'>()
  const done = () => {
    setEditing(undefined)
    contacts.reload()
  }
  return (
    <section className="lg-section">
      <div className="lg-section-head">
        <h2 className="tenon-heading-3">People</h2>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>Add person</Button>
      </div>
      {contacts.error ? (
        <Alert tone="error">{contacts.error.message}</Alert>
      ) : !contacts.data ? (
        <Loading />
      ) : contacts.data.length === 0 ? (
        <p className="lg-faint">No one yet. Add the people you talk to.</p>
      ) : (
        <ul className="lg-people">
          {contacts.data.map((c) => (
            <li key={c.id}>
              <div>
                <Link to={`/c/${c.id}`}>{c.name}</Link>
                {c.is_primary && <Tag tone="accent">Talk to</Tag>}
                {c.relationship && <Tag>{label(c.relationship)}</Tag>}
              </div>
              <div className="lg-faint">{[c.role, c.email, c.phone].filter(Boolean).join(' · ')}</div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
            </li>
          ))}
        </ul>
      )}
      <ContactForm
        open={editing !== undefined}
        orgId={orgId}
        contact={editing === 'new' ? undefined : editing}
        onClose={() => setEditing(undefined)}
        onSaved={done}
        onDeleted={done}
      />
    </section>
  )
}
```

- [ ] **Step 5: Put it on the organisation page**

In `web/src/pages/OrgPage.tsx`, add `import { PeopleSection } from './org/PeopleSection'` and replace `{/* PEOPLE: Task 15 adds it here. */}` with:

```tsx
          <PeopleSection orgId={org.id} contacts={contacts} />
```

Add one test to the end of `web/src/pages/OrgPage.test.tsx`:

```tsx
test('lists the people, with who to talk to flagged', async () => {
  stubs()
  page()
  expect(await screen.findByRole('link', { name: 'Bo' })).toHaveAttribute('href', '/c/5')
  expect(screen.getByText('Talk to')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (53 tests), no type errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ContactForm.tsx web/src/components/ContactForm.test.tsx web/src/pages/org/PeopleSection.tsx web/src/pages/OrgPage.tsx web/src/pages/OrgPage.test.tsx
git commit -m "Web: people on the organisation page, add and edit a person"
```

---

### Task 16: Quick log and the Timeline

**Files:**
- Create: `web/src/components/QuickLog.tsx`, `web/src/components/InteractionEntry.tsx`, `web/src/pages/org/TimelineSection.tsx`
- Modify: `web/src/pages/OrgPage.tsx` (the LOG BUTTON, TIMELINE and LOG BAR BUTTON comments)
- Test: `web/src/components/QuickLog.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/components/QuickLog.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { toLocalInput } from '../lib/format'
import { contact, interaction } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { logBody, logForm, QuickLog } from './QuickLog'

test('a new log defaults to now and to the preselected people', () => {
  const now = new Date(2026, 10, 12, 9, 30)
  const f = logForm(undefined, [5], now, 'call')
  expect(f).toMatchObject({ type: 'call', when: '2026-11-12T09:30', contact_ids: [5], summary: '' })
})

test('logBody keeps the stored time when the time was not touched', () => {
  const i = interaction({ happened_at: '2026-11-10T09:30:12.345678+00:00' })
  const f = logForm(i)
  expect(logBody(f, i).happened_at).toBe(i.happened_at)
  const moved = { ...f, when: '2026-11-10T08:00' }
  expect(logBody(moved, i).happened_at).toBe(new Date('2026-11-10T08:00').toISOString())
  expect(toLocalInput(i.happened_at)).toBe(f.when)
})

test('logs an interaction with the chosen people', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs/1/interactions': () => interaction() })
  const onSaved = vi.fn()
  renderApp(<QuickLog open orgId={1} contacts={[contact()]} onClose={() => {}} onSaved={onSaved} />)
  await user.click(screen.getByRole('radio', { name: 'Meeting' }))
  await user.click(screen.getByRole('button', { name: 'Bo' }))
  await user.type(screen.getByLabelText(/What happened/), 'Kick-off')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ type: 'meeting', summary: 'Kick-off', contact_ids: [5], next_step: null, next_step_due: null })
})

test('will not save without saying what happened', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({})
  renderApp(<QuickLog open orgId={1} contacts={[]} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Say what happened.')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
})

test('editing sends only what changed', async () => {
  const user = userEvent.setup()
  const i = interaction()
  const calls = stubFetch({ 'PATCH /api/interactions/7': () => i })
  renderApp(<QuickLog open orgId={1} contacts={[]} initial={i} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Next step'), 'Send rates')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0].body).toEqual({ next_step: 'Send rates', updated_at: i.updated_at })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/QuickLog.test.tsx`
Expected: FAIL, `Failed to resolve import "./QuickLog"`.

- [ ] **Step 3: Write `web/src/components/QuickLog.tsx`**

```tsx
import { Alert, Button, Field, Modal, SegmentedControl, ToggleChip } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, Interaction, InteractionFields } from '../api/types'
import { useSession } from '../app/session'
import { fromLocalInput, label, toLocalInput } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useIsPhone } from '../lib/useIsPhone'
import { ConfirmDelete } from './ConfirmDelete'

/** What the form needs from an interaction. A timeline item has all of it. */
export type Loggable = Pick<
  Interaction,
  'id' | 'updated_at' | 'type' | 'summary' | 'happened_at' | 'next_step' | 'next_step_due' | 'contact_ids'
>

export interface LogFormState {
  type: string
  when: string
  contact_ids: number[]
  summary: string
  next_step: string
  next_step_due: string
}

export function logForm(i?: Loggable, preselect: number[] = [], now: Date = new Date(), type = 'call'): LogFormState {
  return {
    type: i?.type ?? type,
    when: toLocalInput(i?.happened_at ?? now.toISOString()),
    contact_ids: i?.contact_ids ?? preselect,
    summary: text(i?.summary),
    next_step: text(i?.next_step),
    next_step_due: text(i?.next_step_due),
  }
}

/** The form has minutes only; an untouched time keeps the stored one exactly. */
export function logBody(f: LogFormState, base?: Loggable): InteractionFields {
  const sameTime = base && f.when === toLocalInput(base.happened_at)
  return {
    type: f.type,
    summary: f.summary.trim(),
    happened_at: sameTime ? base.happened_at : fromLocalInput(f.when),
    contact_ids: f.contact_ids,
    next_step: orNull(f.next_step),
    next_step_due: f.next_step_due || null,
  }
}

interface Props {
  open: boolean
  orgId: number
  contacts: Contact[]
  /** Left out to log something new. */
  initial?: Loggable
  /** People ticked on a new log, such as the contact whose page it was opened from. */
  preselect?: number[]
  onClose: () => void
  onSaved: () => void
}

export function QuickLog({ open, orgId, contacts, initial, preselect, onClose, onSaved }: Props) {
  const { meta } = useSession()
  const phone = useIsPhone()
  const first = meta.interaction_types[0]
  const [base, setBase] = useState(initial)
  const [form, setForm] = useState(() => logForm(initial, preselect, new Date(), first))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  // Reset on open. `preselect` is left out on purpose: callers pass a new array each render.
  useEffect(() => {
    if (!open) return
    setBase(initial)
    setForm(logForm(initial, preselect, new Date(), first))
    setError(undefined)
  }, [open, initial])

  const set = (k: 'when' | 'summary' | 'next_step' | 'next_step_due') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggle = (id: number) =>
    setForm((f) => ({
      ...f,
      contact_ids: f.contact_ids.includes(id) ? f.contact_ids.filter((c) => c !== id) : [...f.contact_ids, id],
    }))

  async function save() {
    if (busy) return
    const body = logBody(form, base)
    if (!body.summary) {
      setError('Say what happened.')
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      if (base) await api.patchInteraction(base.id, { ...changed<InteractionFields>(base, body), updated_at: base.updated_at })
      else await api.createInteraction(orgId, body)
      onSaved()
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Interaction
        setBase(current)
        setForm(logForm(current))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base) return
    try {
      await api.deleteInteraction(base.id)
      onSaved()
    } catch (e) {
      setError(saveErrorText(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={base ? 'Edit log' : 'Log'}
      size="md"
      className={phone ? 'lg-sheet' : undefined}
      onSubmit={() => void save()}
      footer={
        <>
          {base && <ConfirmDelete what="log" onConfirm={() => void remove()} />}
          <span className="lg-grow" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="log-form" className="lg-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="lg-field">
          <span className="tenon-label">Type</span>
          <SegmentedControl
            aria-label="Type"
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
            options={meta.interaction_types.map((t) => ({ value: t, label: label(t) }))}
          />
        </div>
        <Field label="When" type="datetime-local" required value={form.when} onChange={set('when')} />
        {contacts.length > 0 && (
          <div className="lg-field">
            <span className="tenon-label">With</span>
            <div className="lg-chips">
              {contacts.map((c) => (
                <ToggleChip key={c.id} pressed={form.contact_ids.includes(c.id)} onClick={() => toggle(c.id)}>
                  {c.name}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}
        <Field label="What happened" multiline rows={4} required value={form.summary} onChange={set('summary')} autoFocus />
        <Field label="Next step" value={form.next_step} onChange={set('next_step')} />
        <Field label="Next step due" type="date" value={form.next_step_due} onChange={set('next_step_due')} />
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Write `web/src/components/InteractionEntry.tsx`**

```tsx
import { Tag } from '@tiagopedras/tenon'
import type { ReactNode } from 'react'
import { day, isOverdue, label, person } from '../lib/format'

interface Props {
  type: string
  at: string
  by: string
  summary: string
  next_step: string | null
  next_step_due: string | null
  people: string[]
  action?: ReactNode
}

/** One logged interaction, as the timeline and the contact page show it. */
export function InteractionEntry({ type, at, by, summary, next_step, next_step_due, people, action }: Props) {
  return (
    <article className="lg-entry">
      <div className="lg-entry-head">
        <Tag>{label(type)}</Tag>
        <span className="lg-faint">
          {day(at)} · {person(by)}
          {people.length > 0 && ` · with ${people.join(', ')}`}
        </span>
        {action}
      </div>
      <p className="lg-entry-text">{summary}</p>
      {next_step && (
        <p className={isOverdue(next_step_due) ? 'lg-overdue' : 'lg-faint'}>
          Next: {next_step}
          {next_step_due && ` · ${day(next_step_due)}`}
        </p>
      )}
    </article>
  )
}
```

- [ ] **Step 5: Write `web/src/pages/org/TimelineSection.tsx`**

```tsx
import { Alert, Button } from '@tiagopedras/tenon'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import type { Contact, TimelineInteraction, TimelineItem } from '../../api/types'
import { InteractionEntry } from '../../components/InteractionEntry'
import { Loading } from '../../components/Loading'
import { day, person, statusLine } from '../../lib/format'
import type { Loaded } from '../../lib/useApi'

interface Props {
  items: Loaded<TimelineItem[]>
  contacts: Contact[]
  onEdit: (i: TimelineInteraction) => void
}

export function TimelineSection({ items, contacts, onEdit }: Props) {
  const names = new Map(contacts.map((c) => [c.id, c.name]))
  const { hash } = useLocation()

  // A search hit links to #i-<id>; bring that entry into view once it is drawn.
  useEffect(() => {
    if (hash && items.data) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'center' })
  }, [hash, items.data])

  return (
    <section className="lg-section">
      <h2 className="tenon-heading-3">Timeline</h2>
      {items.error ? (
        <Alert tone="error">{items.error.message}</Alert>
      ) : !items.data ? (
        <Loading />
      ) : items.data.length === 0 ? (
        <p className="lg-faint">Nothing logged yet.</p>
      ) : (
        <ol className="lg-timeline">
          {items.data.map((i) =>
            i.kind === 'status' ? (
              <li key={`s${i.id}`} className="lg-tl-status">
                {statusLine(i.from_status, i.to_status)} <span className="lg-faint">· {person(i.by_email)} · {day(i.at)}</span>
              </li>
            ) : (
              <li key={`i${i.id}`} id={`i-${i.id}`}>
                <InteractionEntry
                  type={i.type}
                  at={i.at}
                  by={i.by_email}
                  summary={i.summary}
                  next_step={i.next_step}
                  next_step_due={i.next_step_due}
                  people={i.contact_ids.map((id) => names.get(id)).filter((n): n is string => !!n)}
                  action={<Button size="sm" variant="ghost" onClick={() => onEdit(i)}>Edit</Button>}
                />
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Put both on the organisation page**

In `web/src/pages/OrgPage.tsx`:

1. Add imports:

```tsx
import type { TimelineInteraction } from '../api/types'
import { QuickLog } from '../components/QuickLog'
import { TimelineSection } from './org/TimelineSection'
```

2. Under `const [notice, setNotice] = useState<string>()`, add:

```tsx
  const [log, setLog] = useState<'new' | TimelineInteraction>()
  const afterLog = () => {
    setLog(undefined)
    timeline.reload()
    reloadOrg() // last_contact moves
  }
```

3. Replace `{/* LOG BUTTON: Task 16 adds it here. */}` with:

```tsx
          {!phone && <Button onClick={() => setLog('new')}>Log</Button>}
```

4. Replace `{/* TIMELINE: Task 16 adds it here. */}` with:

```tsx
          <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} />
```

5. Replace `{/* LOG BAR BUTTON: Task 16 adds it here. */}` with:

```tsx
          <Button onClick={() => setLog('new')}>Log</Button>
```

6. After the `<OrgForm … />` element, add:

```tsx
      <QuickLog
        open={log !== undefined}
        orgId={org.id}
        contacts={contacts.data ?? []}
        initial={log === 'new' ? undefined : log}
        onClose={() => setLog(undefined)}
        onSaved={afterLog}
      />
```

Add one test to the end of `web/src/pages/OrgPage.test.tsx`. It also needs `import { interaction } from '../test/fixtures'` (extend the existing fixtures import):

```tsx
test('the timeline mixes logs and status changes', async () => {
  stubs({
    'GET /api/orgs/1/timeline': () => [
      { kind: 'status', id: 1, org_id: 1, from_status: 'lead', to_status: 'contacted', at: acme.updated_at, by_email: 'ana@example.com' },
      { ...interaction({ contact_ids: [5] }), author_email: undefined, kind: 'interaction', at: acme.updated_at, by_email: 'ana@example.com' },
    ],
  })
  page()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
  expect(screen.getByText('Moved from Lead to Contacted')).toBeInTheDocument()
  expect(await screen.findByText(/with Bo/)).toBeInTheDocument()
})
```

- [ ] **Step 7: Run the tests**

Run: `npm test && npm run check`
Expected: all pass (59 tests), no type errors. `grep -n "Task 1[56] adds" web/src/pages/OrgPage.tsx` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/QuickLog.tsx web/src/components/QuickLog.test.tsx web/src/components/InteractionEntry.tsx web/src/pages/org/TimelineSection.tsx web/src/pages/OrgPage.tsx web/src/pages/OrgPage.test.tsx
git commit -m "Web: quick log and the organisation timeline"
```

---

### Task 17: Contact page

**Files:**
- Create: `web/src/pages/ContactPage.tsx`
- Modify: `web/src/app/App.tsx` (the `c/:id` route, and remove `Soon`)
- Test: `web/src/pages/ContactPage.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/pages/ContactPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { contact, interaction } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactPage } from './ContactPage'

const bo = contact({ role: 'CEO', email: 'bo@example.com', notes: 'Prefers mornings', relationship: 'warm' })

function page() {
  stubFetch({
    'GET /api/contacts/5': () => bo,
    'GET /api/contacts/5/interactions': () => [interaction({ contact_ids: [5] })],
    'GET /api/orgs/1/contacts': () => [bo],
  })
  return renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
}

test('shows the person, their organisation and what was logged with them', async () => {
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Bo' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Prefers mornings')).toBeInTheDocument()
  expect(screen.getByText('Warm')).toBeInTheDocument()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
})

test('Log opens with this person ticked', async () => {
  const user = userEvent.setup()
  page()
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/ContactPage.test.tsx`
Expected: FAIL, `Failed to resolve import "./ContactPage"`.

- [ ] **Step 3: Write `web/src/pages/ContactPage.tsx`**

```tsx
import { Alert, Button, LinkButton } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Contact } from '../api/types'
import { ContactForm } from '../components/ContactForm'
import { InteractionEntry } from '../components/InteractionEntry'
import { Loading } from '../components/Loading'
import { QuickLog } from '../components/QuickLog'
import { label } from '../lib/format'
import { useApi } from '../lib/useApi'

export function ContactPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const contact = useApi(() => api.contact(id), [id])
  const history = useApi(() => api.contactInteractions(id), [id])
  const orgId = contact.data?.org_id
  const people = useApi(() => (orgId ? api.contacts(orgId) : Promise.resolve([] as Contact[])), [orgId])
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)

  if (contact.error) return <Alert tone="error" title="Could not open this person">{contact.error.message}</Alert>
  if (!contact.data) return <Loading />
  const c = contact.data
  const names = new Map((people.data ?? []).map((p) => [p.id, p.name]))
  const details: [string, ReactNode][] = (
    [
      ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
      ['Phone', c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>],
      ['LinkedIn', c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer">Profile</a>],
      ['Relationship', c.relationship && label(c.relationship)],
      ['Talk to', c.is_primary && 'Yes, the one to talk to'],
    ] as [string, ReactNode][]
  ).filter(([, v]) => v)

  return (
    <div className="lg-page">
      <header className="lg-org-head">
        <h1 className="tenon-heading-1">{c.name}</h1>
        <p className="lg-faint">
          {c.role && `${c.role} at `}
          <Link to={`/o/${c.org_slug}`}>{c.org_name}</Link>
        </p>
        <div className="lg-actions">
          <Button onClick={() => setLogging(true)}>Log</Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          {c.phone && <LinkButton variant="secondary" href={`tel:${c.phone}`}>Call</LinkButton>}
          {c.email && <LinkButton variant="secondary" href={`mailto:${c.email}`}>Email</LinkButton>}
        </div>
      </header>

      <section className="lg-section">
        <h2 className="tenon-heading-3">Details</h2>
        <dl className="lg-facts">
          {details.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
        {c.notes && <p className="lg-entry-text">{c.notes}</p>}
      </section>

      <section className="lg-section">
        <h2 className="tenon-heading-3">With {c.name}</h2>
        {history.error ? (
          <Alert tone="error">{history.error.message}</Alert>
        ) : !history.data ? (
          <Loading />
        ) : history.data.length === 0 ? (
          <p className="lg-faint">Nothing logged with {c.name} yet.</p>
        ) : (
          <ol className="lg-timeline">
            {history.data.map((i) => (
              <li key={i.id}>
                <InteractionEntry
                  type={i.type} at={i.happened_at} by={i.author_email} summary={i.summary}
                  next_step={i.next_step} next_step_due={i.next_step_due}
                  people={i.contact_ids.filter((p) => p !== c.id).map((p) => names.get(p)).filter((n): n is string => !!n)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <ContactForm
        open={editing}
        orgId={c.org_id}
        contact={c}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false)
          contact.setData(saved)
        }}
        onDeleted={() => navigate(`/o/${c.org_slug}`)}
      />
      <QuickLog
        open={logging}
        orgId={c.org_id}
        contacts={people.data ?? []}
        preselect={[c.id]}
        onClose={() => setLogging(false)}
        onSaved={() => {
          setLogging(false)
          history.reload()
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Route it, and remove the placeholder**

In `web/src/app/App.tsx`, add `import { ContactPage } from '../pages/ContactPage'`, replace the `c/:id` route with `<Route path="c/:id" element={<ContactPage />} />`, and delete the `Soon` function. The routes block now reads:

```tsx
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="list" element={<ListPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="o/:slug" element={<OrgPage />} />
          <Route path="c/:id" element={<ContactPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
```

- [ ] **Step 5: Run the tests and look at it**

Run: `npm test && npm run check && npm run build`
Expected: all pass (61 tests), no type errors, and the build succeeds.

Then try it by hand. From the repo root, run `LEDGER_DB=ledger.db .venv/bin/python -m ledger` and open `http://127.0.0.1:8770`. Create an organisation with New, add a person, log a call, change the status, drag it on Pipeline, and search for it with `/`. Do it again with the browser's device toolbar at 390px. Fix anything that looks wrong before you commit, and add a test for anything that was a bug.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/ContactPage.tsx web/src/pages/ContactPage.test.tsx web/src/app/App.tsx
git commit -m "Web: contact page"
```

---

### Task 18: Playwright flows at 390px and 1280px

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/flows.spec.ts`

- [ ] **Step 1: Install the browser**

Run: `cd web && npx playwright install chromium`
Expected: Chromium downloads, or it says it is already installed.

- [ ] **Step 2: Write `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

/* Runs against the real backend on :8771, on a throwaway database that is
 * deleted before each run, serving the build in web/dist. `npm run e2e`
 * builds first. Local mode (no LEDGER_AUTH) signs everyone in as the dev
 * identity. */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8771',
    extraHTTPHeaders: { 'X-Ledger': '1' },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command:
      'cd .. && rm -f e2e.db e2e.db-wal e2e.db-shm && LEDGER_DB=e2e.db LEDGER_PORT=8771 LEDGER_WEB=web/dist .venv/bin/python -m ledger',
    url: 'http://127.0.0.1:8771/api/health',
    reuseExistingServer: false,
  },
})
```

- [ ] **Step 3: Write `web/e2e/flows.spec.ts`**

Each test makes its own organisation with a unique name, so tests and projects never see each other's data.

```ts
import { expect, test, type APIRequestContext } from '@playwright/test'

interface Org { id: number; slug: string; name: string }

let n = 0
/** A name whose last word is unique, so a search for that word finds one organisation. */
function unique(base: string): string {
  n += 1
  return `${base} ${Date.now().toString(36)}x${n}`
}

async function newOrg(request: APIRequestContext, name: string): Promise<Org> {
  const r = await request.post('/api/orgs', { data: { name } })
  expect(r.ok()).toBeTruthy()
  return r.json()
}

test('search finds an organisation and opens it', async ({ page, request }) => {
  const name = unique('Searchable Studio')
  const org = await newOrg(request, name)
  await page.goto('/')
  await page.keyboard.press('/')
  await page.keyboard.type(name.split(' ').pop()!)
  await page.getByRole('link', { name }).click()
  await expect(page).toHaveURL(new RegExp(`/o/${org.slug}$`))
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
})

test('the list opens an organisation', async ({ page, request }) => {
  const name = unique('Listed Ltd')
  await newOrg(request, name)
  await page.goto('/list')
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
})

test('quick log adds to the timeline', async ({ page, request }) => {
  const org = await newOrg(request, unique('Logged Co'))
  await page.goto(`/o/${org.slug}`)
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Meeting' }).click()
  await dialog.getByLabel('What happened').fill('Talked budgets over coffee')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Talked budgets over coffee')).toBeVisible()
})

test('status changes on the organisation page', async ({ page, request }) => {
  const org = await newOrg(request, unique('Status Group'))
  await page.goto(`/o/${org.slug}`)
  await page.getByRole('button', { name: 'Status', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Contacted' }).click()
  await expect(page.getByText('Moved from Lead to Contacted')).toBeVisible()
  const saved = await (await request.get(`/api/orgs/${org.id}`)).json()
  expect(saved.status).toBe('contacted')
})

test('the pipeline moves a lead to the next stage', async ({ page, request }, info) => {
  const name = unique('Pipeline Partners')
  const org = await newOrg(request, name)
  await page.goto('/pipeline')
  if (info.project.name === 'desktop') {
    const card = page.locator('.tenon-card', { hasText: name })
    const target = page.getByTestId('stage-contacted')
    await card.dragTo(target)
    await expect(target.getByRole('link', { name })).toBeVisible()
  } else {
    await page.getByRole('button', { name: `Status of ${name}` }).click()
    await page.getByRole('menuitemradio', { name: 'Contacted' }).click()
    await page.getByRole('radio', { name: /^Contacted/ }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  const saved = await (await request.get(`/api/orgs/${org.id}`)).json()
  expect(saved.status).toBe('contacted')
})
```

- [ ] **Step 4: Run the flows**

Run: `npm run e2e`
Expected: `10 passed` (5 flows × 2 projects). If one fails, open the trace (`npx playwright show-trace test-results/<test>/trace.zip`), fix the cause in the app or the test, and run again.

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/e2e/flows.spec.ts
git commit -m "Web: Playwright flows at phone and desktop widths"
```

---

### Task 19: Installable on a phone (PWA manifest)

**Files:**
- Create: `web/public/icon.svg`, `web/scripts/icons.mjs`, `web/public/icon-192.png`, `web/public/icon-512.png`, `web/public/manifest.webmanifest`, `web/e2e/pwa.spec.ts`
- Modify: `web/index.html` (head)

The spec asks for a manifest so it can be added to a home screen. There is no service worker and no offline mode.

- [ ] **Step 1: Write the failing test**

`web/e2e/pwa.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('the page links a manifest whose icons exist', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'Ledger', start_url: '/', display: 'standalone' })
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src)
    expect(r.ok(), icon.src).toBeTruthy()
  }
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run e2e -- e2e/pwa.spec.ts`
Expected: FAIL, the manifest `href` is `null`.

- [ ] **Step 3: Make the icon**

`web/public/icon.svg`. The three bars sit inside the middle 80%, so the icon survives a maskable crop:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1f2a44"/>
  <rect x="136" y="148" width="240" height="40" rx="20" fill="#ffffff"/>
  <rect x="136" y="236" width="240" height="40" rx="20" fill="#ffffff"/>
  <rect x="136" y="324" width="150" height="40" rx="20" fill="#ffffff"/>
</svg>
```

An icon file is an image, not app CSS, so the "Tenon tokens only" rule does not apply here.

`web/scripts/icons.mjs`:

```js
// Writes public/icon-192.png and public/icon-512.png from public/icon.svg.
// Run with `npm run icons` after changing the SVG, and commit the PNGs.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: fileURLToPath(new URL(`../public/icon-${size}.png`, import.meta.url)) })
  await page.close()
}
await browser.close()
```

Run: `npm run icons`
Expected: `web/public/icon-192.png` and `web/public/icon-512.png` exist (`file web/public/icon-*.png` reports PNGs of 192×192 and 512×512).

- [ ] **Step 4: Write the manifest and link it**

`web/public/manifest.webmanifest`:

```json
{
  "name": "Ledger",
  "short_name": "Ledger",
  "description": "Offdesk leads and clients",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#1f2a44",
  "theme_color": "#1f2a44",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }
  ]
}
```

In `web/index.html`, add after the viewport `<meta>`:

```html
    <meta name="theme-color" content="#1f2a44" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
```

- [ ] **Step 5: Run the tests**

Run: `npm run e2e`
Expected: `12 passed`.

- [ ] **Step 6: Commit**

```bash
git add web/public web/scripts/icons.mjs web/index.html web/e2e/pwa.spec.ts
git commit -m "Web: manifest and icons so it installs to a home screen"
```

---

### Task 20: Docs, and the last full check

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: README**

Replace the run block at the top of `README.md` with:

````markdown
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
````

- [ ] **Step 2: CLAUDE.md**

1. In "Where the work stands", change item 2 to:

```
2. Frontend (React + Vite + TypeScript + Tenon, desktop and phone): built on
   `feature/frontend`, plan `docs/superpowers/plans/2026-11-11-ledger-2-frontend.md`.
   Review, then merge.
```

2. In "Run and test", add after the Python lines:

```
(cd web && npm install && npm run check && npm test)   # frontend
(cd web && npm run e2e)                                # Playwright, builds first
```

and change "Run the whole suite before every commit." to "Run both suites before every commit."

3. Add a section after "Rules for the code":

```markdown
## Rules for the frontend

- The app lives in `web/`. FastAPI serves its build (`ledger/web.py`), with
  `index.html` for any path not under `/api`, so `/o/<slug>` links work.
- Use a Tenon component before writing one. CSS in `web/src/styles.css` reads
  `var(--tenon-…)` tokens only: no hex colours, no font names.
- `web/src/api/types.ts` and the README's API section describe the same
  shapes. Change them together.
- Every fetch goes through `web/src/api/client.ts`, which adds `X-Ledger: 1`
  to writes. Every edit form PATCHes only what changed, plus `updated_at`, and
  on a 409 loads `current` into the form.
- Lists, filters and vocabularies come from `GET /api/meta`, never a copy in
  the frontend.
- One breakpoint: below 768px is the phone layout (`useIsPhone`).
```

- [ ] **Step 3: The full check**

From the repo root:

```bash
.venv/bin/pytest -q
cd web && npm run check && npm test && npm run e2e && cd ..
git status --short
```

Expected: pytest all pass (125), type-check clean, Vitest all pass (61), Playwright `12 passed`, and `git status` lists only `README.md` and `CLAUDE.md`. No `e2e.db`, `dist` or `test-results` appear, because they are ignored.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Docs: running and testing the frontend"
```

- [ ] **Step 5: Review and PR**

Use superpowers:requesting-code-review on the branch against this plan and the spec's Screens section. Fix what it finds, run Step 3 again, then open the PR to `main`. Its body says what plan 2 builds and lists what it leaves for plans 3 and 4 (Research, Work, Paste and summarise). Add no attribution lines.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Frontend React + TS + Vite, Tenon pinned to a tag | 2 |
| FastAPI serves the built SPA | 1 |
| Mobile-first, one breakpoint at ~768px | 2 (CSS), 6 (`useIsPhone`), every page |
| Light and dark from Tenon's themes | 2 (tokens only, Tenon's `:root` and dark blocks) |
| PWA manifest, no offline mode | 19 |
| Header shows name and Sign out posting to `/auth/logout` | 8 |
| Every non-GET carries `X-Ledger: 1` | 3 |
| Stale save → 409, reload and show what changed | 5 (`saveErrorText`), 11, 13, 14, 15, 16 |
| Home: needs attention and recent activity | 10 |
| Pipeline: columns, drag on desktop, tabs and picker on a phone | 13 |
| List: name, status, owner, last contact, next step, value; filters; sorting; cards on phone | 12 |
| Search in the top bar, `/`, grouped results with snippets | 8, 9 |
| Organisation page: header, quick actions, Overview, People, Timeline, sticky phone bar | 14, 15, 16 |
| Quick log: bottom sheet / modal, type, date, contacts, text, next step and date | 16 |
| Contact page: details, organisation, interactions | 17 |
| Playwright flows at 390px and 1280px: search, open org, quick log, change status, pipeline | 18 |
| Research section, Work section, contact research, Paste and summarise | Plans 3 and 4 |
