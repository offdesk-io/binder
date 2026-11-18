import { useSearchParams } from 'react-router-dom'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { person } from '../lib/format'

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

/** The organisations one owner chip stands for. */
export function byOwner(orgs: Org[], value: OwnerValue): Org[] {
  if (!value) return orgs
  if (value === 'none') return orgs.filter((o) => !o.owner_email)
  return orgs.filter((o) => o.owner_email === value)
}

interface Props {
  /** Every organisation the page could show, before this filter: the counts come from here. */
  orgs: Org[]
  value: OwnerValue
  onChange: (v: OwnerValue) => void
}

/**
 * A row of owner chips with counts, in the shape of Bench's bucket strip: All, Me, every other owner by name, and No
 * owner when any organisation has none. Each chip is a toggle button.
 */
export function OwnerChips({ orgs, value, onChange }: Props) {
  const { me } = useSession()
  const counts = new Map<string, number>()
  for (const o of orgs) {
    const k = o.owner_email ?? 'none'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const others = Array.from(counts.keys())
    .filter((k) => k !== 'none' && k !== me.email)
    .sort((a, b) => person(a).localeCompare(person(b)))
  // An active owner nobody matches (an old link, or the other filters leave none) still gets its chip, so the filter shows.
  const stray = value && !counts.has(value) ? [{ value, label: value === 'none' ? 'No owner' : person(value), count: 0 }] : []
  const chips: { value: OwnerValue; label: string; count: number }[] = [
    { value: '', label: 'All', count: orgs.length },
    ...(counts.has(me.email) ? [{ value: me.email, label: 'Me', count: counts.get(me.email)! }] : []),
    ...others.map((k) => ({ value: k, label: person(k), count: counts.get(k)! })),
    ...(counts.has('none') ? [{ value: 'none', label: 'No owner', count: counts.get('none')! }] : []),
    ...stray,
  ]
  return (
    <div className="tn-custom-pill tn-custom-chips" role="group" aria-label="Owner">
      {chips.map((c) => (
        <button
          key={c.value || 'all'}
          type="button"
          className="tn-custom-pill-tab"
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
        >
          {c.label}
          <span className="tn-custom-chip-count">{c.count}</span>
        </button>
      ))}
    </div>
  )
}
