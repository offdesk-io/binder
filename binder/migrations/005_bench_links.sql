-- A cache of the Bench tasks that carry [lead:: <slug>]. Bench's todo.md is
-- the source of truth; each refresh replaces one board's rows in full.
CREATE TABLE bench_links (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  board TEXT NOT NULL,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  -- Finished work only. A cancelled task is `cancelled` and not `done`.
  cancelled INTEGER NOT NULL DEFAULT 0,
  -- The day it was finished, or for a cancelled task the day it was decided against.
  done_on TEXT,
  due TEXT,
  assignee TEXT,
  fetched_at TEXT NOT NULL,
  UNIQUE (board, task_key)
);
CREATE INDEX bench_links_org ON bench_links(org_id);

-- One row per board: when it was last read, and the last error (null when the last read worked).
CREATE TABLE bench_sync (
  board TEXT PRIMARY KEY,
  fetched_at TEXT,
  error TEXT
);
