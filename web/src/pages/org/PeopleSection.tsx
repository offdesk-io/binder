import { Alert, Button, ColumnEmpty, Tag } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Contact } from '../../api/types'
import { ContactForm } from '../../components/ContactForm'
import { Loading } from '../../components/Loading'
import { Star } from '../../components/Star'
import { relationshipTone } from '../../lib/colour'
import { label } from '../../lib/format'
import type { Loaded } from '../../lib/useApi'
import { Section } from './Section'

export function PeopleSection({ orgId, contacts, onChanged }: { orgId: number; contacts: Loaded<Contact[]>; onChanged?: () => void }) {
  const [editing, setEditing] = useState<Contact | 'new'>()
  const done = () => {
    setEditing(undefined)
    contacts.reload()
    onChanged?.()
  }
  return (
    <>
      <Section
        id="people"
        title="People"
        action={<Button size="sm" variant="secondary" onClick={() => setEditing('new')}>Add person</Button>}
      >
        {contacts.error ? (
          <Alert tone="error">{contacts.error.message}</Alert>
        ) : !contacts.data ? (
          <Loading />
        ) : contacts.data.length === 0 ? (
          <ColumnEmpty>No one yet. Add the people you talk to.</ColumnEmpty>
        ) : (
          <ul className="tn-custom-rows tn-custom-people">
            {contacts.data.map((c) => (
              <li key={c.id}>
                <div className="tn-cluster">
                  {c.connector && <Star />}
                  <Link to={`/c/${c.id}`}>{c.name}</Link>
                  {c.is_primary && <Tag tone="accent">Talk to</Tag>}
                  {c.relationship && <Tag tone={relationshipTone(c.relationship)}>{label(c.relationship)}</Tag>}
                </div>
                <div className="tenon-caption tn-custom-faint">{[c.role, c.email, c.phone].filter(Boolean).join(' · ')}</div>
                <Button className="tn-custom-person-edit" size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <ContactForm
        open={editing !== undefined}
        orgId={orgId}
        contact={editing === 'new' ? undefined : editing}
        onClose={() => setEditing(undefined)}
        onSaved={done}
        onDeleted={done}
      />
    </>
  )
}
