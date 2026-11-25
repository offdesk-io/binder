import { request } from './client'
import type {
  ActivityItem, AttentionItem, Contact, ContactInput, ContactPatch, Interaction, InteractionInput,
  InteractionPatch, KeyPerson, Kind, Meta, Org, OrgInput, OrgPatch, Research, SearchHit, Summary, Thanks, ThanksItem,
  ThanksPut, TimelineItem, Who, Work,
} from './types'

export type OrgSort = 'updated' | 'name' | 'last_contact' | 'value' | 'won'

export interface OrgFilters {
  kind?: Kind | ''
  status?: string
  /** True keeps only records ever moved to `won` (the Pipeline's Won column asks with kind "client"),
   * newest won first unless `sort` says otherwise. False keeps those never won. */
  won?: boolean
  sort?: OrgSort
}

function query(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const text = s.toString()
  return text ? `?${text}` : ''
}

const slug = (s: string) => encodeURIComponent(s)

export const api = {
  whoami: () => request<Who>('GET', '/api/whoami'),
  meta: () => request<Meta>('GET', '/api/meta'),
  search: (q: string) => request<SearchHit[]>('GET', `/api/search${query({ q })}`),
  attention: () => request<AttentionItem[]>('GET', '/api/attention'),
  activity: (limit = 30) => request<ActivityItem[]>('GET', `/api/activity?limit=${limit}`),

  orgs: ({ won, ...f }: OrgFilters = {}) =>
    request<Org[]>('GET', `/api/orgs${query({ ...f, won: won === undefined ? undefined : String(won) })}`),
  orgBySlug: (s: string) => request<Org>('GET', `/api/orgs/by-slug/${slug(s)}`),
  createOrg: (body: OrgInput) => request<Org>('POST', '/api/orgs', body),
  patchOrg: (id: number, body: OrgPatch) => request<Org>('PATCH', `/api/orgs/${id}`, body),
  deleteOrg: (id: number) => request<void>('DELETE', `/api/orgs/${id}`),

  contacts: (orgId: number) => request<Contact[]>('GET', `/api/orgs/${orgId}/contacts`),
  contact: (id: number) => request<Contact>('GET', `/api/contacts/${id}`),
  createContact: (orgId: number, body: ContactInput) => request<Contact>('POST', `/api/orgs/${orgId}/contacts`, body),
  patchContact: (id: number, body: ContactPatch) => request<Contact>('PATCH', `/api/contacts/${id}`, body),
  deleteContact: (id: number) => request<void>('DELETE', `/api/contacts/${id}`),
  people: (q?: string) => request<KeyPerson[]>('GET', `/api/people${query({ q })}`),

  timeline: (orgId: number) => request<TimelineItem[]>('GET', `/api/orgs/${orgId}/timeline`),
  contactInteractions: (contactId: number) => request<Interaction[]>('GET', `/api/contacts/${contactId}/interactions`),
  createInteraction: (orgId: number, body: InteractionInput) =>
    request<Interaction>('POST', `/api/orgs/${orgId}/interactions`, body),
  patchInteraction: (id: number, body: InteractionPatch) => request<Interaction>('PATCH', `/api/interactions/${id}`, body),
  deleteInteraction: (id: number) => request<void>('DELETE', `/api/interactions/${id}`),
  orgResearch: (orgId: number) => request<Research[]>('GET', `/api/orgs/${orgId}/research`),
  contactResearch: (contactId: number) => request<Research[]>('GET', `/api/contacts/${contactId}/research`),
  research: (id: number) => request<Research>('GET', `/api/research/${id}`),
  startOrgResearch: (orgId: number) => request<Research>('POST', `/api/orgs/${orgId}/research`),
  startContactResearch: (contactId: number) => request<Research>('POST', `/api/contacts/${contactId}/research`),
  work: (orgId: number) => request<Work>('GET', `/api/orgs/${orgId}/work`),
  summarise: (orgId: number, text: string) => request<Summary>('POST', '/api/summarise', { org_id: orgId, text }),

  thanks: (year: number) => request<ThanksItem[]>('GET', `/api/thanks?year=${year}`),
  putThanks: (contactId: number, year: number, body: ThanksPut) =>
    request<Thanks>('PUT', `/api/thanks/${contactId}/${year}`, body),
}
