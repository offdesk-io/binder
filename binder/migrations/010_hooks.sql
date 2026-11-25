-- Events for the Offdesk core (binder/hooks.py). A row is queued in the same
-- transaction as the change that caused it; a background thread sends it.
-- next_at is when to try next, null once sent or given up.
CREATE TABLE hook_queue (
  id          INTEGER PRIMARY KEY,
  event       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  tries       INTEGER NOT NULL DEFAULT 0,
  next_at     TEXT,
  sent_at     TEXT,
  error       TEXT
);
CREATE INDEX hook_queue_due ON hook_queue(next_at) WHERE next_at IS NOT NULL;
