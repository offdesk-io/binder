import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { Org } from '../api/types'
import { AT, org } from '../test/fixtures'
import { Layout } from '../app/Layout'
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
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=client')
  expect(await screen.findByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('changing the sort asks the API again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [lead, client],
    'GET /api/orgs?sort=updated': () => [lead, client],
  })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Recently updated' }))
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toContain('GET /api/orgs?sort=updated')
})

test('a fresh list asks for name order and shows rows A to Z', async () => {
  const calls = stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toContain('GET /api/orgs?sort=name')
  const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
  expect(names).toEqual(['Acme', 'Bolt'])
})

test('another sort goes in the address and Name takes it out again', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client], 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<><ListPage /><Where /></>, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Recently updated' }))
  expect(await screen.findByText('at /list?sort=updated')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
  expect(await screen.findByText('at /list')).toBeInTheDocument()
})

test('the filter box narrows rows by name, sector and next step, and stays out of the address', async () => {
  const user = userEvent.setup()
  const rows = [
    lead,
    client,
    org({ id: 3, name: 'Cobalt', slug: 'cobalt', sector: 'Fintech' }),
    org({ id: 4, name: 'Delta', slug: 'delta', next_step: 'Send proposal' }),
  ]
  stubFetch({ 'GET /api/orgs?sort=name': () => rows })
  renderApp(<><ListPage /><Where /></>, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  const box = screen.getByRole('searchbox', { name: 'Filter organisations' })
  await user.type(box, 'bol')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  await user.clear(box)
  await user.type(box, 'fintech')
  expect(screen.getByRole('link', { name: 'Cobalt' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Bolt' })).toBeNull()
  await user.clear(box)
  await user.type(box, 'proposal')
  expect(screen.getByRole('link', { name: 'Delta' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Cobalt' })).toBeNull()
  expect(screen.getByText('at /list')).toBeInTheDocument()
})

test('an unknown kind or status in the URL is ignored', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=bogus&status=nope')
  expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('choosing a kind clears the status in the URL', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<><ListPage /><Where /></>, '/list?status=lead')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.queryByRole('link', { name: 'Bolt' })).toBeNull()
  await user.click(screen.getByRole('button', { name: /^Clients/ }))
  expect(await screen.findByText('at /list?kind=client')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('changing the sort keeps the list and the dropdowns on screen', async () => {
  const user = userEvent.setup()
  let release!: (v: Org[]) => void
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  const first = fetch
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url === '/api/orgs?sort=updated'
      ? new Promise<Response>((r) => { release = (v) => r(new Response(JSON.stringify(v), { status: 200 })) })
      : first(url, init))
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Recently updated' }))
  expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Owner' })).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Kind' })).toBeInTheDocument()
  release([client, lead])
})

test('the list has a visually hidden title', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
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
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client], ...drawerRoutes })
  renderApp(<><ListPage /><Where /></>, '/list')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByText('at /list?org=acme')).toBeInTheDocument()
})

test('on a phone, a card opens the drawer too', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client], ...drawerRoutes })
  renderApp(<ListPage />, '/list')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})

async function changeStatus(user: ReturnType<typeof userEvent.setup>, to: string) {
  const drawer = within(await screen.findByRole('dialog', { name: 'Acme' }))
  await user.click(await drawer.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: to }))
}

test('a change in the drawer updates the row without loading the list again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [lead, client],
    ...drawerRoutes,
    'PATCH /api/orgs/1': () => ({ ...lead, status: 'contacted' }),
  })
  renderApp(<ListPage />, '/list')
  const row = (await screen.findByRole('link', { name: 'Acme' })).closest('tr')!
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  await changeStatus(user, 'Contacted')
  await vi.waitFor(() => expect(row).toHaveTextContent('Contacted'))
  expect(calls.filter((c) => c.key === 'GET /api/orgs?sort=name')).toHaveLength(1)
})

test('a record that no longer matches the filter leaves the table', async () => {
  const user = userEvent.setup()
  stubFetch({
    'GET /api/orgs?sort=name': () => [lead, client],
    ...drawerRoutes,
    'PATCH /api/orgs/1': () => ({ ...lead, status: 'contacted' }),
  })
  renderApp(<ListPage />, '/list?status=lead')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await changeStatus(user, 'Contacted')
  await vi.waitFor(() => expect(screen.queryByRole('cell', { name: 'Acme' })).toBeNull())
})

test('the owner dropdown filters and goes in the address', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<><ListPage /><Where /></>, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Owner' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'bo' }))
  expect(await screen.findByText('at /list?owner=bo%40example.com')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the kind chips count and filter', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client, org({ id: 3, name: 'Cobalt', slug: 'cobalt' })] })
  renderApp(<><ListPage /><Where /></>, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  const kind = within(screen.getByRole('group', { name: 'Kind' }))
  expect(kind.getAllByRole('button').map((b) => b.textContent)).toEqual(['All3', 'Leads2', 'Clients1'])
  await user.click(kind.getByRole('button', { name: /^Leads/ }))
  expect(await screen.findByText('at /list?kind=lead')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Bolt' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Cobalt' })).toBeInTheDocument()
})

test('?kind=client on load presses Clients', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=client')
  await screen.findByRole('link', { name: 'Bolt' })
  expect(screen.getByRole('button', { name: /^Clients/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
})

test('the table has a sector column', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('columnheader', { name: 'Sector' })).toBeInTheDocument()
})

test('filterOrgs with owner none keeps organisations without an owner', () => {
  expect(filterOrgs([org({ id: 1, owner_email: null }), org({ id: 2 })], { kind: '', status: '', owner: 'none', tag: '' }).map((o) => o.id)).toEqual([1])
})

test('the kind chip counts follow the filter box', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client] })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.type(screen.getByRole('searchbox', { name: 'Filter organisations' }), 'bolt')
  const kind = within(screen.getByRole('group', { name: 'Kind' }))
  expect(kind.getAllByRole('button').map((b) => b.textContent)).toEqual(['All1', 'Leads0', 'Clients1'])
})

test('New in the header adds the row, clears what would hide it, and closing the drawer focuses the row', async () => {
  const user = userEvent.setup()
  const fresh = org({ id: 3, name: 'Mmm', slug: 'mmm', status: 'lead', owner_email: 'rui@example.com' })
  let posted = false
  stubFetch({
    'GET /api/orgs?sort=name': () => (posted ? [lead, client, fresh] : [lead, client]),
    'POST /api/orgs': () => ((posted = true), fresh),
    'GET /api/orgs/by-slug/mmm': () => fresh,
    'GET /api/orgs/3/contacts': () => [],
    'GET /api/orgs/3/timeline': () => [],
    'GET /api/orgs/3/research': () => [],
    'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/list" element={<ListPage />} />
      </Route>
    </Routes>,
    '/list?kind=client',
  )
  await screen.findByRole('link', { name: 'Bolt' })
  await user.type(screen.getByRole('searchbox', { name: 'Filter organisations' }), 'bol')
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Mmm')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  const drawer = await screen.findByRole('dialog', { name: 'Mmm' })
  expect(screen.getByRole('link', { name: 'Mmm', hidden: true })).toBeInTheDocument()
  await user.click(within(drawer).getByRole('button', { name: /close/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('link', { name: 'Mmm' })).toHaveFocus()
})

test('a new organisation lands in A to Z order, not at the top', async () => {
  const user = userEvent.setup()
  const zed = org({ id: 4, name: 'Zed', slug: 'zed' })
  const fresh = org({ id: 3, name: 'Mmm', slug: 'mmm', status: 'lead' })
  let posted = false
  stubFetch({
    'GET /api/orgs?sort=name': () => (posted ? [lead, fresh, zed] : [lead, zed]),
    'POST /api/orgs': () => ((posted = true), fresh),
    'GET /api/orgs/by-slug/mmm': () => fresh,
    'GET /api/orgs/3/contacts': () => [],
    'GET /api/orgs/3/timeline': () => [],
    'GET /api/orgs/3/research': () => [],
    'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/list" element={<ListPage />} />
      </Route>
    </Routes>,
    '/list',
  )
  await screen.findByRole('link', { name: 'Zed' })
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Mmm')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('dialog', { name: 'Mmm' })
  await waitFor(() =>
    expect(screen.getAllByRole('link', { hidden: true }).map((l) => l.textContent).filter((n) => ['Acme', 'Mmm', 'Zed'].includes(n!)))
      .toEqual(['Acme', 'Mmm', 'Zed']),
  )
})


test('partners have their own tab and are not on the List', async () => {
  const partner = org({ id: 3, name: 'Northwind', slug: 'northwind', kind: 'partner', status: 'active' })
  stubFetch({ 'GET /api/orgs?sort=name': () => [lead, client, partner] })
  renderApp(<ListPage />, '/list?kind=partner')
  expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Northwind' })).toBeNull()
  expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('2')
})
