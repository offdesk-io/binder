import { Alert, Button, LinkButton } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Contact } from '../api/types'
import { ContactForm } from '../components/ContactForm'
import { InteractionEntry } from '../components/InteractionEntry'
import { Loading } from '../components/Loading'
import { QuickLog } from '../components/QuickLog'
import { label, safeHref } from '../lib/format'
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
  const history = useApi(() => api.contactInteractions(c.id), [c.id])
  const people = useApi(() => api.contacts(c.org_id), [c.org_id])
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)

  const linkedin = safeHref(c.linkedin_url)
  const names = new Map((people.data ?? []).map((p) => [p.id, p.name]))
  const details: [string, ReactNode][] = (
    [
      ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
      ['Phone', c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>],
      ['LinkedIn', c.linkedin_url && (linkedin ? <a href={linkedin} target="_blank" rel="noreferrer">Profile</a> : c.linkedin_url)],
      ['Relationship', c.relationship && label(c.relationship)],
      ['Talk to', c.is_primary && 'Yes, the one to talk to'],
    ] as [string, ReactNode][]
  ).filter(([, v]) => v)

  return (
    <div className="lg-page">
      <header className="lg-org-head">
        <h1 className="tenon-heading-1">{c.name}</h1>
        <p className="lg-faint">
          {c.role && `${c.role} at `}
          <Link to={`/o/${c.org_slug}`}>{c.org_name}</Link>
        </p>
        <div className="lg-actions">
          <Button onClick={() => setLogging(true)}>Log</Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          {c.phone && <LinkButton variant="secondary" href={`tel:${c.phone}`}>Call</LinkButton>}
          {c.email && <LinkButton variant="secondary" href={`mailto:${c.email}`}>Email</LinkButton>}
        </div>
      </header>

      <section className="lg-section">
        <h2 className="tenon-heading-3">Details</h2>
        <dl className="lg-facts">
          {details.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
        {c.notes && <p className="lg-entry-text">{c.notes}</p>}
      </section>

      <section className="lg-section">
        <h2 className="tenon-heading-3">With {c.name}</h2>
        {history.error ? (
          <Alert tone="error">{history.error.message}</Alert>
        ) : !history.data ? (
          <Loading />
        ) : history.data.length === 0 ? (
          <p className="lg-faint">Nothing logged with {c.name} yet.</p>
        ) : (
          <ol className="lg-timeline">
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
      </section>

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
