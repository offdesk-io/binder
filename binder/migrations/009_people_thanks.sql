-- Key people and year-end thanks. A contact can be starred as a key connector
-- and carry a postal address; `thanks` holds one row per person and year,
-- saying what was sent and when. Additive only: ALTER keeps the contacts table
-- and its search triggers as they are.
ALTER TABLE contacts ADD COLUMN connector INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0,1));
ALTER TABLE contacts ADD COLUMN postal_address TEXT;

CREATE TABLE thanks (
  id          INTEGER PRIMARY KEY,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  what        TEXT,
  sent_on     TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  UNIQUE (contact_id, year)
);
CREATE INDEX thanks_year ON thanks(year);
