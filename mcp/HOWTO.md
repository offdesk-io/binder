## Binder: leads, clients, partners and key people

Binder holds the team's record of every organisation it works with or hopes to: leads and clients (the
pipeline), partners and referrers (who introduce work), their contacts, and everything logged with them.
Use it whenever someone asks about a company, a person we know there, where a deal stands, or what
happened last time; and to write down what was just done.

- **Find first.** Every organisation has a slug (`acme-studio`). If you do not know it, call
  `binder.find` with a name or a few words; it also finds organisations through a contact's name or
  something logged. Never guess a slug.
- **Read before you write.** `binder.org` gives the record, its stage, its next step, its contacts
  (each with an id, `#12`) and the last five interactions, and its `updated_at`.
- **Stages.** A lead goes `lead`, `contacted`, `in_conversation`, `proposal_sent`, and then `won`
  (it becomes an active client), `lost` or `parked`. A client is `active`, `paused` or `past`.
  Partners and referrers have their own stages; `binder.pipeline` lists them in order.
- **Writes need the `updated_at` you read.** `binder.move` and `binder.next_step` take the record's
  `updated_at` exactly as `binder.org` showed it. If Binder says it changed since you read it,
  someone else saved it meanwhile: read it again with `binder.org`, check your change still makes
  sense, and use the new `updated_at`. Never retry with the old one.
- **Log what happened.** After a call, an email, a meeting or anything worth keeping, call
  `binder.log` with a short factual summary, the contacts it was with (their ids) and the next step
  if there is one. Write what was said and agreed, not your opinion of it.
- **Next steps.** Each organisation has one next step and a due date. Set it with
  `binder.next_step` when one is agreed or done; clear it with `null`.
- **Key people** (`binder.people`) are the connectors to thank and keep close: people who open doors,
  and each referrer's own person. When one has not been spoken to for a while, say so; when they
  helped, suggest thanking them.
- **No deletes.** Binder's tools never delete anything. If something should go, say so to the person
  and let them do it in Binder.
- **Links from other modules.** A Bench task can point at an organisation with `binder:org/<slug>`; read
  it with `binder.org` and that slug. `binder.ref` is how the core turns such a link into a name; you do
  not need it.
- Binder records every write as the person you act for, or as you when you work for the team.
