import { Card, type CardProps } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import type { Org } from '../api/types'
import { ago, day, isOverdue, person } from '../lib/format'
import { StatusTag } from './StatusTag'

export function NextStep({ org }: { org: Pick<Org, 'next_step' | 'next_step_due'> }) {
  if (!org.next_step) return null
  return (
    <span className={isOverdue(org.next_step_due) ? 'tn-custom-overdue' : undefined}>
      {org.next_step}
      {org.next_step_due && ` · ${day(org.next_step_due)}`}
    </span>
  )
}

interface OrgCardProps extends Omit<CardProps, 'title'> {
  org: Org
  /** A pipeline card shows its status in the stage's dropdown, so it leaves the tag out. */
  showStatus?: boolean
}

/** One organisation as a Tenon card: name, status, owner, last contact and next step.
 * Any other Card prop (drag handlers, footer, action) passes through. */
export function OrgCard({ org, showStatus = true, ...rest }: OrgCardProps) {
  return (
    <Card
      title={<Link to={`/o/${org.slug}`}>{org.name}</Link>}
      titleAs="h3"
      tags={showStatus ? <StatusTag status={org.status} /> : undefined}
      meta={`${person(org.owner_email)} · last contact ${ago(org.last_contact)}`}
      summary={org.next_step ? <NextStep org={org} /> : undefined}
      {...rest}
    />
  )
}
