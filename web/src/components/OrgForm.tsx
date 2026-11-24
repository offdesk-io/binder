import { Alert, Button, Dropdown, Field, Modal, SegmentedControl } from '@tiagopedras/tenon'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Kind, Org, OrgFields, OrgPatch, Owner, PersonFields, Who } from '../api/types'
import { useSession } from '../app/session'
import { changed, orNull, saveErrorText, text } from '../lib/forms'
import { ownerName } from '../lib/owners'
import { SECTOR_LABEL, sectorLabel } from '../lib/sectors'
import { ConfirmDelete } from './ConfirmDelete'

export interface OrgFormState {
  name: string
  kind: Kind
  /** The introducer's id as text, or '' for none. */
  introduced_by: string
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
  /** What they do; for a referrer, where they work. */
  description: string
  /** A referrer's own details, kept on its primary contact. */
  person_email: string
  person_phone: string
  person_linkedin: string
}

/** The form's text for an organisation, or for a new one handled by `me` when they are on the team list. */
export function orgForm(org: Org | undefined, me: Who, owners: Owner[]): OrgFormState {
  return {
    name: text(org?.name),
    kind: org?.kind ?? 'lead',
    introduced_by: org?.introduced_by_id == null ? '' : String(org.introduced_by_id),
    owner_email: org ? text(org.owner_email) : owners.some((o) => o.email === me.email) ? me.email : '',
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
    description: text(org?.description),
    person_email: text(org?.person?.email),
    person_phone: text(org?.person?.phone),
    person_linkedin: text(org?.person?.linkedin_url),
  }
}

/** What the form writes to the record. A referrer is a person: it has no website, size or sector, so the body
 * leaves them out rather than sending them. */
export type OrgBody = Omit<OrgFields, 'website' | 'size' | 'sector'> & Partial<Pick<OrgFields, 'website' | 'size' | 'sector'>> & {
  description: string | null
}

export function orgBody(f: OrgFormState): OrgBody {
  const value = f.value.trim() === '' ? null : Number(f.value)
  const company = f.kind === 'referrer'
    ? {}
    : { website: orNull(f.website), sector: orNull(f.sector), size: orNull(f.size) }
  return {
    name: f.name.trim(),
    owner_email: orNull(f.owner_email),
    ...company,
    description: orNull(f.description),
    location: orNull(f.location),
    source: orNull(f.source),
    value_estimate: value !== null && Number.isFinite(value) ? value : null,
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    summary: orNull(f.summary),
    next_step: orNull(f.next_step),
    next_step_due: f.next_step_due || null,
  }
}

/** A referrer's person fields as the form has them. */
function personBody(f: OrgFormState): PersonFields {
  return { email: orNull(f.person_email), phone: orNull(f.person_phone), linkedin_url: orNull(f.person_linkedin) }
}

const KINDS: { value: Kind; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'client', label: 'Client' },
  { value: 'partner', label: 'Partner' },
  { value: 'referrer', label: 'Referrer' },
]

/** Only a lead or client is introduced by someone. */
const isIntroduced = (kind: Kind) => kind === 'lead' || kind === 'client'

interface Props {
  open: boolean
  /** Left out for a new organisation. */
  org?: Org
  onClose: () => void
  onSaved: (org: Org) => void
  /** Given only where deleting makes sense; the Delete button shows only then. */
  onDeleted?: () => void
}

/** None, then every partner and referrer except the record itself. The record's current introducer stays listed even if
 * the list has not loaded. */
function introducerOptions(all: Org[], base: Org | undefined) {
  const list = all.filter((o) => o.id !== base?.id)
  const current = base?.introduced_by
  if (current && !list.some((o) => o.id === current.id)) list.push({ id: current.id, name: current.name, kind: current.kind } as Org)
  return [
    { value: '', label: 'None' },
    ...list.map((o) => ({ value: String(o.id), label: `${o.name} (${o.kind})` })),
  ]
}

/** Nobody, then everyone on the team list by name. A person who handles this record but has left the list stays
 * listed, so saving does not quietly clear them. */
function handledByOptions(owners: Owner[], base: Org | undefined) {
  const list = owners.map((o) => ({ value: o.email, label: o.name }))
  const current = base?.owner_email
  if (current && !list.some((o) => o.value === current)) list.push({ value: current, label: ownerName(owners, current) })
  return [{ value: '', label: 'Nobody' }, ...list]
}

/** None, then the sectors by name. A value the list no longer has stays listed for the record that carries it. */
function sectorOptions(sectors: string[], base: Org | undefined) {
  const list = sectors.map((s) => ({ value: s, label: SECTOR_LABEL[s] ?? s }))
  const current = base?.sector
  if (current && !sectors.includes(current)) list.push({ value: current, label: sectorLabel(current) })
  return [{ value: '', label: 'None' }, ...list]
}

export function OrgForm({ open, org, onClose, onSaved, onDeleted }: Props) {
  const { me, meta } = useSession()
  const [base, setBase] = useState(org)
  const [form, setForm] = useState(() => orgForm(org, me, meta.owners))
  const [error, setError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [introducers, setIntroducers] = useState<Org[]>([])

  // The partners and referrers a lead or client can be introduced by. A failed load leaves the picker with None.
  useEffect(() => {
    if (!open) return
    let live = true
    Promise.all([api.orgs({ kind: 'partner', sort: 'name' }), api.orgs({ kind: 'referrer', sort: 'name' })]).then(
      ([partners, referrers]) => { if (live) setIntroducers([...partners, ...referrers]) },
      () => {},
    )
    return () => { live = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    setBase(org)
    setForm(orgForm(org, me, meta.owners))
    setError(undefined)
    setNameError(undefined)
  }, [open, org, me, meta.owners])

  const referrer = form.kind === 'referrer'
  const set = (k: keyof OrgFormState) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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
      const body = orgBody(form)
      let saved: Org
      const introducer = isIntroduced(form.kind) && form.introduced_by !== '' ? Number(form.introduced_by) : null
      if (base) {
        const diff: Omit<OrgPatch, 'updated_at'> = changed<OrgBody>(base, body)
        if (form.kind !== base.kind) diff.kind = form.kind
        // Only the person fields that changed, and only on a referrer: any other kind refuses them.
        if (form.kind === 'referrer') {
          const was: PersonFields = { email: base.person?.email ?? null, phone: base.person?.phone ?? null, linkedin_url: base.person?.linkedin_url ?? null }
          const diffPerson = changed<PersonFields>(was, personBody(form))
          if (Object.keys(diffPerson).length > 0) diff.person = diffPerson
        }
        // A partner or referrer has no introducer: the server clears it, so nothing is sent.
        if (isIntroduced(form.kind) && introducer !== base.introduced_by_id) diff.introduced_by_id = introducer
        saved = Object.keys(diff).length === 0
          ? base
          : await api.patchOrg(base.id, { ...diff, updated_at: base.updated_at })
      } else {
        const given = Object.fromEntries(Object.entries(personBody(form)).filter(([, v]) => v !== null))
        saved = await api.createOrg({
          ...body,
          kind: form.kind,
          ...(introducer === null ? {} : { introduced_by_id: introducer }),
          ...(form.kind === 'referrer' && Object.keys(given).length > 0 ? { person: given } : {}),
        })
      }
      onSaved(saved)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) {
        const current = e.current as Org
        setBase(current)
        setForm(orgForm(current, me, meta.owners))
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!base || busy) return
    setBusy(true)
    try {
      await api.deleteOrg(base.id)
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
      title={base ? `Edit ${base.name}` : 'New organisation'}
      size="md"
      onSubmit={() => void save()}
      footer={
        <>
          {base && onDeleted && <ConfirmDelete what="organisation" onConfirm={() => void remove()} />}
          <span className="tn-custom-grow" />
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="org-form" disabled={busy}>Save</Button>
        </>
      }
    >
      <form id="org-form" className="tn-stack" onSubmit={(e) => { e.preventDefault(); void save() }}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required error={nameError} value={form.name} onChange={set('name')} autoFocus />
        <div className="tenon-field">
          <span className="tenon-field__label">Kind</span>
          <SegmentedControl
            aria-label="Kind"
            value={form.kind}
            onChange={(kind) => setForm((f) => ({ ...f, kind }))}
            options={KINDS}
          />
        </div>
        {isIntroduced(form.kind) && (
          <div className="tenon-field">
            <span className="tenon-field__label">Introduced by</span>
            <Dropdown
              aria-label="Introduced by"
              value={form.introduced_by}
              onChange={(v) => setForm((f) => ({ ...f, introduced_by: v }))}
              options={introducerOptions(introducers, base)}
            />
          </div>
        )}
        {referrer && (
          <>
            <Field label="Email" type="email" value={form.person_email} onChange={set('person_email')} />
            <Field label="Phone" type="tel" value={form.person_phone} onChange={set('person_phone')} />
            <Field label="LinkedIn" value={form.person_linkedin} onChange={set('person_linkedin')} />
            <Field label="Works at" value={form.description} onChange={set('description')} />
          </>
        )}
        <div className="tenon-field">
          <span className="tenon-field__label">Handled by</span>
          <Dropdown
            aria-label="Handled by"
            value={form.owner_email}
            onChange={(v) => setForm((f) => ({ ...f, owner_email: v }))}
            options={handledByOptions(meta.owners, base)}
          />
        </div>
        {!referrer && (
          <>
            <Field label="Website" value={form.website} onChange={set('website')} />
            <div className="tenon-field">
              <span className="tenon-field__label">Sector</span>
              <Dropdown
                aria-label="Sector"
                value={form.sector}
                onChange={(v) => setForm((f) => ({ ...f, sector: v }))}
                options={sectorOptions(meta.sectors, base)}
              />
            </div>
            <Field label="Size" value={form.size} onChange={set('size')} />
            <Field label="What they do" value={form.description} onChange={set('description')} />
          </>
        )}
        <Field label="Location" value={form.location} onChange={set('location')} />
        <Field label="Source" hint="How they came to us" value={form.source} onChange={set('source')} />
        <Field label="Value (€)" type="number" min={0} value={form.value} onChange={set('value')} />
        <Field label="Tags" hint="Separated by commas" value={form.tags} onChange={set('tags')} />
        <Field label="Summary" multiline rows={3} value={form.summary} onChange={set('summary')} />
        <Field label="Next step" value={form.next_step} onChange={set('next_step')} />
        <Field label="Next step due" type="date" value={form.next_step_due} onChange={set('next_step_due')} />
      </form>
    </Modal>
  )
}
