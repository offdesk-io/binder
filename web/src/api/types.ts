/* Response and request shapes. The README's API section is the reference:
 * change the two together. */

export type Kind = 'lead' | 'client'

export interface Org {
  id: number
  slug: string
  name: string
  kind: Kind
  status: string
  website: string | null
  sector: string | null
  size: string | null
  location: string | null
  owner_email: string | null
  source: string | null
  value_estimate: number | null
  tags: string[]
  summary: string | null
  next_step: string | null
  next_step_due: string | null
  last_contact: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

export interface Contact {
  id: number
  org_id: number
  org_name: string
  org_slug: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  notes: string | null
  is_primary: boolean
  relationship: string | null
  created_at: string
  updated_at: string
  updated_by: string
}

export interface Interaction {
  id: number
  org_id: number
  type: string
  happened_at: string
  summary: string
  next_step: string | null
  next_step_due: string | null
  contact_ids: number[]
  author_email: string
  created_at: string
  updated_at: string
  updated_by: string
}

export interface StatusChange {
  id: number
  org_id: number
  from_status: string | null
  to_status: string
  at: string
  by_email: string
}

export type TimelineInteraction = Omit<Interaction, 'author_email'> & { kind: 'interaction'; at: string; by_email: string }
export type TimelineStatus = StatusChange & { kind: 'status' }
export type TimelineItem = TimelineInteraction | TimelineStatus

export interface ActivityItem {
  kind: 'interaction' | 'status'
  id: number
  org_id: number
  org_name: string
  org_slug: string
  at: string
  type: string | null
  summary: string | null
  from_status: string | null
  to_status: string | null
  by_email: string
}

export interface SearchHit {
  kind: 'org' | 'contact' | 'interaction'
  id: number
  org_id: number
  org_name: string
  org_slug: string
  title: string
  snippet: string
}

export type Reason = 'overdue' | 'quiet' | 'stuck'

export interface AttentionItem {
  org: Org
  reasons: Reason[]
}

export interface Meta {
  kinds: Kind[]
  lead_statuses: string[]
  open_lead_statuses: string[]
  client_statuses: string[]
  interaction_types: string[]
  relationships: string[]
}

export interface Who {
  email: string
  name: string
  teams: string[]
}

/* Request bodies. A PATCH carries the updated_at it loaded and only the
 * fields that changed. */

export interface OrgFields {
  name: string
  website: string | null
  sector: string | null
  size: string | null
  location: string | null
  owner_email: string | null
  source: string | null
  value_estimate: number | null
  tags: string[]
  summary: string | null
  next_step: string | null
  next_step_due: string | null
}
export type OrgInput = Pick<OrgFields, 'name'> & Partial<OrgFields> & { kind?: Kind }
export type OrgPatch = Partial<OrgFields> & { status?: string; updated_at: string }

export interface ContactFields {
  name: string
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  notes: string | null
  is_primary: boolean
  relationship: string | null
}
export type ContactInput = Pick<ContactFields, 'name'> & Partial<ContactFields>
export type ContactPatch = Partial<ContactFields> & { updated_at: string }

export interface InteractionFields {
  type: string
  summary: string
  happened_at: string
  next_step: string | null
  next_step_due: string | null
  contact_ids: number[]
}
export type InteractionInput = Pick<InteractionFields, 'type' | 'summary'> & Partial<InteractionFields>
export type InteractionPatch = Partial<InteractionFields> & { updated_at: string }
