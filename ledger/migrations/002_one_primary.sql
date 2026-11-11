-- Databases from before this rule may hold several primaries in one organisation: keep the oldest.
UPDATE contacts SET is_primary = 0
 WHERE is_primary = 1 AND id NOT IN (SELECT min(id) FROM contacts WHERE is_primary = 1 GROUP BY org_id);

CREATE UNIQUE INDEX contacts_one_primary ON contacts(org_id) WHERE is_primary = 1;
