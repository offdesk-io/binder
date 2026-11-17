import os
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from binder import backup as b

NOW = datetime(2026, 11, 17, 3, 30, 0, 123456, tzinfo=timezone.utc)


def make_db(path):
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE t(x)")
    conn.execute("INSERT INTO t VALUES (1), (2)")
    conn.commit()
    return conn


def stamp_name(prefix, when):
    return "%s-%s.db" % (prefix, when.strftime(b.STAMP))


def test_the_copy_holds_every_row_while_the_app_still_has_the_database_open(tmp_path):
    conn = make_db(tmp_path / "binder.db")
    out = b.backup(tmp_path / "binder.db", tmp_path / "nightly", "nightly")
    rows = sqlite3.connect(str(out)).execute("SELECT x FROM t ORDER BY x").fetchall()
    assert rows == [(1,), (2,)]
    conn.close()


def test_the_copy_is_named_by_prefix_and_utc_time_and_only_the_owner_can_read_it(tmp_path):
    make_db(tmp_path / "binder.db").close()
    out = b.backup(tmp_path / "binder.db", tmp_path / "d", "deploy", now=NOW)
    assert out.name == "deploy-20261117T033000123456Z.db"
    assert out.stat().st_mode & 0o777 == 0o600
    assert [p.name for p in (tmp_path / "d").iterdir()] == [out.name]


def test_a_missing_database_is_an_error_and_is_not_created(tmp_path):
    with pytest.raises(FileNotFoundError):
        b.backup(tmp_path / "none.db", tmp_path / "d", "nightly")
    assert not (tmp_path / "none.db").exists()


def test_keep_days_removes_only_copies_older_than_that(tmp_path):
    for days in (0, 29, 31, 40):
        (tmp_path / stamp_name("nightly", NOW - timedelta(days=days))).write_bytes(b"")
    (tmp_path / stamp_name("deploy", NOW - timedelta(days=90))).write_bytes(b"")
    (tmp_path / "notes.txt").write_text("not a copy")
    removed = b.prune(tmp_path, "nightly", keep_days=30, now=NOW)
    assert sorted(p.name for p in removed) == sorted(
        stamp_name("nightly", NOW - timedelta(days=d)) for d in (31, 40))
    left = sorted(p.name for p in tmp_path.iterdir())
    assert stamp_name("deploy", NOW - timedelta(days=90)) in left
    assert "notes.txt" in left
    assert len(left) == 4


def test_keep_n_keeps_the_newest_n(tmp_path):
    for hours in range(5):
        (tmp_path / stamp_name("deploy", NOW - timedelta(hours=hours))).write_bytes(b"")
    b.prune(tmp_path, "deploy", keep=2, now=NOW)
    assert sorted(p.name for p in tmp_path.iterdir()) == sorted(
        stamp_name("deploy", NOW - timedelta(hours=h)) for h in (0, 1))


def test_the_command_prints_the_copy_and_prunes(tmp_path, capsys):
    make_db(tmp_path / "binder.db").close()
    old = tmp_path / "n" / stamp_name("nightly", datetime.now(timezone.utc) - timedelta(days=60))
    old.parent.mkdir()
    old.write_bytes(b"")
    rc = b.main([str(tmp_path / "binder.db"), str(tmp_path / "n"), "--prefix", "nightly", "--keep-days", "30"])
    assert rc == 0
    printed = capsys.readouterr().out.strip()
    assert os.path.isfile(printed) and printed.startswith(str(tmp_path / "n" / "nightly-"))
    assert not old.exists()


def test_the_command_exits_2_without_a_database(tmp_path, capsys):
    assert b.main([str(tmp_path / "none.db"), str(tmp_path / "n")]) == 2
    assert "no database" in capsys.readouterr().err
