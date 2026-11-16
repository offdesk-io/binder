# Binder improvements

Ideas for Binder that are written down and not built. Small ones fit in one sitting, big ones need a plan.

## Small

- **Record partners, referrers and advisers.** Binder holds only leads and clients: `KINDS = ("lead", "client")` in `/Users/tiagopedras/Code/offdesk-io/binder/binder/statuses.py:9`, enforced by the `kind` CHECK at `/Users/tiagopedras/Code/offdesk-io/binder/binder/migrations/001_init.sql:9`. People and companies that bring leads or advise without buying (a partner company, someone paid an introduction fee, an adviser) have nowhere to go, so they were left out of the first import. Proposal: a `role` tag on the organisation (partner, referrer, adviser) kept apart from `kind`, so they appear in search and on contacts without entering the lead pipeline or its statuses. A contact's `relationship` (cold, warm, strong, `001_init.sql:33`) says how close someone is, not what they are to us, so it cannot carry this. Open: whether referrers need the lead-fee terms (7% for an introduction, 10% if they help close) stored beside them.

## Big

Nothing yet.
