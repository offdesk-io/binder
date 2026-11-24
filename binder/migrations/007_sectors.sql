-- Sector becomes a fixed list (binder/statuses.py SECTORS). The free text it
-- held until now moves to `description`, "What they do" (or, for a referrer,
-- where they work), and a sector is kept only where the text already is one
-- of the list's keys. Matching old texts to sectors is left to a one-off
-- script run on the server, so no organisation's text lives in this repo.
DROP TRIGGER org_ai;
DROP TRIGGER org_au;

ALTER TABLE organisations ADD COLUMN description TEXT;

UPDATE organisations SET description = sector WHERE sector IS NOT NULL;
UPDATE organisations SET sector = NULL
 WHERE sector NOT IN ('manufacturing','consulting','technology','retail_ecommerce','healthcare',
                      'construction_installations');

CREATE TRIGGER org_ai AFTER INSERT ON organisations BEGIN
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('org', new.id, new.id, new.name,
    coalesce(new.summary,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.sector,'') || ' ' ||
    new.tags || ' ' || coalesce(new.next_step,'') || ' ' || coalesce(new.website,'') || ' ' ||
    coalesce(new.location,''));
END;
CREATE TRIGGER org_au AFTER UPDATE ON organisations BEGIN
  DELETE FROM search WHERE kind = 'org' AND ref_id = old.id;
  INSERT INTO search(kind, ref_id, org_id, title, body) VALUES ('org', new.id, new.id, new.name,
    coalesce(new.summary,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.sector,'') || ' ' ||
    new.tags || ' ' || coalesce(new.next_step,'') || ' ' || coalesce(new.website,'') || ' ' ||
    coalesce(new.location,''));
END;

DELETE FROM search WHERE kind = 'org';
INSERT INTO search(kind, ref_id, org_id, title, body)
  SELECT 'org', id, id, name,
    coalesce(summary,'') || ' ' || coalesce(description,'') || ' ' || coalesce(sector,'') || ' ' ||
    tags || ' ' || coalesce(next_step,'') || ' ' || coalesce(website,'') || ' ' || coalesce(location,'')
  FROM organisations;
