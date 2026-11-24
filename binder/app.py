import functools
import sqlite3
from typing import Any, Callable, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import JSONResponse

from . import ai as ai_module, bench as bench_module, errors, jobs, web
from .auth import guard
from .config import Settings
from .db import connect, migrate
from .api import contacts, interactions, misc, orgs, people, research, summarise
from .repo import research as research_repo

_FROM_SETTINGS = object()


def create_app(settings: Settings, ai: Any = _FROM_SETTINGS,
               run_job: Optional[Callable[[Callable[[], None]], None]] = None,
               bench: Any = _FROM_SETTINGS) -> FastAPI:
    """`ai` and `run_job` are for tests: the AI to use (None for none), and
    how a background job starts (default: its own thread). `bench` is the
    Bench board reader (None for off); by default it comes from the settings,
    and only then does the background refresh timer start."""
    conn = connect(settings.db_path)
    migrate(conn, settings.db_path)
    research_repo.fail_interrupted(conn)  # a run does not survive a restart
    conn.close()

    app = FastAPI(title="Binder", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.ai = ai_module.from_settings(settings) if ai is _FROM_SETTINGS else ai
    app.state.run_job = run_job or jobs.in_thread
    app.state.bench = bench_module.from_settings(settings) if bench is _FROM_SETTINGS else bench
    app.state.bench_refresher = None
    if app.state.bench is not None:
        refresh_job = run_job or functools.partial(jobs.in_thread, name="bench-refresh")
        app.state.bench_refresher = jobs.Refresher(settings.db_path, app.state.bench, refresh_job)
        if bench is _FROM_SETTINGS:  # tests pass a reader and refresh on demand, with no timer
            app.state.bench_refresher.start_timer()

    @app.middleware("http")
    async def frame_rules(request, call_next):
        # Only a page on the same origin (the Offdesk shell) may frame Binder.
        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", "frame-ancestors 'self'")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        return response

    errors.install(app)
    web.install(app, settings.web_dir)

    @app.get("/api/health")
    def health():
        # mode=rw never creates a file, so a moved or deleted database shows up as a failure.
        try:
            conn = sqlite3.connect("file:%s?mode=rw" % quote(settings.db_path), uri=True)
            try:
                migrated = conn.execute("PRAGMA user_version").fetchone()[0] > 0
            finally:
                conn.close()
        except sqlite3.Error:
            migrated = False
        if not migrated:
            return JSONResponse({"ok": False}, status_code=503)
        return {"ok": True}

    api = APIRouter(prefix="/api", dependencies=[Depends(guard)])
    api.include_router(misc.router)
    api.include_router(orgs.router)
    api.include_router(contacts.router)
    api.include_router(people.router)
    api.include_router(interactions.router)
    api.include_router(research.router)
    api.include_router(summarise.router)
    app.include_router(api)
    return app
