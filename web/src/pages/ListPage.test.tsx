import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { Org } from '../api/types'
import { AT, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { filterOrgs, ListPage, options } from './ListPage'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

const lead = org({ id: 1, name: 'Acme', slug: 'acme', tags: ['design'] })
const client = org({ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'active', owner_email: 'bo@example.com' })

test('filterOrgs applies every filter that is set', () => {
  const all = { kind: '', status: '', owner: '', tag: '' }
  expect(filterOrgs([lead, client], all)).toEqual([lead, client])
  expect(filterOrgs([lead, client], { ...all, kind: 'client' })).toEqual([client])
  expect(filterOrgs([lead, client], { ...all, tag: 'design' })).toEqual([lead])
  expect(filterOrgs([lead, client], { ...all, owner: 'bo@example.com' })).toEqual([client])
})

test('options are unique and sorted, after an Any choice', () => {
  expect(options(['b', null, 'a', 'b'], 'Anyone')).toEqual([
    { value: '', label: 'Anyone' }, { value: 'a', label: 'a' }, { value: 'b', label: 'b' },
  ])
})

test('the URL holds the filters', async () => {
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=client')
  expect(await screen.findByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('changing the sort asks the API again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=updated': () => [lead, client],
    'GET /api/orgs?sort=name': () => [lead, client],
  })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toContain('GET /api/orgs?sort=name')
})

test('an unknown kind or status in the URL is ignored', async () => {
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=bogus&status=nope')
  expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('choosing a kind clears the status in the URL', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<><ListPage /><Where /></>, '/list?status=lead')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.queryByRole('link', { name: 'Bolt' })).toBeNull()
  await user.click(screen.getByRole('radio', { name: 'Clients' }))
  expect(await screen.findByText('at /list?kind=client')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('changing the sort keeps the list and the dropdowns on screen', async () => {
  const user = userEvent.setup()
  let release!: (v: Org[]) => void
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  const first = fetch
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url === '/api/orgs?sort=name'
      ? new Promise<Response>((r) => { release = (v) => r(new Response(JSON.stringify(v), { status: 200 })) })
      : first(url, init))
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
  expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Owner' })).toBeInTheDocument()
  release([client, lead])
})

test('the list has a visually hidden title', async () => {
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
})

const drawerRoutes = {
  'GET /api/orgs/by-slug/acme': () => lead,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

test('a row opens the organisation in the drawer', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client], ...drawerRoutes })
  renderApp(<ListPage />, '/list')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})

test('the owner dropdown is gone; the chips filter instead', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<><ListPage /><Where /></>, '/list')
  await screen.findByRole('group', { name: 'Owner' })
  expect(screen.queryByRole('button', { name: 'Owner' })).toBeNull()
  await user.click(screen.getByRole('button', { name: /^bo/ }))
  expect(await screen.findByText('at /list?owner=bo%40example.com')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the table has a sector column', async () => {
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('columnheader', { name: 'Sector' })).toBeInTheDocument()
})

test('filterOrgs with owner none keeps organisations without an owner', () => {
  expect(filterOrgs([org({ id: 1, owner_email: null }), org({ id: 2 })], { kind: '', status: '', owner: 'none', tag: '' }).map((o) => o.id)).toEqual([1])
})
