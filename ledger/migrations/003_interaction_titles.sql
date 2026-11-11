-- An interaction's search title is its type and day, not the full timestamp,
-- so time digits do not match a query.
DROP TRIGGER interaction_ai;
DROP TRIGGER interaction_au;

CREATE TRIGGER interaction_ai AFTER INSERT ON interactions BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || substr(new.happened_at, 1, 10), new.summary || ' ' || coalesce(new.next_step,''));
END;
CREATE TRIGGER interaction_au AFTER UPDATE ON interactions BEGIN
  DELETE FROM search WHERE kind = 'interaction' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('interaction', new.id, new.org_id,
    new.type || ' ' || substr(new.happened_at, 1, 10), new.summary || ' ' || coalesce(new.next_step,''));
END;

DELETE FROM search WHERE kind = 'interaction';
INSERT INTO search(kind, ref_id, org_id, title, body)
  SELECT 'interaction', id, org_id, type || ' ' || substr(happened_at, 1, 10),
         summary || ' ' || coalesce(next_step,'')
  FROM interactions;
