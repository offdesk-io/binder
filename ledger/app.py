import sqlite3
from urllib.parse import quote

from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import JSONResponse

from . import errors, web
from .auth import guard
from .config import Settings
from .db import connect, migrate
from .api import contacts, interactions, misc, orgs


def create_app(settings: Settings) -> FastAPI:
    conn = connect(settings.db_path)
    migrate(conn, settings.db_path)
    conn.close()

    app = FastAPI(title="Ledger", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
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
    api.include_router(interactions.router)
    app.include_router(api)
    return app
