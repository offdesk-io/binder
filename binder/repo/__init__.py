"""Data access. Plain functions: (conn, ...) -> dict. No HTTP here."""

import sqlite3
from typing import Any, Dict, Optional


def row(r: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    return dict(r) if r is not None else None


def like(text: str) -> str:
    """A LIKE pattern matching `text` anywhere, with % _ and \\ taken literally (use ESCAPE '\\')."""
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
