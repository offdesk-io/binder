-- One line per erasure of a person's data (binder/repo/subject.py): when, by
-- whom and how much, never what was erased.
CREATE TABLE erasures (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL,
  by            TEXT NOT NULL,
  contacts      INTEGER NOT NULL,
  interactions  INTEGER NOT NULL,
  what          TEXT NOT NULL
);
