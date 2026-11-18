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

/** A stage that starts folded the first time: one that is closed for good or parked. */
export const FOLDED_BY_DEFAULT = new Set(['lost', 'parked'])
