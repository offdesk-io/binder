import type { TagTone } from '@tiagopedras/tenon'
import type { Kind, Meta } from '../api/types'

/** The statuses a kind moves between, from `/api/meta`. */
export function statusesOf(meta: Meta, kind: Kind): string[] {
  if (kind === 'lead') return meta.lead_statuses
  if (kind === 'client') return meta.client_statuses
  return kind === 'partner' ? meta.partner_statuses : meta.referrer_statuses
}

export const KIND_LABEL: Record<Kind, string> = {
  lead: 'Lead',
  client: 'Client',
  partner: 'Partner',
  referrer: 'Referrer',
}

/** A kind's Tenon tone. Partners and referrers carry their own so a search hit says what it is at a glance. */
export const KIND_TONE: Record<Kind, TagTone> = {
  lead: 'neutral',
  client: 'success',
  partner: 'info',
  referrer: 'accent',
}
