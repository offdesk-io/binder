-- Binder 7: partners, people without an organisation, key connectors and
-- year-end thanks. Rebuilds organisations, contacts and interactions. A rebuild
-- drops a table's indexes and triggers, so every one of them is recreated
-- below. research_au reads contacts, and a table cannot be renamed while a
-- trigger names a table that is missing, so it is dropped first and recreated
-- at the end.

DROP TRIGGER research_au;

CREATE TABLE organisations_new (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  website        TEXT,
  sector         TEXT,
  size           TEXT,
  location       TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('lead','client','partner')),
  status         TEXT NOT NULL,
  owner_email    TEXT,
  source         TEXT,
  value_estimate REAL,
  tags           TEXT NOT NULL DEFAULT '[]',
  summary        TEXT,
  next_step      TEXT,
  next_step_due  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL,
  -- Who brought it in: one person or one partner, at most. The repo checks
  -- that introduced_by_org_id is a partner and not the organisation itself.
  introduced_by_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  introduced_by_org_id     INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
  CHECK (introduced_by_contact_id IS NULL OR introduced_by_org_id IS NULL)
);
INSERT INTO organisations_new (id, slug, name, website, sector, size, location, kind, status, owner_email, source,
                               value_estimate, tags, summary, next_step, next_step_due, created_at, updated_at, updated_by)
  SELECT id, slug, name, website, sector, size, location, kind, status, owner_email, source,
         value_estimate, tags, summary, next_step, next_step_due, created_at, updated_at, updated_by
  FROM organisations;
DROP TABLE organisations;
ALTER TABLE organisations_new RENAME TO organisations;
CREATE INDEX organisations_introduced_contact ON organisations(introduced_by_contact_id);
CREATE INDEX organisations_introduced_org ON organisations(introduced_by_org_id);

-- A person's organisation is optional. Deleting an organisation keeps its
-- people (the repo clears their primary flag first): someone with no
-- organisation cannot be the one to talk to.
CREATE TABLE contacts_new (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER REFERENCES organisations(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  role           TEXT,
  email          TEXT,
  phone          TEXT,
  linkedin_url   TEXT,
  notes          TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  relationship   TEXT CHECK (relationship IN ('cold','warm','strong')),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL,
  connector      INTEGER NOT NULL DEFAULT 0 CHECK (connector IN (0,1)),
  postal_address TEXT,
  CHECK (org_id IS NOT NULL OR is_primary = 0)
);
INSERT INTO contacts_new (id, org_id, name, role, email, phone, linkedin_url, notes, is_primary, relationship,
                          created_at, updated_at, updated_by)
  SELECT id, org_id, name, role, email, phone, linkedin_url, notes, is_primary, relationship,
         created_at, updated_at, updated_by
  FROM contacts;
DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;
CREATE INDEX contacts_org ON contacts(org_id);
CREATE UNIQUE INDEX contacts_one_primary ON contacts(org_id) WHERE is_primary = 1;

-- A log may have no organisation: a call with a person who has none. The repo
-- makes sure it then has at least one person.
CREATE TABLE interactions_new (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER REFERENCES organisations(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('call','email','meeting','note')),
  happened_at    TEXT NOT NULL,
  summary        TEXT NOT NULL,
  next_step      TEXT,
  next_step_due  TEXT,
  author_email   TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);
INSERT INTO interactions_new (id, org_id, type, happened_at, summary, next_step, next_step_due, author_email,
                              created_at, updated_at, updated_by)
  SELECT id, org_id, type, happened_at, summary, next_step, next_step_due, author_email,
         created_at, updated_at, updated_by
  FROM interactions;
DROP TABLE interactions;
ALTER TABLE interactions_new RENAME TO interactions;
CREATE INDEX interactions_org ON interactions(org_id, happened_at);

-- Year-end thanks: one row per person and year.
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

-- The search triggers, as 001 and 003 left them. A person or a log with no
-- organisation is indexed with a null org_id.
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

CREATE TRIGGER contact_ai AFTER INSERT ON contacts BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('contact', new.id, new.org_id, new.name,
    coalesce(new.role,'') || ' ' || coalesce(new.email,'') || ' ' || coalesce(new.notes,''));
END;
CREATE TRIGGER contact_au AFTER UPDATE ON contacts BEGIN
  DELETE FROM search WHERE kind = 'contact' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('contact', new.id, new.org_id, new.name,
    coalesce(new.role,'') || ' ' || coalesce(new.email,'') || ' ' || coalesce(new.notes,''));
END;
CREATE TRIGGER contact_ad AFTER DELETE ON contacts BEGIN
  DELETE FROM search WHERE kind = 'contact' AND ref_id = old.id;
END;

CREATE TRIGGER interaction_ai AFTER INSERT ON interactions BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || substr(new.happened_at, 1, 10), new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_au AFTER UPDATE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || substr(new.happened_at, 1, 10), new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_ad AFTER DELETE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
END;

-- As 004 wrote it.
CREATE TRIGGER research_au AFTER UPDATE OF status ON research WHEN new.status = 'done' BEGIN
  DELETE FROM search WHERE kind = 'research' AND ref_id = new.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('research', new.id, new.org_id,
    CASE WHEN new.contact_id IS NULL THEN 'Research brief'
         ELSE 'Research brief: ' || coalesce((SELECT name FROM contacts WHERE id = new.contact_id), '') END,
    coalesce(json_extract(new.brief, '$.overview'), '') || ' ' ||
    coalesce(json_extract(new.brief, '$.what_they_do'), '') || ' ' ||
    coalesce(json_extract(new.brief, '$.size_and_funding'), '') || ' ' ||
    coalesce(json_extract(new.brief, '$.offdesk_angle'), '') || ' ' ||
    coalesce((SELECT group_concat(value, ' ') FROM json_each(new.brief, '$.likely_needs')), '') || ' ' ||
    coalesce((SELECT group_concat(value, ' ') FROM json_each(new.brief, '$.open_questions')), '') || ' ' ||
    coalesce((SELECT group_concat(coalesce(json_extract(value, '$.name'), '') || ' ' ||
                                  coalesce(json_extract(value, '$.role'), ''), ' ')
              FROM json_each(new.brief, '$.people')), '') || ' ' ||
    coalesce((SELECT group_concat(json_extract(value, '$.headline'), ' ')
              FROM json_each(new.brief, '$.recent_news')), ''));
END;
