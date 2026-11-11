import logging
import sqlite3
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("ledger")


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

    @app.exception_handler(sqlite3.IntegrityError)
    def _integrity(request: Request, exc: sqlite3.IntegrityError):
        # Backstop for a constraint the request checks missed. The raw message
        # names tables and columns, so it goes to the log, not the caller.
        log.warning("integrity error on %s %s: %s", request.method, request.url.path, exc)
        if "UNIQUE" in str(exc):
            return JSONResponse({"detail": "That conflicts with an existing record"}, status_code=409)
        return JSONResponse({"detail": "That breaks a rule on this record"}, status_code=422)

    @app.exception_handler(RequestValidationError)
    def _validation(request: Request, exc: RequestValidationError):
        # Drop each error's echoed `input` and `ctx`: a NaN in the input cannot be encoded as JSON.
        detail = [{"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")}
                  for e in exc.errors()]
        return JSONResponse({"detail": detail}, status_code=422)
