import { Alert, Button, Field, Modal, SegmentedControl } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, ContactFields } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { useIsPhone } from '../lib/useIsPhone'
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
}

export function contactForm(c?: Contact): ContactFormState {
  return {
    name: text(c?.name),
    role: text(c?.role),
    email: text(c?.email),
    phone: text(c?.phone),
    linkedin_url: text(c?.linkedin_url),
    notes: text(c?.notes),
    is_primary: c?.is_primary ?? false,
    relationship: text(c?.relationship),
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
  }
}

interface Props {
  open: boolean
  orgId: number
  /** Left out to add a new person. */
  contact?: Contact
  onClose: () => void
  onSaved: (c: Contact) => void
  onDeleted?: () => void
}

export function ContactForm({ open, orgId, contact, onClose, onSaved, onDeleted }: Props) {
  const { meta } = useSession()
  const phone = useIsPhone()
  const [base, setBase] = useState(contact)
  const [form, setForm] = useState(() => contactForm(contact))
  const [error, setError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBase(contact)
    setForm(contactForm(contact))
    setError(undefined)
    setNameError(undefined)
  }, [open, contact])

  const set = (k: keyof ContactFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

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
      let saved: Contact
      if (base) {
        const diff = changed<ContactFields>(base, body)
        saved = Object.keys(diff).length === 0
          ? base
          : await api.patchContact(base.id, { ...diff, updated_at: base.updated_at })
      } else {
        saved = await api.createContact(orgId, body)
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
      className={phone ? 'tn-custom-sheet' : undefined}
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="person" onConfirm={() => void remove()} />}
          <span className="tn-custom-grow" />
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="contact-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="contact-form" className="tn-custom-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required error={nameError} value={form.name} onChange={set('name')} autoFocus />
        <Field label="Role" value={form.role} onChange={set('role')} />
        <Field label="Email" type="email" value={form.email} onChange={set('email')} />
        <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} />
        <Field label="LinkedIn" type="url" value={form.linkedin_url} onChange={set('linkedin_url')} />
        <div className="tn-custom-field">
          <span className="tenon-label">Relationship</span>
          <SegmentedControl
            aria-label="Relationship"
            value={form.relationship}
            onChange={(relationship) => setForm((f) => ({ ...f, relationship }))}
            options={[{ value: '', label: 'Not sure' }, ...meta.relationships.map((r) => ({ value: r, label: label(r) }))]}
          />
        </div>
        <label className="tn-custom-check">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
          />
          Who to talk to
        </label>
        <Field label="Notes" multiline rows={3} value={form.notes} onChange={set('notes')} />
      </form>
    </Modal>
  )
}
