import { Card, Tag, type CardProps } from '@tiagopedras/tenon'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Org } from '../api/types'
import { stageColour } from '../lib/colour'
import { initials, moneyShort, person } from '../lib/format'
import { openInPlace } from '../lib/openInPlace'
import { DueDate } from './ColourTag'
import { SectorLabel } from './SectorLabel'
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
  /** Open the organisation in place (the drawer). A plain or keyboard click calls this; a modified click follows the link. */
  onOpen?: (org: Org) => void
  /** Show the stage tag. A card inside a stage's column leaves it off, since the column says it. */
  showStatus?: boolean
  /** A click anywhere on the card opens it, as the name's link does. The click is handled once, on the card, and the
   * link stays a real link for the keyboard and a modified click. */
  openOnCard?: boolean
}

/**
 * One organisation as a card: sector as the eyebrow in its colour, the name, the next step, and a
 * row of chips (due date, value, the owner's initials). The left stripe is the stage's colour. Any other Card prop
 * passes through. The name link carries data-org-open, so the drawer can hand focus back to this card when it closes.
 */
export function OrgCard({ org, onOpen, showStatus = true, openOnCard = false, ...rest }: OrgCardProps) {
  const open = (e: MouseEvent<HTMLElement>) => {
    if (onOpen) openInPlace(e, () => onOpen(org))
  }
  return (
    <Card
      eyebrow={org.sector?.trim() ? <SectorLabel sector={org.sector} /> : undefined}
      title={
        <Link to={`/o/${org.slug}`} data-org-open={org.slug} onClick={openOnCard ? undefined : open}>
          {org.name}
        </Link>
      }
      titleAs="h3"
      accent={stageColour(org.status).mark}
      tags={showStatus ? <StatusTag status={org.status} /> : undefined}
      interactive={openOnCard || undefined}
      onClick={openOnCard ? open : undefined}
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
