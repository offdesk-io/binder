"""Copy Binder's SQLite database while the app runs, and prune old copies.

    python -m binder.backup <db> <dir> [--prefix nightly] [--keep-days N | --keep N]

Prints the path of the new copy. It uses SQLite's online backup, so a copy
taken in the middle of a write is still a consistent database. Copies are
named <prefix>-<UTC time>.db and only the owner can read them. Pruning only
looks at files with this prefix and a time it can read, so the migration
copies db.py writes, and anything else in the folder, are left alone.

The nightly timer keeps 30 days of nightly copies. A deploy keeps its last
10 deploy copies, so a failed deploy that migrated the database can be put back.
"""

import argparse
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

STAMP = "%Y%m%dT%H%M%S%fZ"


def backup(db: Path, folder: Path, prefix: str, now: Optional[datetime] = None) -> Path:
    if not db.is_file():
        raise FileNotFoundError(str(db))
    now = now or datetime.now(timezone.utc)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / ("%s-%s.db" % (prefix, now.strftime(STAMP)))
    part = folder / (target.name + ".part")
    src = sqlite3.connect(str(db))
    try:
        dst = sqlite3.connect(str(part))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    part.chmod(0o600)
    part.replace(target)
    return target


def _stamp(path: Path, prefix: str) -> Optional[datetime]:
    name = path.name
    if not (name.startswith(prefix + "-") and name.endswith(".db")):
        return None
    try:
        return datetime.strptime(name[len(prefix) + 1:-3], STAMP).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def prune(folder: Path, prefix: str, keep_days: Optional[int] = None,
          keep: Optional[int] = None, now: Optional[datetime] = None) -> List[Path]:
    copies = []
    for path in folder.glob(prefix + "-*.db"):
        when = _stamp(path, prefix)
        if when is not None:
            copies.append((when, path))
    copies.sort()
    if keep is not None:
        old = copies[:-keep] if keep > 0 else copies
    elif keep_days is not None:
        cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=keep_days)
        old = [c for c in copies if c[0] < cutoff]
    else:
        old = []
    for _, path in old:
        path.unlink()
    return [path for _, path in old]


def _positive(text: str) -> int:
    value = int(text)
    if value < 1:
        raise argparse.ArgumentTypeError("must be 1 or more")
    return value


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m binder.backup", description=__doc__.splitlines()[0])
    parser.add_argument("db")
    parser.add_argument("folder")
    parser.add_argument("--prefix", default="nightly")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--keep-days", type=_positive)
    group.add_argument("--keep", type=_positive)
    args = parser.parse_args(argv)
    try:
        path = backup(Path(args.db), Path(args.folder), args.prefix)
    except FileNotFoundError:
        print("no database at %s" % args.db, file=sys.stderr)
        return 2
    prune(Path(args.folder), args.prefix, keep_days=args.keep_days, keep=args.keep)
    print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
