import type { Owner } from '../api/types'
import { initials, person } from './format'

/** Who a record is handled by, by name: from the team list when they are on it, else the name part of their email. */
export function ownerName(owners: Owner[], email: string | null | undefined): string {
  if (!email) return 'Nobody'
  return owners.find((o) => o.email === email)?.name ?? person(email)
}

/** Up to two capitals from the owner's name when it is known (Ana Silva is AS), else from their email. */
export function ownerInitials(owners: Owner[], email: string | null | undefined): string {
  const name = email ? owners.find((o) => o.email === email)?.name : undefined
  if (!name) return initials(email)
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}
