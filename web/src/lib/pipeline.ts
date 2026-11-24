import type { Org } from '../api/types'

export interface Stage {
  status: string
  orgs: Org[]
  /** The stage's value: the sum of its organisations' estimates, none counting as nothing. */
  total: number
}

/** Due date first (an ISO day sorts as text, so overdue comes first), then the undated ones, each by name. */
function byDueThenName(a: Org, b: Org): number {
  if (a.next_step_due && b.next_step_due && a.next_step_due !== b.next_step_due) return a.next_step_due < b.next_step_due ? -1 : 1
  if (!!a.next_step_due !== !!b.next_step_due) return a.next_step_due ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Open leads by stage, in the given order; each stage's rows by next-step due date (overdue first), then undated by
 * name. An organisation whose status is not in the list is left out. */
export function stages(orgs: Org[], statuses: string[]): Stage[] {
  return statuses.map((status) => {
    const mine = orgs.filter((o) => o.status === status).sort(byDueThenName)
    return { status, orgs: mine, total: mine.reduce((sum, o) => sum + (o.value_estimate ?? 0), 0) }
  })
}

/** A stage that starts folded the first time, and sits muted on the Board: one that is closed for good, parked or
 * paused. */
export const FOLDED_BY_DEFAULT = new Set(['lost', 'parked', 'paused'])

/** The Won stage at the end of the Leads Board: every client that was ever won, in the order given (newest first). */
export function wonStage(clients: Org[]): Stage {
  return { status: 'won', orgs: clients, total: clients.reduce((sum, o) => sum + (o.value_estimate ?? 0), 0) }
}

/** Take back a move to Won that failed to save: the lead comes back as it was, if the list still holds the copy that
 * was shown as won. */
export function undoWon(list: Org[] | undefined, was: Org, shown: Org): Org[] {
  const rest = list ?? []
  const now = rest.find((o) => o.id === was.id)
  if (!now || now.kind !== 'client' || now.won_at !== shown.won_at) return rest
  return rest.map((o) => (o.id === was.id ? was : o))
}

/** Take back a move that failed to save: the copy now in the list keeps whatever else changed meanwhile (a drawer
 * save, say), and only the status goes back, and only if nobody has moved it since. A record no longer in the list
 * stays out. */
export function undoMove(list: Org[] | undefined, was: Org, movedTo: string): Org[] {
  const rest = list ?? []
  const now = rest.find((o) => o.id === was.id)
  if (!now || now.status !== movedTo) return rest
  return rest.map((o) => (o.id === was.id ? { ...now, status: was.status } : o))
}
