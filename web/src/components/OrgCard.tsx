import { Card, type CardProps } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import type { Org } from '../api/types'
import { stageColour } from '../lib/colour'
import { ago, person } from '../lib/format'
import { DueDate } from './ColourTag'
import { StatusTag } from './StatusTag'

export function NextStep({ org }: { org: Pick<Org, 'next_step' | 'next_step_due'> }) {
  if (!org.next_step) return null
  return (
    <span>
      {org.next_step}
      {org.next_step_due && <> · <DueDate due={org.next_step_due} /></>}
    </span>
  )
}

interface OrgCardProps extends Omit<CardProps, 'title'> {
  org: Org
  /** A pipeline card shows its status in the stage's dropdown, so it leaves the tag out. */
  showStatus?: boolean
}

/** One organisation as a Tenon card: name, status, owner, last contact and next step. The stripe is the stage's colour.
 * Any other Card prop (drag handlers, footer, action) passes through. */
export function OrgCard({ org, showStatus = true, ...rest }: OrgCardProps) {
  return (
    <Card
      title={<Link to={`/o/${org.slug}`}>{org.name}</Link>}
      titleAs="h3"
      accent={stageColour(org.status).mark}
      tags={showStatus ? <StatusTag status={org.status} /> : undefined}
      meta={`${person(org.owner_email)} · last contact ${ago(org.last_contact)}`}
      summary={org.next_step ? <NextStep org={org} /> : undefined}
      {...rest}
    />
  )
}
