-- A referrer's own contact, tracked by id so renaming the referrer renames that contact and never whichever
-- one happens to be primary at the time. Existing referrers point at their primary contact today, which is the one
-- that was created for them or the primary when they became referrers. ALTER keeps the table and its search
-- triggers as they are.
ALTER TABLE organisations ADD COLUMN person_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;

UPDATE organisations
   SET person_contact_id = (SELECT c.id FROM contacts c WHERE c.org_id = organisations.id AND c.is_primary = 1)
 WHERE kind = 'referrer';

-- A referrer is a person and has no sector: clear any an older save left, so no sector label shows on one.
UPDATE organisations SET sector = NULL WHERE kind = 'referrer' AND sector IS NOT NULL;
