import { Alert, Button, Column, ColumnEmpty, LinkButton, Tag, ToggleChip } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact } from '../api/types'
import { ContactForm } from '../components/ContactForm'
import { InteractionEntry } from '../components/InteractionEntry'
import { Loading } from '../components/Loading'
import { QuickLog } from '../components/QuickLog'
import { ResearchSection } from '../components/ResearchSection'
import { Star } from '../components/Star'
import { useSession } from '../app/session'
import { relationshipTone } from '../lib/colour'
import { label, safeHref } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'

export function ContactPage() {
  const id = Number(useParams().id)
  const valid = Number.isInteger(id) && id > 0
  const contact = useApi(() => (valid ? api.contact(id) : Promise.reject(new Error('Person not found'))), [id])
  if (contact.error) return <Alert tone="error" title="Could not open this person">{contact.error.message}</Alert>
  if (!contact.data) return <Loading />
  return <ContactView key={contact.data.id} c={contact.data} setContact={contact.setData} />
}

function ContactView({ c, setContact }: { c: Contact; setContact: (c: Contact) => void }) {
  const navigate = useNavigate()
  const { meta } = useSession()
  const history = useApi(() => api.contactInteractions(c.id), [c.id])
  const people = useApi(() => api.contacts(c.org_id), [c.org_id])
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)
  const [starring, setStarring] = useState(false)
  const [notice, setNotice] = useState<string>()

  /** The Key connector toggle saves the star on its own. A stale save shows their version. */
  async function toggleConnector() {
    if (starring) return
    setStarring(true)
    setNotice(undefined)
    try {
      setContact(await api.patchContact(c.id, { connector: !c.connector, updated_at: c.updated_at }))
    } catch (e) {
      setNotice(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) setContact(e.current as Contact)
    } finally {
      setStarring(false)
    }
  }

  const linkedin = safeHref(c.linkedin_url)
  const names = new Map((people.data ?? []).map((p) => [p.id, p.name]))
  const details: [string, ReactNode][] = (
    [
      ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
      ['Phone', c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>],
      ['LinkedIn', c.linkedin_url && (linkedin ? <a href={linkedin} target="_blank" rel="noreferrer">Profile</a> : c.linkedin_url)],
      ['Relationship', c.relationship && <Tag tone={relationshipTone(c.relationship)}>{label(c.relationship)}</Tag>],
      ['Talk to', c.is_primary && 'Yes, the one to talk to'],
      ['Postal address', c.postal_address && <span className="tn-custom-address">{c.postal_address}</span>],
    ] as [string, ReactNode][]
  ).filter(([, v]) => v)

  return (
    <div className="tn-stack">
      <header className="tn-stack">
        <div className="tn-toolbar">
          <div className="tn-cluster tn-custom-title">
            {(c.connector || c.is_referrer) && <Star />}
            <h1 className="tenon-heading-3">{c.name}</h1>
          </div>
          <div className="tn-cluster">
            {/* A referrer's own person is a key person already: there is nothing to toggle. */}
            {!c.is_referrer && (
              <ToggleChip pressed={c.connector} disabled={starring} onClick={() => void toggleConnector()}>Key connector</ToggleChip>
            )}
            <Button variant="primary" size="sm" onClick={() => setLogging(true)}>Log</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            {meta.ai && <LinkButton variant="ghost" size="sm" href="#research">Research</LinkButton>}
            {c.phone && <LinkButton variant="ghost" size="sm" href={`tel:${c.phone}`}>Call</LinkButton>}
            {c.email && <LinkButton variant="ghost" size="sm" href={`mailto:${c.email}`}>Email</LinkButton>}
          </div>
        </div>
        <p className="tenon-caption tn-custom-faint">
          {c.role && `${c.role} at `}
          <Link to={`/o/${c.org_slug}`}>{c.org_name}</Link>
        </p>
        {notice && <Alert tone="error">{notice}</Alert>}
      </header>

      <div className="tn-grid tn-custom-split">
        <div className="tn-col-8 tn-stack">
          <Column titleAs="h2" title={`With ${c.name}`}>
            {history.error ? (
              <Alert tone="error">{history.error.message}</Alert>
            ) : !history.data ? (
              <Loading />
            ) : history.data.length === 0 ? (
              <ColumnEmpty boxed>Nothing logged with {c.name} yet.</ColumnEmpty>
            ) : (
              <ol className="tn-custom-rows">
                {history.data.map((i) => (
                  <li key={i.id}>
                    <InteractionEntry
                      type={i.type} at={i.happened_at} by={i.author_email} summary={i.summary}
                      next_step={i.next_step} next_step_due={i.next_step_due}
                      people={i.contact_ids.filter((p) => p !== c.id).map((p) => names.get(p)).filter((n): n is string => !!n)}
                    />
                  </li>
                ))}
              </ol>
            )}
          </Column>
          <ResearchSection subject={{ kind: 'contact', id: c.id }} orgId={c.org_id} people={people} />
        </div>
        <div className="tn-col-4 tn-stack">
          <Column titleAs="h2" title="Details">
            <dl className="tn-custom-facts">
              {details.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
            </dl>
            {c.notes && <p className="tenon-body tn-custom-body">{c.notes}</p>}
          </Column>
        </div>
      </div>

      <ContactForm
        open={editing}
        orgId={c.org_id}
        contact={c}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false)
          setContact(saved)
          people.reload()
        }}
        onDeleted={() => navigate(`/o/${c.org_slug}`)}
      />
      <QuickLog
        open={logging}
        orgId={c.org_id}
        contacts={people.data}
        preselect={[c.id]}
        onClose={() => setLogging(false)}
        onSaved={() => {
          setLogging(false)
          history.reload()
        }}
      />
    </div>
  )
}
