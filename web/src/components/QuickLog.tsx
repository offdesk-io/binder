import { Alert, Button, Field, Modal, SegmentedControl, ToggleChip } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, Interaction, InteractionFields } from '../api/types'
import { useSession } from '../app/session'
import { fromLocalInput, label, toLocalInput } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useIsPhone } from '../lib/useIsPhone'
import { ConfirmDelete } from './ConfirmDelete'

/** What the form needs from an interaction. A timeline item has all of it. */
export type Loggable = Pick<
  Interaction,
  'id' | 'updated_at' | 'type' | 'summary' | 'happened_at' | 'next_step' | 'next_step_due' | 'contact_ids'
>

export interface LogFormState {
  type: string
  when: string
  contact_ids: number[]
  summary: string
  next_step: string
  next_step_due: string
}

export function logForm(i?: Loggable, preselect: number[] = [], now: Date = new Date(), type = 'call'): LogFormState {
  return {
    type: i?.type ?? type,
    when: toLocalInput(i?.happened_at ?? now.toISOString()),
    contact_ids: i?.contact_ids ?? preselect,
    summary: text(i?.summary),
    next_step: text(i?.next_step),
    next_step_due: text(i?.next_step_due),
  }
}

/** The form has minutes only; an untouched time keeps the stored one exactly. */
export function logBody(f: LogFormState, base?: Loggable): InteractionFields {
  const sameTime = base && f.when === toLocalInput(base.happened_at)
  return {
    type: f.type,
    summary: f.summary.trim(),
    happened_at: sameTime ? base.happened_at : fromLocalInput(f.when),
    contact_ids: sorted(f.contact_ids),
    next_step: orNull(f.next_step),
    next_step_due: f.next_step_due || null,
  }
}

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b)

interface Props {
  open: boolean
  orgId: number
  /** Undefined while the list is still loading: nobody is dropped until it is known. */
  contacts: Contact[] | undefined
  /** Left out to log something new. */
  initial?: Loggable
  /** People ticked on a new log, such as the contact whose page it was opened from. */
  preselect?: number[]
  onClose: () => void
  onSaved: () => void
}

export function QuickLog({ open, orgId, contacts, initial, preselect, onClose, onSaved }: Props) {
  const { meta } = useSession()
  const phone = useIsPhone()
  const first = meta.interaction_types[0]
  const people = contacts ?? []
  const [base, setBase] = useState(initial)
  const [form, setForm] = useState(() => logForm(initial, preselect, new Date(), first))
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<{ when?: string; summary?: string }>({})
  const [busy, setBusy] = useState(false)

  // Reset on open. `preselect` is left out on purpose: callers pass a new array each render.
  useEffect(() => {
    if (!open) return
    setBase(initial)
    setForm(logForm(initial, preselect, new Date(), first))
    setError(undefined)
    setFieldErrors({})
  }, [open, initial, first])

  const set = (k: 'when' | 'summary' | 'next_step' | 'next_step_due') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggle = (id: number) =>
    setForm((f) => ({
      ...f,
      contact_ids: f.contact_ids.includes(id) ? f.contact_ids.filter((c) => c !== id) : [...f.contact_ids, id],
    }))

  async function save() {
    if (busy) return
    const problems: { when?: string; summary?: string } = {}
    if (!form.summary.trim()) problems.summary = 'Say what happened.'
    if (!form.when || Number.isNaN(new Date(form.when).getTime())) problems.when = 'Say when it happened.'
    setFieldErrors(problems)
    if (problems.summary || problems.when) return
    const body = logBody(form, base)
    // A person deleted since the log was written has no chip to untick, so drop them now,
    // against the list as it stands. While it is still loading, keep everyone.
    if (contacts) {
      const known = new Set(contacts.map((c) => c.id))
      body.contact_ids = body.contact_ids.filter((id) => known.has(id))
    }
    setBusy(true)
    setError(undefined)
    try {
      if (base) {
        const diff = changed<InteractionFields>({ ...base, contact_ids: sorted(base.contact_ids) }, body)
        if (Object.keys(diff).length > 0) await api.patchInteraction(base.id, { ...diff, updated_at: base.updated_at })
      } else {
        await api.createInteraction(orgId, body)
      }
      onSaved()
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Interaction
        setBase(current)
        setForm(logForm(current))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base || busy) return
    setBusy(true)
    try {
      await api.deleteInteraction(base.id)
      onSaved()
    } catch (e) {
      setError(saveErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={base ? 'Edit log' : 'Log'}
      size="md"
      className={phone ? 'lg-sheet' : undefined}
      onSubmit={() => void save()}
      footer={
        <>
          {base && <ConfirmDelete what="log" onConfirm={() => void remove()} />}
          <span className="lg-grow" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="log-form" className="lg-form" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="lg-field">
          <span className="tenon-label">Type</span>
          <SegmentedControl
            aria-label="Type"
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
            options={meta.interaction_types.map((t) => ({ value: t, label: label(t) }))}
          />
        </div>
        <Field label="When" type="datetime-local" required error={fieldErrors.when} value={form.when} onChange={set('when')} />
        {people.length > 0 && (
          <div className="lg-field">
            <span className="tenon-label">With</span>
            <div className="lg-chips" role="group" aria-label="With">
              {people.map((c) => (
                <ToggleChip key={c.id} pressed={form.contact_ids.includes(c.id)} onClick={() => toggle(c.id)}>
                  {c.name}
                </ToggleChip>
              ))}
            </div>
          </div>
        )}
        <Field label="What happened" multiline rows={4} required error={fieldErrors.summary} value={form.summary} onChange={set('summary')} autoFocus />
        <Field label="Next step" value={form.next_step} onChange={set('next_step')} />
        <Field label="Next step due" type="date" value={form.next_step_due} onChange={set('next_step_due')} />
      </form>
    </Modal>
  )
}
