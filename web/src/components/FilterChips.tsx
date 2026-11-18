export interface Chip<V extends string = string> {
  value: V
  label: string
  count: number
}

interface Props<V extends string> {
  label: string
  chips: Chip<V>[]
  value: V
  onChange: (v: V) => void
}

/** A row of toggle chips with counts, in the shape of Bench's bucket strip. One is pressed: the one matching `value`. */
export function FilterChips<V extends string>({ label, chips, value, onChange }: Props<V>) {
  return (
    <div className="tn-custom-pill tn-custom-chips" role="group" aria-label={label}>
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
