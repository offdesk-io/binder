import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AT, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { byStatus, PipelinePage } from './PipelinePage'

const a = org({ id: 1, name: 'Acme', slug: 'acme', status: 'lead' })
const b = org({ id: 2, name: 'Bolt', slug: 'bolt', status: 'contacted' })

const routes = {
  'GET /api/orgs?kind=lead': () => [a, b],
  'GET /api/orgs/by-slug/acme': () => a,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

test('byStatus gives every stage a list, even an empty one', () => {
  const g = byStatus([a, b], ['lead', 'contacted', 'won'])
  expect(g.lead).toEqual([a])
  expect(g.contacted).toEqual([b])
  expect(g.won).toEqual([])
})

test('desktop draws a column per lead status', async () => {
  stubFetch({ 'GET /api/orgs?kind=lead': () => [a, b] })
  renderApp(<PipelinePage />)
  const lead = await screen.findByTestId('stage-lead')
  expect(within(lead).getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(within(screen.getByTestId('stage-contacted')).getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  expect(within(screen.getByTestId('stage-won')).getByText('Drop a lead here when it is won.')).toBeInTheDocument()
})

test('on a phone the empty Won stage does not tell you to drag', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  stubFetch({ 'GET /api/orgs?kind=lead': () => [a, b] })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('radio', { name: /Won/ }))
  expect(screen.getByText('No won leads yet.')).toBeInTheDocument()
  expect(screen.queryByText(/Drop a lead/)).toBeNull()
})

test('the pipeline has a visually hidden title', async () => {
  stubFetch({ 'GET /api/orgs?kind=lead': () => [a, b] })
  renderApp(<PipelinePage />)
  await screen.findByTestId('stage-lead')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
})

test('the phone pipeline has a visually hidden title too', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  stubFetch({ 'GET /api/orgs?kind=lead': () => [a, b] })
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
})

test('cards carry no status picker', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByTestId('stage-lead')
  expect(screen.queryByRole('button', { name: /Status of/ })).toBeNull()
})

test('clicking a card opens it in the drawer, and a move there updates the board', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, status: 'contacted' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await waitFor(() => expect(within(screen.getByTestId('stage-contacted')).getByRole('link', { name: 'Acme' })).toBeInTheDocument())
})

test('Won from the drawer says it became a client and takes it off the board', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, kind: 'client', status: 'active' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  await waitFor(() => expect(within(screen.getByTestId('stage-lead')).queryByRole('link', { name: 'Acme' })).toBeNull())
})

test('after Won, a later save of the same client does not announce it again', async () => {
  const user = userEvent.setup()
  const won = org({ ...a, kind: 'client', status: 'active' })
  stubFetch({
    ...routes,
    'PATCH /api/orgs/1': (body) => ((body as { status?: string }).status ? won : org({ ...won, sector: 'Retail', updated_at: '2026-11-11T12:00:00.000000+00:00' })),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByLabelText('Sector'), 'Retail')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByText('Acme is now a client.')).toBeNull())
})

test('a client opened by its link and edited in the drawer shows no notice', async () => {
  const user = userEvent.setup()
  const client = org({ id: 1, slug: 'acme', name: 'Acme', kind: 'client', status: 'active' })
  const calls = stubFetch({
    ...routes,
    // A client is not on the lead board.
    'GET /api/orgs?kind=lead': () => [b],
    'GET /api/orgs/by-slug/acme': () => client,
    'PATCH /api/orgs/1': () => org({ ...client, sector: 'Retail', updated_at: '2026-11-11T12:00:00.000000+00:00' }),
  })
  renderApp(<PipelinePage />, '/pipeline?org=acme')
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByLabelText('Sector'), 'Retail')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'PATCH /api/orgs/1')).toBe(true))
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Acme' })).toBeInTheDocument())
  expect(screen.queryByText(/is now a client/)).toBeNull()
})

test('on a phone, a card also opens in the drawer', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})

test('the owner chips filter the board', async () => {
  const user = userEvent.setup()
  const c = org({ id: 3, name: 'Cobalt', slug: 'cobalt', status: 'lead', owner_email: 'rui@example.com' })
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [a, b, c] })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: /^Me/ }))
  expect(screen.queryByRole('link', { name: 'Cobalt' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
})

test('the filter box at the end of the chip row narrows the cards on screen', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await user.type(await screen.findByRole('searchbox', { name: 'Filter cards' }), 'bol')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the Lead column offers to add an organisation', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  const lead = await screen.findByTestId('stage-lead')
  expect(within(lead).getByRole('button', { name: '+ Add organisation' })).toBeInTheDocument()
  expect(within(screen.getByTestId('stage-contacted')).queryByRole('button', { name: '+ Add organisation' })).toBeNull()
})

test('a failed drag move shows a notice and reloads', async () => {
  const calls = stubFetch({
    ...routes,
    'PATCH /api/orgs/1': () => new Response(JSON.stringify({ detail: 'Server error' }), { status: 500 }),
  })
  renderApp(<PipelinePage />)
  const card = (await screen.findByRole('link', { name: 'Acme' })).closest('article')!
  fireEvent.dragStart(card, { dataTransfer: { setData() {}, effectAllowed: '' } })
  fireEvent.dragOver(screen.getByTestId('stage-contacted'))
  fireEvent.drop(screen.getByTestId('stage-contacted'))
  expect(await screen.findByText('Server error')).toBeInTheDocument()
  await waitFor(() => expect(calls.filter((x) => x.key === 'GET /api/orgs?kind=lead')).toHaveLength(2))
})

test('a stale drag move shows the current record without reloading the list', async () => {
  const calls = stubFetch({
    ...routes,
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: { ...a, name: 'Acme Ltd' } }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      }),
  })
  renderApp(<PipelinePage />)
  const card = (await screen.findByRole('link', { name: 'Acme' })).closest('article')!
  fireEvent.dragStart(card, { dataTransfer: { setData() {}, effectAllowed: '' } })
  fireEvent.dragOver(screen.getByTestId('stage-contacted'))
  fireEvent.drop(screen.getByTestId('stage-contacted'))
  expect(await screen.findByRole('link', { name: 'Acme Ltd' })).toBeInTheDocument()
  expect(calls.filter((x) => x.key === 'GET /api/orgs?kind=lead')).toHaveLength(1)
})

test('+ Add organisation saves a lead, opens it in the drawer and shows its card under Lead', async () => {
  const user = userEvent.setup()
  const cobalt = org({ id: 3, name: 'Cobalt', slug: 'cobalt', status: 'lead', owner_email: 'rui@example.com' })
  stubFetch({
    ...routes,
    'POST /api/orgs': () => cobalt,
    'GET /api/orgs/by-slug/cobalt': () => cobalt,
    'GET /api/orgs/3/contacts': () => [],
    'GET /api/orgs/3/timeline': () => [],
    'GET /api/orgs/3/research': () => [],
    'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  renderApp(<PipelinePage />, '/pipeline?owner=ana%40example.com')
  await user.type(await screen.findByRole('searchbox', { name: 'Filter cards' }), 'zzz')
  await user.click(within(screen.getByTestId('stage-lead')).getByRole('button', { name: '+ Add organisation' }))
  await user.type(screen.getByLabelText(/^Name/), 'Cobalt')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('dialog', { name: 'Cobalt' })).toBeInTheDocument()
  // The filters that would hide it are cleared, so its card is on the board behind the drawer.
  expect(screen.getByRole('searchbox', { name: 'Filter cards', hidden: true })).toHaveValue('')
  expect(within(screen.getByTestId('stage-lead')).getByRole('link', { name: 'Cobalt', hidden: true })).toBeInTheDocument()
})
