-- Two more kinds of organisation, partner and referrer, and the lead or client
-- each one introduced. Widening the kind CHECK means rebuilding the table,
-- which drops its search triggers, so they are recreated below as 001 wrote them.
CREATE TABLE organisations_new (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  website          TEXT,
  sector           TEXT,
  size             TEXT,
  location         TEXT,
  kind             TEXT NOT NULL CHECK (kind IN ('lead','client','partner','referrer')),
  status           TEXT NOT NULL,
  owner_email      TEXT,
  source           TEXT,
  value_estimate   REAL,
  tags             TEXT NOT NULL DEFAULT '[]',
  summary          TEXT,
  next_step        TEXT,
  next_step_due    TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  updated_by       TEXT NOT NULL,
  -- Set only on a lead or client, and only to a partner or referrer: the repo checks both.
  introduced_by_id INTEGER REFERENCES organisations(id) ON DELETE SET NULL
);

INSERT INTO organisations_new (id, slug, name, website, sector, size, location, kind, status, owner_email,
                               source, value_estimate, tags, summary, next_step, next_step_due,
                               created_at, updated_at, updated_by)
  SELECT id, slug, name, website, sector, size, location, kind, status, owner_email,
         source, value_estimate, tags, summary, next_step, next_step_due,
         created_at, updated_at, updated_by
  FROM organisations;

DROP TABLE organisations;
ALTER TABLE organisations_new RENAME TO organisations;

CREATE INDEX organisations_introduced_by ON organisations(introduced_by_id);

CREATE TRIGGER org_ai AFTER INSERT ON organisations BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('org', new.id, new.id, new.name,
    coalesce(new.summary,'') || ' ' || coalesce(new.sector,'') || ' ' || new.tags || ' ' ||
    coalesce(new.next_step,'') || ' ' || coalesce(new.website,'') || ' ' || coalesce(new.location,''));
END;
CREATE TRIGGER org_au AFTER UPDATE ON organisations BEGIN
  DELETE FROM search WHERE kind = 'org' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('org', new.id, new.id, new.name,
    coalesce(new.summary,'') || ' ' || coalesce(new.sector,'') || ' ' || new.tags || ' ' ||
    coalesce(new.next_step,'') || ' ' || coalesce(new.website,'') || ' ' || coalesce(new.location,''));
END;
CREATE TRIGGER org_ad AFTER DELETE ON organisations BEGIN
  DELETE FROM search WHERE org_id = old.id;
END;
