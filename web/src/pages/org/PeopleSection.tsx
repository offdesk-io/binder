import { Alert, Button, Column, Tag } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Contact } from '../../api/types'
import { ContactForm } from '../../components/ContactForm'
import { Loading } from '../../components/Loading'
import { label } from '../../lib/format'
import type { Loaded } from '../../lib/useApi'

export function PeopleSection({ orgId, contacts, onChanged }: { orgId: number; contacts: Loaded<Contact[]>; onChanged?: () => void }) {
  const [editing, setEditing] = useState<Contact | 'new'>()
  const done = () => {
    setEditing(undefined)
    contacts.reload()
    onChanged?.()
  }
  return (
    <>
      <Column
        titleAs="h2"
        title="People"
        action={<Button size="sm" variant="secondary" onClick={() => setEditing('new')}>Add person</Button>}
      >
        {contacts.error ? (
          <Alert tone="error">{contacts.error.message}</Alert>
        ) : !contacts.data ? (
          <Loading />
        ) : contacts.data.length === 0 ? (
          <p className="tenon-body tn-custom-faint">No one yet. Add the people you talk to.</p>
        ) : (
          <ul className="tn-custom-people">
            {contacts.data.map((c) => (
              <li key={c.id}>
                <div className="tn-custom-person-name">
                  <Link to={`/c/${c.id}`}>{c.name}</Link>
                  {c.is_primary && <Tag tone="accent">Talk to</Tag>}
                  {c.relationship && <Tag>{label(c.relationship)}</Tag>}
                </div>
                <div className="tenon-caption tn-custom-faint">{[c.role, c.email, c.phone].filter(Boolean).join(' · ')}</div>
                <Button className="tn-custom-person-edit" size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </Column>
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
