import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { SessionContext, type Session } from '../app/session'

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true }

export const SESSION: Session = {
  meta: {
    kinds: ['lead', 'client', 'partner', 'referrer'],
    lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent', 'won', 'lost', 'parked'],
    open_lead_statuses: ['lead', 'contacted', 'in_conversation', 'proposal_sent'],
    client_statuses: ['active', 'paused', 'past'],
    partner_statuses: ['in_talks', 'active', 'paused', 'past'],
    interaction_types: ['call', 'email', 'meeting', 'note'],
    relationships: ['cold', 'warm', 'strong'],
    ai: true,
    bench: true,
  },
  me: { email: 'ana@example.com', name: 'Ana', teams: ['offdesk'] },
}

/** The providers every test renders inside: a session (the default one, or `session`) and a router at `path`.
 * Rerendering with this tree keeps the components' state, which a test can need. */
export function appTree(ui: ReactElement, path = '/', session: Session = SESSION): ReactElement {
  return (
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={[path]} future={ROUTER_FUTURE}>{ui}</MemoryRouter>
    </SessionContext.Provider>
  )
}

export function renderApp(ui: ReactElement, path = '/', session: Session = SESSION) {
  return render(appTree(ui, path, session))
}

export interface Call {
  key: string
  body: unknown
}

/** Stub fetch with one handler per "METHOD /path?query". A handler returns
 * the JSON body, a Response, undefined for 204, or a promise of one to hold the answer. An unstubbed call is
 * a 500, which the test will show as an error on screen. */
export function stubFetch(routes: Record<string, (body: unknown) => unknown | Promise<unknown>>): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ key, body })
      const handler = routes[key]
      if (!handler) return new Response(JSON.stringify({ detail: `No stub for ${key}` }), { status: 500 })
      const out = await handler(body)
      if (out instanceof Response) return out
      if (out === undefined) return new Response(null, { status: 204 })
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  return calls
}
