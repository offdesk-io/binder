CREATE TABLE organisations (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  website        TEXT,
  sector         TEXT,
  size           TEXT,
  location       TEXT,
  kind           TEXT NOT NULL CHECK (kind IN ('lead','client')),
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
  updated_by     TEXT NOT NULL
);

CREATE TABLE contacts (
  id            INTEGER PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  email         TEXT,
  phone         TEXT,
  linkedin_url  TEXT,
  notes         TEXT,
  is_primary    INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  relationship  TEXT CHECK (relationship IN ('cold','warm','strong')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL
);
CREATE INDEX contacts_org ON contacts(org_id);

CREATE TABLE interactions (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
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
CREATE INDEX interactions_org ON interactions(org_id, happened_at);

CREATE TABLE interaction_contacts (
  interaction_id INTEGER NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  contact_id     INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, contact_id)
);

CREATE INDEX interaction_contacts_contact ON interaction_contacts(contact_id);

CREATE TABLE status_history (
  id           INTEGER PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  at           TEXT NOT NULL,
  by_email     TEXT NOT NULL
);
CREATE INDEX status_history_org ON status_history(org_id, at);

-- ref_id and org_id are stored as integers; always bind ints when querying them.
CREATE VIRTUAL TABLE search USING fts5(
  kind UNINDEXED, ref_id UNINDEXED, org_id UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

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
    new.type || ' ' || new.happened_at, new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_au AFTER UPDATE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || new.happened_at, new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_ad AFTER DELETE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
END;
