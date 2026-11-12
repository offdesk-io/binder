-- Research briefs, append only: each run is a row. A person's brief keeps its
-- organisation's id too, so deleting the organisation removes it, and search
-- can join it to the organisation like every other item.
CREATE TABLE research (
  id             INTEGER PRIMARY KEY,
  org_id         INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  contact_id     INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  status         TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  brief          TEXT,
  sources        TEXT,
  model          TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  web_searches   INTEGER,
  error          TEXT,
  run_at         TEXT NOT NULL,
  finished_at    TEXT,
  author_email   TEXT NOT NULL
);
CREATE INDEX research_org ON research(org_id, run_at);
CREATE INDEX research_contact ON research(contact_id, run_at);

-- One running run per organisation brief and one per person. The repo checks
-- first and answers 409; these are the backstop.
CREATE UNIQUE INDEX research_one_running_org ON research(org_id)
  WHERE status = 'running' AND contact_id IS NULL;
CREATE UNIQUE INDEX research_one_running_contact ON research(contact_id)
  WHERE status = 'running' AND contact_id IS NOT NULL;

-- A brief is searchable once its run is done. Runs never change after that.
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
CREATE TRIGGER research_ad AFTER DELETE ON research BEGIN
  DELETE FROM search WHERE kind = 'research' AND ref_id = old.id;
END;
