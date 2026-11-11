CREATE UNIQUE INDEX contacts_one_primary ON contacts(org_id) WHERE is_primary = 1;
