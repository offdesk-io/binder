import type { ActivityItem, Brief, BenchTask, Contact, Interaction, Org, Person, Research, Thanks } from '../api/types'

export const AT = '2026-11-10T12:00:00.000000+00:00'

export function org(o: Partial<Org> = {}): Org {
  return {
    id: 1, slug: 'acme', name: 'Acme', kind: 'lead', status: 'lead', website: null, sector: null,
    size: null, location: null, owner_email: 'ana@example.com', source: null, value_estimate: null,
    tags: [], summary: null, next_step: null, next_step_due: null, last_contact: null,
    introduced_by_contact_id: null, introduced_by_org_id: null, introduced_by: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

export function contact(o: Partial<Contact> = {}): Contact {
  return {
    id: 5, org_id: 1, org_name: 'Acme', org_slug: 'acme', name: 'Bo', role: null, email: null,
    phone: null, linkedin_url: null, notes: null, is_primary: false, relationship: null,
    connector: false, postal_address: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

/** A row of the people list. */
export function person(o: Partial<Person> = {}): Person {
  return { ...contact(), last_contact: null, introduced_count: 0, ...o }
}

export function thanks(o: Partial<Thanks> = {}): Thanks {
  return {
    id: 1, contact_id: 5, year: 2026, what: null, sent_on: null, note: null,
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

export function interaction(o: Partial<Interaction> = {}): Interaction {
  return {
    id: 7, org_id: 1, type: 'call', happened_at: AT, summary: 'Talked budgets', next_step: null,
    next_step_due: null, contact_ids: [], author_email: 'ana@example.com',
    created_at: AT, updated_at: AT, updated_by: 'ana@example.com', ...o,
  }
}

export function activity(o: Partial<ActivityItem> = {}): ActivityItem {
  return {
    kind: 'status', id: 1, org_id: 2, org_name: 'Bolt', org_slug: 'bolt', at: AT, type: null,
    summary: null, from_status: 'lead', to_status: 'contacted', by_email: 'ana@example.com', ...o,
  }
}

export function benchTask(o: Partial<BenchTask> = {}): BenchTask {
  return {
    task_key: 'aa0002', board: 'work', title: 'Acme site rebuild', state: 'Doing', done: false, cancelled: false,
    done_on: null, due: null, assignee: null, fetched_at: AT, url: 'https://bench.example.com/#!board=work!task=aa0002', ...o,
  }
}

export function brief(o: Partial<Brief> = {}): Brief {
  return {
    overview: 'A made-up pottery.', what_they_do: 'Kilns.', size_and_funding: 'Twelve people.', people: [],
    recent_news: [], likely_needs: ['A web shop'], offdesk_angle: 'Build the shop.',
    open_questions: ['Who holds the budget?'], ...o,
  }
}

export function research(o: Partial<Research> = {}): Research {
  return {
    id: 3, org_id: 1, contact_id: null, status: 'done', brief: brief(),
    sources: [{ url: 'https://example.com/about', title: 'About' }], model: 'claude-opus-5-5',
    input_tokens: 1000, output_tokens: 500, web_searches: 2, cost_usd: 0.034, error: null,
    run_at: AT, finished_at: AT, author_email: 'ana@example.com', ...o,
  }
}
