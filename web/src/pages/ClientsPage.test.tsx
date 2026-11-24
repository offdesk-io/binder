import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { Org } from '../api/types'
import { AT, org } from '../test/fixtures'
import { Layout } from '../app/Layout'
import { renderApp, stubFetch } from '../test/render'
import { filterOrgs, ClientsPage, options } from './ClientsPage'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

const acme = org({ id: 1, name: 'Acme', slug: 'acme', kind: 'client', status: 'active', tags: ['design'] })
const bolt = org({ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'paused', owner_email: 'bo@example.com' })
const NAME = 'GET /api/orgs?kind=client&sort=name'
const UPDATED = 'GET /api/orgs?kind=client&sort=updated'

test('filterOrgs applies every filter that is set', () => {
  const all = { status: '', owner: '', tag: '' }
  expect(filterOrgs([acme, bolt], all)).toEqual([acme, bolt])
  expect(filterOrgs([acme, bolt], { ...all, status: 'paused' })).toEqual([bolt])
  expect(filterOrgs([acme, bolt], { ...all, tag: 'design' })).toEqual([acme])
  expect(filterOrgs([acme, bolt], { ...all, owner: 'bo@example.com' })).toEqual([bolt])
})

test('filterOrgs with owner none keeps organisations without an owner', () => {
  expect(filterOrgs([org({ id: 1, owner_email: null }), org({ id: 2 })], { status: '', owner: 'none', tag: '' }).map((o) => o.id)).toEqual([1])
})

test('options are unique and sorted, after an Any choice', () => {
  expect(options(['b', null, 'a', 'b'], 'Anyone')).toEqual([
    { value: '', label: 'Anyone' }, { value: 'a', label: 'a' }, { value: 'b', label: 'b' },
  ])
})

test('it asks for clients only, A to Z, and shows rows in that order', async () => {
  const calls = stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<ClientsPage />, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toEqual([NAME])
  const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
  expect(names).toEqual(['Acme', 'Bolt'])
  expect(screen.getByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
})

test('there are no kind chips, and the status filter offers only client statuses', async () => {
  const user = userEvent.setup()
  stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<ClientsPage />, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.queryByRole('group', { name: 'Kind' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual(['Any status', 'Active', 'Paused', 'Past'])
})

test('changing the sort asks the API again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ [NAME]: () => [acme, bolt], [UPDATED]: () => [acme, bolt] })
  renderApp(<ClientsPage />, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Recently updated' }))
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toContain(UPDATED)
})

test('another sort goes in the address and Name takes it out again', async () => {
  const user = userEvent.setup()
  stubFetch({ [NAME]: () => [acme, bolt], [UPDATED]: () => [acme, bolt] })
  renderApp(<><ClientsPage /><Where /></>, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Recently updated' }))
  expect(await screen.findByText('at /clients?sort=updated')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
  expect(await screen.findByText('at /clients')).toBeInTheDocument()
})

test('the filter box narrows rows by name, sector and description, and stays out of the address', async () => {
  const user = userEvent.setup()
  const rows = [
    acme,
    bolt,
    org({ id: 3, name: 'Cobalt', slug: 'cobalt', kind: 'client', sector: 'Fintech' }),
    org({ id: 4, name: 'Delta', slug: 'delta', kind: 'client', description: 'Sends proposals' }),
  ]
  stubFetch({ [NAME]: () => rows })
  renderApp(<><ClientsPage /><Where /></>, '/clients')
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
  expect(screen.getByText('at /clients')).toBeInTheDocument()
})

test('an unknown status in the URL is ignored', async () => {
  stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<ClientsPage />, '/clients?status=nope')
  expect(await screen.findByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the status filter goes in the address', async () => {
  const user = userEvent.setup()
  stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<><ClientsPage /><Where /></>, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Paused' }))
  expect(await screen.findByText('at /clients?status=paused')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('changing the sort keeps the list and the dropdowns on screen', async () => {
  const user = userEvent.setup()
  let release!: (v: Org[]) => void
  stubFetch({ [NAME]: () => [acme, bolt] })
  const first = fetch
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url === '/api/orgs?kind=client&sort=updated'
      ? new Promise<Response>((r) => { release = (v) => r(new Response(JSON.stringify(v), { status: 200 })) })
      : first(url, init))
  renderApp(<ClientsPage />, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Recently updated' }))
  expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Handled by' })).toBeInTheDocument()
  release([bolt, acme])
})

test('the page has a visually hidden title', async () => {
  stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<ClientsPage />, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('heading', { level: 1, name: 'Clients' })).toHaveClass('tn-custom-sr-only')
})

const drawerRoutes = {
  'GET /api/orgs/by-slug/acme': () => acme,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

test('a row opens the organisation in the drawer', async () => {
  const user = userEvent.setup()
  stubFetch({ [NAME]: () => [acme, bolt], ...drawerRoutes })
  renderApp(<><ClientsPage /><Where /></>, '/clients')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByText('at /clients?org=acme')).toBeInTheDocument()
})

test('on a phone, a card opens the drawer too', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  stubFetch({ [NAME]: () => [acme, bolt], ...drawerRoutes })
  renderApp(<ClientsPage />, '/clients')
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
    [NAME]: () => [acme, bolt],
    ...drawerRoutes,
    'PATCH /api/orgs/1': () => ({ ...acme, status: 'past' }),
  })
  renderApp(<ClientsPage />, '/clients')
  const row = (await screen.findByRole('link', { name: 'Acme' })).closest('tr')!
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  await changeStatus(user, 'Past')
  await vi.waitFor(() => expect(row).toHaveTextContent('Past'))
  expect(calls.filter((c) => c.key === NAME)).toHaveLength(1)
})

test('a record that no longer matches the filter leaves the table', async () => {
  const user = userEvent.setup()
  stubFetch({
    [NAME]: () => [acme, bolt],
    ...drawerRoutes,
    'PATCH /api/orgs/1': () => ({ ...acme, status: 'past' }),
  })
  renderApp(<ClientsPage />, '/clients?status=active')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await changeStatus(user, 'Past')
  await vi.waitFor(() => expect(screen.queryByRole('cell', { name: 'Acme' })).toBeNull())
})

test('a record refiled as another kind leaves the table', async () => {
  const user = userEvent.setup()
  stubFetch({
    [NAME]: () => [acme, bolt],
    ...drawerRoutes,
    'GET /api/orgs?kind=partner&sort=name': () => [],
    'GET /api/orgs?kind=referrer&sort=name': () => [],
    'PATCH /api/orgs/1': () => ({ ...acme, kind: 'partner', status: 'identified' }),
  })
  renderApp(<ClientsPage />, '/clients')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  const drawer = within(await screen.findByRole('dialog', { name: 'Acme' }))
  await user.click(await drawer.findByRole('button', { name: 'Edit' }))
  await user.click(screen.getByRole('radio', { name: 'Partner' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(screen.queryByRole('cell', { name: 'Acme' })).toBeNull())
})

test('the owner dropdown filters and goes in the address', async () => {
  const user = userEvent.setup()
  stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<><ClientsPage /><Where /></>, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Handled by' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'bo' }))
  expect(await screen.findByText('at /clients?owner=bo%40example.com')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the table has a sector column', async () => {
  stubFetch({ [NAME]: () => [acme, bolt] })
  renderApp(<ClientsPage />, '/clients')
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('columnheader', { name: 'Sector' })).toBeInTheDocument()
})

const introducers = {
  'GET /api/orgs?kind=partner&sort=name': () => [],
  'GET /api/orgs?kind=referrer&sort=name': () => [],
}
const freshRoutes = {
  'GET /api/orgs/by-slug/mmm': () => fresh,
  'GET /api/orgs/3/contacts': () => [],
  'GET /api/orgs/3/timeline': () => [],
  'GET /api/orgs/3/research': () => [],
  'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}
const fresh = org({ id: 3, name: 'Mmm', slug: 'mmm', kind: 'client', status: 'active', owner_email: 'rui@example.com' })

test('New in the header adds a client row, clears what would hide it, and closing the drawer focuses the row', async () => {
  const user = userEvent.setup()
  let posted = false
  stubFetch({
    [NAME]: () => (posted ? [acme, bolt, fresh] : [acme, bolt]),
    'POST /api/orgs': () => ((posted = true), fresh),
    ...introducers,
    ...freshRoutes,
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/clients" element={<ClientsPage />} />
      </Route>
    </Routes>,
    '/clients',
  )
  await screen.findByRole('link', { name: 'Bolt' })
  await user.type(screen.getByRole('searchbox', { name: 'Filter organisations' }), 'bol')
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Mmm')
  await user.click(screen.getByRole('radio', { name: 'Client' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  const drawer = await screen.findByRole('dialog', { name: 'Mmm' })
  expect(screen.getByRole('link', { name: 'Mmm', hidden: true })).toBeInTheDocument()
  await user.click(within(drawer).getByRole('button', { name: /close/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('link', { name: 'Mmm' })).toHaveFocus()
})

test('a new client lands in A to Z order, not at the top', async () => {
  const user = userEvent.setup()
  const zed = org({ id: 4, name: 'Zed', slug: 'zed', kind: 'client' })
  let posted = false
  stubFetch({
    [NAME]: () => (posted ? [acme, fresh, zed] : [acme, zed]),
    'POST /api/orgs': () => ((posted = true), fresh),
    ...introducers,
    ...freshRoutes,
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/clients" element={<ClientsPage />} />
      </Route>
    </Routes>,
    '/clients',
  )
  await screen.findByRole('link', { name: 'Zed' })
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Mmm')
  await user.click(screen.getByRole('radio', { name: 'Client' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('dialog', { name: 'Mmm' })
  await waitFor(() =>
    expect(screen.getAllByRole('link', { hidden: true }).map((l) => l.textContent).filter((n) => ['Acme', 'Mmm', 'Zed'].includes(n!)))
      .toEqual(['Acme', 'Mmm', 'Zed']),
  )
})

test('a new lead made from here opens in the drawer without a row', async () => {
  const user = userEvent.setup()
  const lead = org({ id: 3, name: 'Mmm', slug: 'mmm', kind: 'lead' })
  stubFetch({
    [NAME]: () => [acme, bolt],
    'POST /api/orgs': () => lead,
    ...introducers,
    'GET /api/orgs/by-slug/mmm': () => lead,
    'GET /api/orgs/3/contacts': () => [],
    'GET /api/orgs/3/timeline': () => [],
    'GET /api/orgs/3/research': () => [],
    'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/clients" element={<ClientsPage />} />
      </Route>
    </Routes>,
    '/clients',
  )
  await screen.findByRole('link', { name: 'Bolt' })
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Mmm')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('dialog', { name: 'Mmm' })
  expect(screen.queryByRole('cell', { name: 'Mmm' })).toBeNull()
})
