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
/** A finished Bench task. `at` is midnight UTC on the day it was done. */
export interface TimelineBench { kind: 'bench'; id: string; title: string; at: string; by_email: string | null; url: string }
export type TimelineItem = TimelineInteraction | TimelineStatus | TimelineBench

/** A Bench task linked to an organisation through `[lead:: <slug>]`. `done` is finished work only; a cancelled
 * task has `cancelled` set, state "Cancelled", and `done_on` holds the day it was cancelled. */
export interface BenchTask {
  task_key: string
  board: string
  title: string
  state: string
  done: boolean
  cancelled: boolean
  done_on: string | null
  due: string | null
  assignee: string | null
  fetched_at: string
  url: string
}

/** The Work section's answer. `fetched_at` is null until the first read finishes. `refreshing` is true while a
 * refresh is running, and the page asks again until it is false. */
export interface Work {
  tasks: BenchTask[]
  fetched_at: string | null
  error: string | null
  refreshing: boolean
}

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
  kind: 'org' | 'contact' | 'interaction' | 'research'
  id: number
  org_id: number
  org_name: string
  org_slug: string
  title: string
  snippet: string
  /** The person a research brief is about; null for every other hit. */
  contact_id: number | null
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
  /** False when the server has no AI: research and summarise are hidden. */
  ai: boolean
  /** False when Bench is not connected: the Work section is hidden. */
  bench: boolean
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

export interface BriefPerson {
  name: string
  role: string
  /** Null for someone not yet in Binder. */
  contact_id: number | null
  why: string
}

export interface BriefNews {
  headline: string
  date: string
  url: string
}

export interface Brief {
  overview: string
  what_they_do: string
  size_and_funding: string
  people: BriefPerson[]
  recent_news: BriefNews[]
  likely_needs: string[]
  offdesk_angle: string
  open_questions: string[]
}

export interface Source {
  url: string
  title: string
}

export interface Research {
  id: number
  org_id: number
  contact_id: number | null
  status: 'running' | 'done' | 'failed'
  brief: Brief | null
  sources: Source[]
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  web_searches: number | null
  cost_usd: number | null
  error: string | null
  run_at: string
  finished_at: string | null
  author_email: string
}

/** A log entry's fields, from pasted text. Nothing is saved. */
export interface Summary {
  summary: string
  type: string
  happened_at: string | null
  next_step: string | null
  next_step_due: string | null
  contact_ids: number[]
}
