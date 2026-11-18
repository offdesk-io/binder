import type { DropdownOption } from '@tiagopedras/tenon'
import { useSearchParams } from 'react-router-dom'
import type { Org } from '../api/types'
import { person } from './format'

/** '' is everyone, 'none' is organisations without an owner, anything else is an owner's email. */
export type OwnerValue = string

/** The owner filter in the address, as ?owner=. Changing it replaces the entry, so Back leaves the page rather than stepping through filters. */
export function useOwnerFilter(): [OwnerValue, (v: OwnerValue) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get('owner') ?? ''
  const set = (v: OwnerValue) => {
    const p = new URLSearchParams(params)
    if (v) p.set('owner', v)
    else p.delete('owner')
    setParams(p, { replace: true })
  }
  return [value, set]
}

/** The organisations one owner choice stands for. */
export function byOwner(orgs: Org[], value: OwnerValue): Org[] {
  if (!value) return orgs
  if (value === 'none') return orgs.filter((o) => !o.owner_email)
  return orgs.filter((o) => o.owner_email === value)
}

/** The Owner dropdown's options: Any owner, Me (when I own any), every other owner by name, No owner (when any has none). */
export function ownerOptions(orgs: Org[], me: string, active?: OwnerValue): DropdownOption[] {
  const owners = new Set(orgs.map((o) => o.owner_email ?? 'none'))
  const others = Array.from(owners)
    .filter((k) => k !== 'none' && k !== me)
    .map((k) => ({ value: k, label: person(k) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const options: DropdownOption[] = [
    { value: '', label: 'Any owner' },
    ...(owners.has(me) ? [{ value: me, label: 'Me' }] : []),
    ...others,
    ...(owners.has('none') ? [{ value: 'none', label: 'No owner' }] : []),
  ]
  // An active owner nobody matches (an old link) is still listed, so the filter shows.
  if (active && !options.some((o) => o.value === active)) options.push({ value: active, label: person(active) })
  return options
}
