import { expect, test, vi } from 'vitest'
import { api } from './endpoints'

function capture() {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', f)
  return () => f.mock.calls.map(([url, init]) => `${init?.method} ${url}`)
}

test('query strings leave out empty filters and encode the rest', async () => {
  const calls = capture()
  await api.orgs({ kind: 'lead', status: '', sort: 'name' })
  await api.search('acme & co')
  await api.orgBySlug('acme studio')
  await api.activity(10)
  expect(calls()).toEqual([
    'GET /api/orgs?kind=lead&sort=name',
    'GET /api/search?q=acme+%26+co',
    'GET /api/orgs/by-slug/acme%20studio',
    'GET /api/activity?limit=10',
  ])
})

test('the won filter is sent as true or false, and left out when unset', async () => {
  const calls = capture()
  await api.orgs({ kind: 'client', won: true })
  await api.orgs({ kind: 'client', won: false })
  await api.orgs({ kind: 'client' })
  expect(calls()).toEqual(['GET /api/orgs?kind=client&won=true', 'GET /api/orgs?kind=client&won=false', 'GET /api/orgs?kind=client'])
})

test('writes go to the right place with the right method', async () => {
  const calls = capture()
  await api.patchOrg(3, { updated_at: 'x', status: 'contacted' })
  await api.createInteraction(3, { type: 'call', summary: 'Hi' })
  await api.deleteContact(9)
  expect(calls()).toEqual(['PATCH /api/orgs/3', 'POST /api/orgs/3/interactions', 'DELETE /api/contacts/9'])
})

test('research and summarise routes', async () => {
  const calls = capture()
  await api.orgResearch(3)
  await api.contactResearch(5)
  await api.research(8)
  await api.startOrgResearch(3)
  await api.startContactResearch(5)
  await api.summarise(3, 'Hi')
  expect(calls()).toEqual([
    'GET /api/orgs/3/research',
    'GET /api/contacts/5/research',
    'GET /api/research/8',
    'POST /api/orgs/3/research',
    'POST /api/contacts/5/research',
    'POST /api/summarise',
  ])
})

test('people and thanks routes', async () => {
  const calls = capture()
  await api.people()
  await api.people('ma & co')
  await api.thanks(2026)
  await api.putThanks(5, 2026, { what: 'Wine', updated_at: null })
  expect(calls()).toEqual([
    'GET /api/people',
    'GET /api/people?q=ma+%26+co',
    'GET /api/thanks?year=2026',
    'PUT /api/thanks/5/2026',
  ])
})
