import { Alert, Button, Dropdown, Field, Modal, SegmentedControl, type DropdownOption } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, ContactFields, ContactPatch } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { ConfirmDelete } from './ConfirmDelete'

export interface ContactFormState {
  name: string
  role: string
  email: string
  phone: string
  linkedin_url: string
  notes: string
  is_primary: boolean
  relationship: string
  connector: boolean
  postal_address: string
  /** The organisation as a Dropdown value: its id, or '' for none. Used only where the form offers the choice. */
  org_id: string
}

export interface ContactDefaults {
  /** The organisation a new person starts at. */
  orgId?: number | null
  /** Whether a new person starts as a key connector. */
  connector?: boolean
}

export function contactForm(c?: Contact, defaults: ContactDefaults = {}): ContactFormState {
  const orgId = c ? c.org_id : defaults.orgId ?? null
  return {
    name: text(c?.name),
    role: text(c?.role),
    email: text(c?.email),
    phone: text(c?.phone),
    linkedin_url: text(c?.linkedin_url),
    notes: text(c?.notes),
    is_primary: c?.is_primary ?? false,
    relationship: text(c?.relationship),
    connector: c?.connector ?? defaults.connector ?? false,
    postal_address: text(c?.postal_address),
    org_id: orgId === null ? '' : String(orgId),
  }
}

export function contactBody(f: ContactFormState): ContactFields {
  return {
    name: f.name.trim(),
    role: orNull(f.role),
    email: orNull(f.email),
    phone: orNull(f.phone),
    linkedin_url: orNull(f.linkedin_url),
    notes: orNull(f.notes),
    is_primary: f.is_primary,
    relationship: f.relationship || null,
    connector: f.connector,
    postal_address: orNull(f.postal_address),
  }
}

/** The organisation dropdown. It loads the organisations only once the form is open with the choice on. */
function OrgChoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const list = useApi(() => api.orgs({ sort: 'name' }), [])
  if (list.error) return <Alert tone="error">{list.error.message}</Alert>
  const options: DropdownOption[] = [
    { value: '', label: 'No organisation' },
    ...(list.data ?? []).map((o) => ({ value: String(o.id), label: o.name, group: `${label(o.kind)}s` })),
  ]
  return (
    <div className="tenon-field">
      <span className="tenon-field__label">Organisation</span>
      <Dropdown aria-label="Organisation" value={value} onChange={onChange} options={options} disabled={!list.data} />
    </div>
  )
}

interface Props {
  open: boolean
  /** The organisation a new person joins; null for someone on their own. */
  orgId: number | null
  /** Offer the organisation as a choice: on a person's page, and on People. */
  chooseOrg?: boolean
  /** A new person starts as a key connector: on People. */
  connectorDefault?: boolean
  /** Left out to add a new person. */
  contact?: Contact
  onClose: () => void
  onSaved: (c: Contact) => void
  onDeleted?: () => void
}

export function ContactForm({ open, orgId, chooseOrg = false, connectorDefault = false, contact, onClose, onSaved, onDeleted }: Props) {
  const { meta } = useSession()
  const defaults: ContactDefaults = { orgId, connector: connectorDefault }
  const [base, setBase] = useState(contact)
  const [form, setForm] = useState(() => contactForm(contact, defaults))
  const [error, setError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBase(contact)
    setForm(contactForm(contact, { orgId, connector: connectorDefault }))
    setError(undefined)
    setNameError(undefined)
  }, [open, contact, orgId, connectorDefault])

  // Only someone at an organisation can be the one to talk to.
  const hasOrg = (chooseOrg || orgId === null) ? form.org_id !== '' : true

  const set = (k: 'name' | 'role' | 'email' | 'phone' | 'linkedin_url' | 'notes' | 'postal_address') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (busy) return
    if (form.name.trim() === '') {
      setNameError('Name is required')
      return
    }
    setNameError(undefined)
    setBusy(true)
    setError(undefined)
    try {
      const body = contactBody(form)
      if (!hasOrg) body.is_primary = false
      const org = form.org_id === '' ? null : Number(form.org_id)
      let saved: Contact
      if (base) {
        const patch: ContactPatch = { ...changed<ContactFields>(base, body), updated_at: base.updated_at }
        if (chooseOrg && org !== base.org_id) patch.org_id = org
        // updated_at alone means nothing changed: send nothing.
        saved = Object.keys(patch).length === 1 ? base : await api.patchContact(base.id, patch)
      } else if (orgId !== null && !chooseOrg) {
        saved = await api.createContact(orgId, body)
      } else {
        saved = await api.createPerson({ ...body, org_id: org })
      }
      onSaved(saved)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Contact
        setBase(current)
        setForm(contactForm(current))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base || busy) return
    setBusy(true)
    try {
      await api.deleteContact(base.id)
      onDeleted?.()
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
      title={base ? `Edit ${base.name}` : 'Add a person'}
      size="md"
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="person" onConfirm={() => void remove()} />}
          <span className="tn-custom-grow" />
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="contact-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="contact-form" className="tn-stack" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required error={nameError} value={form.name} onChange={set('name')} autoFocus />
        <Field label="Role" value={form.role} onChange={set('role')} />
        {open && chooseOrg && <OrgChoice value={form.org_id} onChange={(org_id) => setForm((f) => ({ ...f, org_id }))} />}
        <Field label="Email" type="email" value={form.email} onChange={set('email')} />
        <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
        <Field label="LinkedIn" type="url" value={form.linkedin_url} onChange={set('linkedin_url')} />
        <div className="tenon-field">
          <span className="tenon-field__label">Relationship</span>
          <SegmentedControl
            aria-label="Relationship"
            value={form.relationship}
            onChange={(relationship) => setForm((f) => ({ ...f, relationship }))}
            options={[{ value: '', label: 'Not sure' }, ...meta.relationships.map((r) => ({ value: r, label: label(r) }))]}
          />
        </div>
        <div className="tenon-field">
          <label className="tenon-field__label tn-custom-check">
            <input
              type="checkbox"
              checked={form.connector}
              onChange={(e) => setForm((f) => ({ ...f, connector: e.target.checked }))}
            />
            Key connector
          </label>
        </div>
        {hasOrg && (
          <div className="tenon-field">
            <label className="tenon-field__label tn-custom-check">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              />
              Who to talk to
            </label>
          </div>
        )}
        <Field label="Postal address" multiline rows={3} value={form.postal_address} onChange={set('postal_address')} />
        <Field label="Notes" multiline rows={3} value={form.notes} onChange={set('notes')} />
      </form>
    </Modal>
  )
}
