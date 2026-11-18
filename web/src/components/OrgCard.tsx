import { Card, Tag, type CardProps } from '@tiagopedras/tenon'
import type { CSSProperties, MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Org } from '../api/types'
import { sectorColour, stageColour } from '../lib/colour'
import { initials, moneyShort, person } from '../lib/format'
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
  /** Show the status Tag. Off on the pipeline, where the column says it. */
  showStatus?: boolean
  /** Open the organisation in place (the drawer). A plain or keyboard click calls this; a modified click follows the link. */
  onOpen?: (org: Org) => void
}

/**
 * One organisation as a card in Bench's layout: sector as the eyebrow in its colour, the name, the next step, and a
 * row of chips (due date, value, the owner's initials). The left stripe is the stage's colour. Any other Card prop
 * (drag handlers, footer) passes through. The name link carries data-org-open, so the drawer can hand focus back to
 * this card when it closes, even after the card has moved column.
 */
export function OrgCard({ org, showStatus = true, onOpen, ...rest }: OrgCardProps) {
  const sector = org.sector?.trim()
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onOpen(org)
  }
  return (
    <Card
      eyebrow={sector ? (
        <span className="tn-custom-sector" style={{ '--tn-sector': sectorColour(sector).mark } as CSSProperties}>{sector}</span>
      ) : undefined}
      title={<Link to={`/o/${org.slug}`} data-org-open={org.slug} onClick={open}>{org.name}</Link>}
      titleAs="h3"
      accent={stageColour(org.status).mark}
      tags={showStatus ? <StatusTag status={org.status} /> : undefined}
      summary={org.next_step ? <span className="tn-custom-muted">{org.next_step}</span> : undefined}
      footer={
        <span className="tn-custom-chiprow">
          {org.next_step_due && <DueDate due={org.next_step_due} />}
          {org.value_estimate != null && <Tag>{moneyShort(org.value_estimate)}</Tag>}
          {org.owner_email && (
            <span className="tn-custom-avatar" title={`Owned by ${person(org.owner_email)}`}>{initials(org.owner_email)}</span>
          )}
        </span>
      }
      {...rest}
    />
  )
}
