from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class NotFound(Exception):
    pass


class Invalid(Exception):
    pass


class Conflict(Exception):
    """A save carried a stale updated_at. `current` is the row as it is now."""

    def __init__(self, current: Optional[Any] = None):
        super().__init__("Changed since you loaded it")
        self.current = current


def install(app: FastAPI) -> None:
    @app.exception_handler(NotFound)
    def _nf(request: Request, exc: NotFound):
        return JSONResponse({"detail": str(exc) or "Not found"}, status_code=404)

    @app.exception_handler(Invalid)
    def _inv(request: Request, exc: Invalid):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(Conflict)
    def _conf(request: Request, exc: Conflict):
        return JSONResponse({"detail": str(exc), "current": exc.current}, status_code=409)
