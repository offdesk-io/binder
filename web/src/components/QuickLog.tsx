import { Alert, Button, Field, Modal, SegmentedControl, ToggleChip } from '@tiagopedras/tenon'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, Interaction, InteractionFields, Summary } from '../api/types'
import { useSession } from '../app/session'
import { typeColour } from '../lib/colour'
import { fromLocalInput, label, toLocalInput } from '../lib/format'
import { ColourDot } from './ColourTag'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
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

/** The form after a summary: the summary's values where it has them, the form's where it does not.
 * People not in `known` (when it is known) and types the API does not have are dropped. */
export function fromSummary(f: LogFormState, s: Summary, types: string[], known: Set<number> | undefined): LogFormState {
  return {
    type: types.includes(s.type) ? s.type : f.type,
    when: (s.happened_at && toLocalInput(s.happened_at)) || f.when,
    contact_ids: known ? s.contact_ids.filter((id) => known.has(id)) : s.contact_ids,
    summary: s.summary || f.summary,
    next_step: s.next_step ?? f.next_step,
    next_step_due: s.next_step_due ?? f.next_step_due,
  }
}

interface Props {
  open: boolean
  /** The organisation the log is for; null for a person who has none. */
  orgId: number | null
  /** Log against this person (from their page): the log goes to them, and to their organisation if they have one. */
  personId?: number
  /** Undefined while the list is still loading: nobody is dropped until it is known. */
  contacts: Contact[] | undefined
  /** Left out to log something new. */
  initial?: Loggable
  /** People ticked on a new log, such as the contact whose page it was opened from. */
  preselect?: number[]
  onClose: () => void
  onSaved: () => void
}

export function QuickLog({ open, orgId, personId, contacts, initial, preselect, onClose, onSaved }: Props) {
  const { meta } = useSession()
  const first = meta.interaction_types[0]
  const people = contacts ?? []
  const [base, setBase] = useState(initial)
  const [form, setForm] = useState(() => logForm(initial, preselect, new Date(), first))
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<{ when?: string; summary?: string }>({})
  const [busy, setBusy] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [paste, setPaste] = useState('')
  const [summarising, setSummarising] = useState(false)
  const [filled, setFilled] = useState(false)
  // Bumped on each open or close and on each summarise: an answer from an earlier one is dropped.
  const generation = useRef(0)

  useEffect(() => {
    generation.current++
    setSummarising(false)
  }, [open])

  // Reset on open. `preselect` is left out on purpose: callers pass a new array each render.
  useEffect(() => {
    if (!open) return
    setBase(initial)
    setForm(logForm(initial, preselect, new Date(), first))
    setError(undefined)
    setFieldErrors({})
    setPasting(false)
    setPaste('')
    setFilled(false)
  }, [open, initial, first])

  const set = (k: 'when' | 'summary' | 'next_step' | 'next_step_due') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggle = (id: number) =>
    setForm((f) => ({
      ...f,
      contact_ids: f.contact_ids.includes(id) ? f.contact_ids.filter((c) => c !== id) : [...f.contact_ids, id],
    }))

  async function summarise() {
    if (summarising || !paste.trim() || orgId === null) return
    const mine = ++generation.current
    setSummarising(true)
    setError(undefined)
    try {
      const s = await api.summarise(orgId, paste)
      if (mine !== generation.current) return
      const known = contacts ? new Set(contacts.map((c) => c.id)) : undefined
      setForm((f) => fromSummary(f, s, meta.interaction_types, known))
      setPasting(false)
      setPaste('')
      setFilled(true)
    } catch (e) {
      if (mine === generation.current) setError(saveErrorText(e))
    } finally {
      if (mine === generation.current) setSummarising(false)
    }
  }

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
      } else if (personId !== undefined) {
        await api.logForPerson(personId, body)
      } else if (orgId !== null) {
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
      onSubmit={() => void save()}
      footer={
        <>
          {base && <ConfirmDelete what="log" onConfirm={() => void remove()} />}
          <span className="tn-custom-grow" />
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="log-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="log-form" className="tn-stack" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        {!base && meta.ai && orgId !== null && (
          <>
            <div className="tn-cluster">
              <ToggleChip pressed={pasting} onClick={() => setPasting((p) => !p)}>Paste and summarise</ToggleChip>
            </div>
            {pasting && (
              <div className="tn-custom-paste">
                <Field
                  label="Pasted text"
                  multiline
                  rows={6}
                  hint="An email, notes or a transcript. It is summarised into the fields below and not kept."
                  value={paste}
                  onChange={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setPaste(e.target.value)}
                />
                <Button variant="secondary" size="sm" disabled={summarising || !paste.trim()} onClick={() => void summarise()}>
                  {summarising ? 'Summarising…' : 'Summarise'}
                </Button>
              </div>
            )}
          </>
        )}
        {filled && <Alert tone="info">Filled in from the pasted text. Check it, then save.</Alert>}
        <div className="tenon-field">
          <span className="tenon-field__label">Type</span>
          <SegmentedControl
            aria-label="Type"
            value={form.type}
            onChange={(type) => setForm((f) => ({ ...f, type }))}
            options={meta.interaction_types.map((t) => ({ value: t, label: <><ColourDot colour={typeColour(t)} /> {label(t)}</> }))}
          />
        </div>
        <Field label="When" type="datetime-local" required error={fieldErrors.when} value={form.when} onChange={set('when')} />
        {people.length > 0 && (
          <div className="tenon-field">
            <span className="tenon-field__label">With</span>
            <div className="tn-cluster" role="group" aria-label="With">
              {people.map((c) => (
                <ToggleChip
                  key={c.id}
                  pressed={form.contact_ids.includes(c.id)}
                  disabled={!base && c.id === personId}
                  onClick={() => toggle(c.id)}
                >
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
