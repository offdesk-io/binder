import { Alert, Button, ColumnEmpty } from '@tiagopedras/tenon'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { Contact, TimelineInteraction, TimelineItem } from '../../api/types'
import { useSession } from '../../app/session'
import { ColourDot } from '../../components/ColourTag'
import { InteractionEntry } from '../../components/InteractionEntry'
import { Loading } from '../../components/Loading'
import { stageColour } from '../../lib/colour'
import { day, label, safeHref, statusLine } from '../../lib/format'
import { ownerName } from '../../lib/owners'
import type { Loaded } from '../../lib/useApi'
import { Section } from './Section'

interface Props {
  items: Loaded<TimelineItem[]>
  contacts: Contact[]
  onEdit: (i: TimelineInteraction) => void
  /** Show only the newest `limit` entries, then a link to the rest. */
  limit?: number
  /** Where "Show all" goes when a limit hides entries. */
  moreHref?: string
}

export function TimelineSection({ items, contacts, onEdit, limit, moreHref }: Props) {
  const { owners } = useSession().meta
  const names = new Map(contacts.map((c) => [c.id, c.name]))
  const { hash } = useLocation()

  // A search hit links to #i-<id>; bring that entry into view once it is drawn.
  useEffect(() => {
    if (hash && items.data) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'center' })
  }, [hash, items.data])

  return (
    <Section id="timeline" title="Timeline">
      {items.error ? (
        <Alert tone="error">{items.error.message}</Alert>
      ) : !items.data ? (
        <Loading />
      ) : items.data.length === 0 ? (
        <ColumnEmpty boxed>Nothing logged yet.</ColumnEmpty>
      ) : (
        <>
          <ol className="tn-custom-rows">
            {items.data.slice(0, limit ?? items.data.length).map((i) =>
              i.kind === 'status' ? (
                <li key={`s${i.id}`} className="tn-custom-muted">
                  <ColourDot colour={stageColour(i.to_status)} /> {statusLine(i.from_status, i.to_status)}{' '}
                  <span className="tn-custom-entry-meta">· {ownerName(owners, i.by_email)} · {day(i.at)}</span>
                </li>
              ) : i.kind === 'bench' ? (
                <li key={`b${i.id}`} className="tn-custom-muted">
                  Finished in Bench: <a href={safeHref(i.url) ?? undefined} target="_blank" rel="noopener noreferrer">{i.title}</a>{' '}
                  {/* at is the done day at midnight UTC: show that day, whatever the browser's zone */}
                  <span className="tn-custom-entry-meta">· {day(i.at.slice(0, 10))}</span>
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
          {limit !== undefined && moreHref && items.data.length > limit && (
            <Link to={moreHref} className="tenon-caption">Show all {items.data.length}</Link>
          )}
        </>
      )}
    </Section>
  )
}
