import { Alert, ColumnEmpty, Dropdown, Input } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Thanks, ThanksPut, ThanksRow } from '../../api/types'
import { Loading } from '../../components/Loading'
import { todayIso } from '../../lib/format'
import { orNull, saveErrorText } from '../../lib/forms'
import { useApi } from '../../lib/useApi'

/** The years the checklist offers: this one and the two before. */
export function years(now: Date = new Date()): number[] {
  const y = now.getFullYear()
  return [y, y - 1, y - 2]
}

interface LineProps {
  year: number
  row: ThanksRow
  onSaved: (t: Thanks | null) => void
}

/** One connector's line: who and where to send it, what, whether it went, and a note. Each change saves on its own. */
function ThanksLine({ year, row, onSaved }: LineProps) {
  const c = row.contact
  const t = row.thanks
  const [what, setWhat] = useState(t?.what ?? '')
  const [note, setNote] = useState(t?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save(change: Omit<ThanksPut, 'updated_at'>) {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      onSaved(await api.putThanks(c.id, year, { ...change, updated_at: t?.updated_at ?? null }))
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409) {
        const current = (e.current ?? null) as Thanks | null
        onSaved(current)
        setWhat(current?.what ?? '')
        setNote(current?.note ?? '')
      }
    } finally {
      setBusy(false)
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
      <div className="tn-stack">
        <div className="tn-cluster">
          <Link to={`/c/${c.id}`}>{c.name}</Link>
          {c.org_name && <span className="tn-custom-faint">· {c.org_name}</span>}
        </div>
        <div className="tenon-caption tn-custom-faint tn-custom-address">{c.postal_address ?? 'No postal address yet'}</div>
      </div>
      <Input aria-label={`What for ${c.name}`} placeholder="What" value={what}
        onChange={(e) => setWhat(e.target.value)} onBlur={() => leave('what', what)} />
      <label className="tn-custom-check">
        <input type="checkbox" aria-label={`Sent to ${c.name}`} checked={!!t?.sent_on} disabled={busy}
          onChange={(e) => void save({ sent_on: e.target.checked ? todayIso() : null })} />
        Sent
      </label>
      <Input aria-label={`Note for ${c.name}`} placeholder="Note" value={note}
        onChange={(e) => setNote(e.target.value)} onBlur={() => leave('note', note)} />
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  )
}

/** The year-end checklist: every key connector, what they get, and whether it has gone. */
export function ThanksView() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const list = useApi(() => api.thanks(year), [year])
  const rows = list.data ?? []
  const sent = rows.filter((r) => r.thanks?.sent_on).length
  const replace = (contactId: number, t: Thanks | null) =>
    list.setData((prev) => (prev ?? []).map((r) => (r.contact.id === contactId ? { ...r, thanks: t } : r)))

  return (
    <div className="tn-stack">
      <div className="tn-toolbar">
        <Dropdown className="tn-custom-filter" aria-label="Year" value={String(year)} onChange={(v) => setYear(Number(v))}
          options={years().map((y) => ({ value: String(y), label: String(y) }))} />
        {list.data && rows.length > 0 && <span className="tenon-caption">{sent} of {rows.length} sent</span>}
      </div>
      {list.error ? (
        <Alert tone="error">{list.error.message}</Alert>
      ) : !list.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <ColumnEmpty>No key connectors yet. Star someone on their page to add them here.</ColumnEmpty>
      ) : (
        <ul className="tn-custom-rows">
          {rows.map((r) => (
            <ThanksLine key={`${year}:${r.contact.id}`} year={year} row={r} onSaved={(t) => replace(r.contact.id, t)} />
          ))}
        </ul>
      )}
    </div>
  )
}
