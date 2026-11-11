from fastapi import APIRouter, Depends, FastAPI

from . import errors
from .auth import guard
from .config import Settings
from .db import connect, migrate
from .api import misc


def create_app(settings: Settings) -> FastAPI:
    conn = connect(settings.db_path)
    migrate(conn, settings.db_path)
    conn.close()

    app = FastAPI(title="Ledger", docs_url=None, redoc_url=None)
    app.state.settings = settings
    errors.install(app)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    api = APIRouter(prefix="/api", dependencies=[Depends(guard)])
    api.include_router(misc.router)
    app.include_router(api)
    return app
