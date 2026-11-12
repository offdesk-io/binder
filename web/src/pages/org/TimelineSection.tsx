import { Alert, Button, Column } from '@tiagopedras/tenon'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import type { Contact, TimelineInteraction, TimelineItem } from '../../api/types'
import { InteractionEntry } from '../../components/InteractionEntry'
import { Loading } from '../../components/Loading'
import { day, label, person, statusLine } from '../../lib/format'
import type { Loaded } from '../../lib/useApi'

interface Props {
  items: Loaded<TimelineItem[]>
  contacts: Contact[]
  onEdit: (i: TimelineInteraction) => void
}

export function TimelineSection({ items, contacts, onEdit }: Props) {
  const names = new Map(contacts.map((c) => [c.id, c.name]))
  const { hash } = useLocation()

  // A search hit links to #i-<id>; bring that entry into view once it is drawn.
  useEffect(() => {
    if (hash && items.data) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'center' })
  }, [hash, items.data])

  return (
    <Column titleAs="h2" title="Timeline">
      {items.error ? (
        <Alert tone="error">{items.error.message}</Alert>
      ) : !items.data ? (
        <Loading />
      ) : items.data.length === 0 ? (
        <p className="tenon-body tn-custom-faint">Nothing logged yet.</p>
      ) : (
        <ol className="tn-custom-timeline">
          {items.data.map((i) =>
            i.kind === 'status' ? (
              <li key={`s${i.id}`} className="tn-custom-tl-status">
                {statusLine(i.from_status, i.to_status)} <span className="tn-custom-entry-meta">· {person(i.by_email)} · {day(i.at)}</span>
              </li>
            ) : (
              <li key={`i${i.id}`} id={`i-${i.id}`}>
                <InteractionEntry
                  type={i.type}
                  at={i.at}
                  by={i.by_email}
                  summary={i.summary}
                  next_step={i.next_step}
                  next_step_due={i.next_step_due}
                  people={i.contact_ids.map((id) => names.get(id)).filter((n): n is string => !!n)}
                  action={<Button size="sm" variant="ghost" onClick={() => onEdit(i)} aria-label={`Edit ${label(i.type)} on ${day(i.at)}`}>Edit</Button>}
                />
              </li>
            ),
          )}
        </ol>
      )}
    </Column>
  )
}
