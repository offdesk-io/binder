import { Alert, Button, Field, Modal, SegmentedControl } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Kind, Org, OrgFields, Who } from '../api/types'
import { useSession } from '../app/session'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useIsPhone } from '../lib/useIsPhone'
import { ConfirmDelete } from './ConfirmDelete'

export interface OrgFormState {
  name: string
  kind: Kind
  owner_email: string
  website: string
  sector: string
  size: string
  location: string
  source: string
  value: string
  tags: string
  summary: string
  next_step: string
  next_step_due: string
}

/** The form's text for an organisation, or for a new one owned by `me`. */
export function orgForm(org: Org | undefined, me: Who): OrgFormState {
  return {
    name: text(org?.name),
    kind: org?.kind ?? 'lead',
    owner_email: org ? text(org.owner_email) : me.email,
    website: text(org?.website),
    sector: text(org?.sector),
    size: text(org?.size),
    location: text(org?.location),
    source: text(org?.source),
    value: org?.value_estimate == null ? '' : String(org.value_estimate),
    tags: (org?.tags ?? []).join(', '),
    summary: text(org?.summary),
    next_step: text(org?.next_step),
    next_step_due: text(org?.next_step_due),
  }
}

export function orgBody(f: OrgFormState): OrgFields {
  const value = f.value.trim() === '' ? null : Number(f.value)
  return {
    name: f.name.trim(),
    owner_email: orNull(f.owner_email),
    website: orNull(f.website),
    sector: orNull(f.sector),
    size: orNull(f.size),
    location: orNull(f.location),
    source: orNull(f.source),
    value_estimate: value !== null && Number.isFinite(value) ? value : null,
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    summary: orNull(f.summary),
    next_step: orNull(f.next_step),
    next_step_due: f.next_step_due || null,
  }
}

interface Props {
  open: boolean
  /** Left out for a new organisation. */
  org?: Org
  onClose: () => void
  onSaved: (org: Org) => void
  /** Given only where deleting makes sense; the Delete button shows only then. */
  onDeleted?: () => void
}

export function OrgForm({ open, org, onClose, onSaved, onDeleted }: Props) {
  const { me } = useSession()
  const phone = useIsPhone()
  const [base, setBase] = useState(org)
  const [form, setForm] = useState(() => orgForm(org, me))
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBase(org)
    setForm(orgForm(org, me))
    setError(undefined)
  }, [open, org, me])

  const set = (k: keyof OrgFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const body = orgBody(form)
      const saved = base
        ? await api.patchOrg(base.id, { ...changed<OrgFields>(base, body), updated_at: base.updated_at })
        : await api.createOrg({ ...body, kind: form.kind })
      onSaved(saved)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Org
        setBase(current)
        setForm(orgForm(current, me))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base) return
    try {
      await api.deleteOrg(base.id)
      onDeleted?.()
    } catch (e) {
      setError(saveErrorText(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={base ? `Edit ${base.name}` : 'New organisation'}
      size="md"
      className={phone ? 'lg-sheet' : undefined}
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="organisation" onConfirm={() => void remove()} />}
          <span className="lg-grow" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="org-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="org-form" className="lg-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required value={form.name} onChange={set('name')} autoFocus />
        {!base && (
          <div className="lg-field">
            <span className="tenon-label">Kind</span>
            <SegmentedControl
              aria-label="Kind"
              value={form.kind}
              onChange={(kind) => setForm((f) => ({ ...f, kind }))}
              options={[{ value: 'lead', label: 'Lead' }, { value: 'client', label: 'Client' }]}
            />
          </div>
        )}
        <Field label="Owner email" type="email" value={form.owner_email} onChange={set('owner_email')} />
        <Field label="Website" value={form.website} onChange={set('website')} />
        <Field label="Sector" value={form.sector} onChange={set('sector')} />
        <Field label="Size" value={form.size} onChange={set('size')} />
        <Field label="Location" value={form.location} onChange={set('location')} />
        <Field label="Source" hint="How they came to us" value={form.source} onChange={set('source')} />
        <Field label="Value (£)" type="number" min={0} value={form.value} onChange={set('value')} />
        <Field label="Tags" hint="Separated by commas" value={form.tags} onChange={set('tags')} />
        <Field label="Summary" multiline rows={3} value={form.summary} onChange={set('summary')} />
        <Field label="Next step" value={form.next_step} onChange={set('next_step')} />
        <Field label="Next step due" type="date" value={form.next_step_due} onChange={set('next_step_due')} />
      </form>
    </Modal>
  )
}
