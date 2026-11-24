"""Data access. Plain functions: (conn, ...) -> dict. No HTTP here."""

import sqlite3
from typing import Any, Dict, Optional


def row(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(r) if r is not None else None


def like(q: str) -> str:
    """A LIKE pattern that finds `q` anywhere, with %, _ and the backslash taken
    literally. Use it with ESCAPE '\\'."""
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
