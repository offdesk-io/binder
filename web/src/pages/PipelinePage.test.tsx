import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { byStatus, PipelinePage } from './PipelinePage'

const a = org({ id: 1, name: 'Acme', slug: 'acme', status: 'lead' })
const b = org({ id: 2, name: 'Bolt', slug: 'bolt', status: 'contacted' })

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

test('on a phone, a card moves with its status picker, and Won says it became a client', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?kind=lead': () => [a, b],
    'PATCH /api/orgs/1': () => org({ ...a, kind: 'client', status: 'active' }),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: 'Status of Acme' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  expect(calls[1].body).toEqual({ updated_at: a.updated_at, status: 'won' })
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull())
})

test('desktop cards also carry a status picker, and a failed move shows a notice and reloads', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?kind=lead': () => [a, b],
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Server error' }), { status: 500 }),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: 'Status of Acme' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  expect(await screen.findByText('Server error')).toBeInTheDocument()
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs?kind=lead')).toHaveLength(2))
})

test('two quick moves do not undo each other', async () => {
  const user = userEvent.setup()
  stubFetch({
    'GET /api/orgs?kind=lead': () => [a, b],
    'PATCH /api/orgs/1': () => org({ ...a, status: 'contacted' }),
    'PATCH /api/orgs/2': () => org({ ...b, status: 'parked' }),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: 'Status of Acme' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await user.click(await screen.findByRole('button', { name: 'Status of Bolt' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Parked' }))
  await waitFor(() => expect(within(screen.getByTestId('stage-parked')).getByRole('link', { name: 'Bolt' })).toBeInTheDocument())
  expect(within(screen.getByTestId('stage-contacted')).getByRole('link', { name: 'Acme' })).toBeInTheDocument()
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

test('a stale move shows the current record without reloading the list', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?kind=lead': () => [a, b],
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: { ...a, name: 'Acme Ltd', status: 'lead' } }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      }),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: 'Status of Acme' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  expect(await screen.findByRole('link', { name: 'Acme Ltd' })).toBeInTheDocument()
  expect(calls.filter((c) => c.key === 'GET /api/orgs?kind=lead')).toHaveLength(1)
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
