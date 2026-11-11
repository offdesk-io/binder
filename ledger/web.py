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
        try:
            target = (root / rel).resolve()
            if rel and target.is_relative_to(root) and target.is_file():
                return FileResponse(target, headers=FOREVER if rel.startswith("assets/") else NO_CACHE)
        except (OSError, ValueError):
            pass  # a name the file system rejects is no file
        if rel.startswith("assets/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        return FileResponse(index, headers=NO_CACHE)
