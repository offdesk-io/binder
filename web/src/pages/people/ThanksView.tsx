import { Alert, ColumnEmpty, Input } from '@tiagopedras/tenon'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Thanks, ThanksItem, ThanksPut } from '../../api/types'
import { KindTag } from '../../components/KindTag'
import { Loading } from '../../components/Loading'
import { todayIso } from '../../lib/format'
import { orNull, saveErrorText } from '../../lib/forms'
import { useApi } from '../../lib/useApi'

/** The years the checklist offers: this one and the two before. */
export function years(now: Date = new Date()): number[] {
  const y = now.getFullYear()
  return [y, y - 1, y - 2]
}

type Change = Omit<ThanksPut, 'updated_at'>

interface LineProps {
  year: number
  item: ThanksItem
  onSaved: (t: Thanks | null) => void
}

/** One key person's line: who and where to send it, what, whether it went, and a note. Each change saves on its own. */
function ThanksLine({ year, item, onSaved }: LineProps) {
  const p = item.person
  const t = item.thanks
  const [what, setWhat] = useState(t?.what ?? '')
  const [note, setNote] = useState(t?.note ?? '')
  const [error, setError] = useState<string>()
  // A change made while a save is in flight waits here and goes out after it, on the row the save returned.
  const inflight = useRef(false)
  const pending = useRef<Change>({})
  const stamp = useRef<string | null>(null)
  if (!inflight.current) stamp.current = t?.updated_at ?? null

  async function save(change: Change) {
    pending.current = { ...pending.current, ...change }
    if (inflight.current) return
    inflight.current = true
    setError(undefined)
    try {
      while (Object.keys(pending.current).length > 0) {
        const next = pending.current
        pending.current = {}
        try {
          const saved = await api.putThanks(p.id, year, { ...next, updated_at: stamp.current })
          stamp.current = saved.updated_at
          onSaved(saved)
        } catch (e) {
          pending.current = {}
          setError(saveErrorText(e))
          if (e instanceof ApiError && e.status === 409) {
            const current = (e.current ?? null) as Thanks | null
            stamp.current = current?.updated_at ?? null
            onSaved(current)
            setWhat(current?.what ?? '')
            setNote(current?.note ?? '')
          }
        }
      }
    } finally {
      inflight.current = false
    }
  }

  /** A text field saves when it loses focus, and only when it changed. */
  function leave(k: 'what' | 'note', value: string) {
    const next = orNull(value)
    if (next === (t?.[k] ?? null)) return
    void save(k === 'what' ? { what: next } : { note: next })
  }

  return (
    <li className="tn-custom-thanks-line">
      <div>
        <div className="tn-custom-stage-line">
          <Link to={`/c/${p.id}`}>{p.name}</Link>
          {p.referrer ? <KindTag kind="referrer" /> : <span className="tn-custom-faint">{p.org_name}</span>}
        </div>
        <div className={`tenon-caption tn-custom-address${p.postal_address ? '' : ' tn-custom-faint'}`}>
          {p.postal_address ?? 'No postal address yet'}
        </div>
      </div>
      <Input aria-label={`What for ${p.name}`} placeholder="What" value={what} maxLength={200}
        onChange={(e) => setWhat(e.target.value)} onBlur={() => leave('what', what)} />
      <label className="tn-custom-check">
        <input type="checkbox" aria-label={`Sent to ${p.name}`} checked={!!t?.sent_on}
          onChange={(e) => void save({ sent_on: e.target.checked ? todayIso() : null })} />
        Sent
      </label>
      <Input aria-label={`Note for ${p.name}`} placeholder="Note" value={note} maxLength={2000}
        onChange={(e) => setNote(e.target.value)} onBlur={() => leave('note', note)} />
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  )
}

/** The year-end checklist for `year`: every key person, what they get, and whether it has gone. */
export function ThanksView({ year }: { year: number }) {
  const list = useApi(() => api.thanks(year), [year])
  const items = list.data ?? []
  const sent = items.filter((r) => r.thanks?.sent_on).length
  const replace = (contactId: number, t: Thanks | null) =>
    list.setData((prev) => (prev ?? []).map((r) => (r.person.id === contactId ? { ...r, thanks: t } : r)))

  if (list.error) return <Alert tone="error">{list.error.message}</Alert>
  if (!list.data) return <Loading />
  if (items.length === 0) {
    return <ColumnEmpty>No key people yet. Star someone as a key connector on their page, or add a referrer.</ColumnEmpty>
  }
  return (
    <div className="tn-stack">
      <p className="tenon-caption tn-custom-muted">{sent} of {items.length} sent</p>
      <ul className="tn-custom-rows">
        {items.map((r) => (
          <ThanksLine key={`${year}:${r.person.id}`} year={year} item={r} onSaved={(t) => replace(r.person.id, t)} />
        ))}
      </ul>
    </div>
  )
}
