import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { AT, contact, interaction, org, research } from '../test/fixtures'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { OrgPage } from './OrgPage'

const acme = org({ summary: 'Design studio in Leeds', sector: 'Design', value_estimate: 5000, tags: ['design'], website: 'acme.example.com' })

function page() {
  return renderApp(<Routes><Route path="/o/:slug" element={<OrgPage />} /></Routes>, '/o/acme')
}

function stubs(extra: Record<string, (b: unknown) => unknown> = {}) {
  return stubFetch({
    'GET /api/orgs/by-slug/acme': () => acme,
    'GET /api/orgs/1/contacts': () => [contact({ is_primary: true, phone: '+44 20 0000 0000', email: 'bo@example.com' })],
    'GET /api/orgs/1/timeline': () => [],
    'GET /api/orgs/1/research': () => [],
    'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null }),
    ...extra,
  })
}

test('shows the header, quick actions and overview', async () => {
  stubs()
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'acme.example.com' })).toHaveAttribute('href', 'https://acme.example.com')
  expect(screen.getByText('Design studio in Leeds')).toBeInTheDocument()
  expect(screen.getByText('£5,000')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Call Bo' })).toHaveAttribute('href', 'tel:+44 20 0000 0000')
  expect(screen.getByRole('link', { name: 'Email Bo' })).toHaveAttribute('href', 'mailto:bo@example.com')
})

test('changing the status saves it and reloads the timeline', async () => {
  const user = userEvent.setup()
  const calls = stubs({ 'PATCH /api/orgs/1': () => org({ ...acme, status: 'contacted' }) })
  page()
  await user.click(await screen.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs/1/timeline')).toHaveLength(2))
  expect(calls.find((c) => c.key === 'PATCH /api/orgs/1')!.body).toEqual({ updated_at: acme.updated_at, status: 'contacted' })
  expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('Contacted')
})

test('an unknown slug says so', async () => {
  stubFetch({ 'GET /api/orgs/by-slug/acme': () => new Response(JSON.stringify({ detail: "No organisation 'acme'" }), { status: 404 }) })
  page()
  expect(await screen.findByText("No organisation 'acme'")).toBeInTheDocument()
})

test('lists the people, with who to talk to flagged', async () => {
  stubs()
  page()
  expect(await screen.findByRole('link', { name: 'Bo' })).toHaveAttribute('href', '/c/5')
  expect(screen.getByText('Talk to')).toBeInTheDocument()
})

test('the timeline mixes logs and status changes', async () => {
  stubs({
    'GET /api/orgs/1/timeline': () => [
      { kind: 'status', id: 1, org_id: 1, from_status: 'lead', to_status: 'contacted', at: acme.updated_at, by_email: 'ana@example.com' },
      { ...interaction({ contact_ids: [5] }), author_email: undefined, kind: 'interaction', at: acme.updated_at, by_email: 'ana@example.com' },
    ],
  })
  page()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
  expect(screen.getByText('Moved from Lead to Contacted')).toBeInTheDocument()
  expect(await screen.findByText(/with Bo/)).toBeInTheDocument()
})

const conflict = (current: unknown) =>
  new Response(JSON.stringify({ detail: 'Changed', current }), { status: 409, headers: { 'Content-Type': 'application/json' } })

test('winning a lead turns the page into a client with client statuses', async () => {
  const user = userEvent.setup()
  stubs({ 'PATCH /api/orgs/1': () => org({ ...acme, kind: 'client', status: 'active' }) })
  page()
  await user.click(await screen.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('Active'))
  expect(screen.getByText(/Client · owned by/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getByRole('menuitemradio', { name: 'Paused' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitemradio', { name: 'Won' })).toBeNull()
})

test('a conflict on a status change shows their version without reloading', async () => {
  const user = userEvent.setup()
  const calls = stubs({ 'PATCH /api/orgs/1': () => conflict(org({ ...acme, status: 'in_conversation' })) })
  page()
  await user.click(await screen.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Status' })).toHaveTextContent('In conversation')
  expect(calls.filter((c) => c.key === 'GET /api/orgs/by-slug/acme')).toHaveLength(1)
})

test('Log opens the quick log, and saving reloads the timeline and the organisation', async () => {
  const user = userEvent.setup()
  const calls = stubs({ 'POST /api/orgs/1/interactions': () => interaction() })
  page()
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText(/What happened/), 'Kick-off')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs/1/timeline')).toHaveLength(2))
  expect(calls.filter((c) => c.key === 'GET /api/orgs/by-slug/acme')).toHaveLength(2)
  expect(calls.some((c) => c.key === 'POST /api/orgs/1/interactions')).toBe(true)
})

test('on a phone the sticky bar holds Log and Call and the header has no Log', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))
  stubs()
  const { container } = page()
  await screen.findByRole('heading', { level: 1, name: 'Acme' })
  const bar = await waitFor(() => {
    const el = container.querySelector('.tn-custom-bar') as HTMLElement
    expect(within(el).getByRole('link', { name: 'Call' })).toBeInTheDocument()
    return el
  })
  expect(within(bar).getByRole('button', { name: 'Log' })).toBeInTheDocument()
  const header = container.querySelector('.tn-custom-actions') as HTMLElement
  expect(within(header).queryByRole('button', { name: 'Log' })).toBeNull()
  expect(within(header).queryByRole('link', { name: /^Call/ })).toBeNull()
})

test('deleting a person reloads the timeline, and the log no longer offers them', async () => {
  const user = userEvent.setup()
  let gone = false
  const withBo = { ...interaction({ contact_ids: [5] }), kind: 'interaction', at: acme.updated_at, by_email: 'ana@example.com' }
  const calls = stubs({
    'GET /api/orgs/1/contacts': () => (gone ? [] : [contact()]),
    'GET /api/orgs/1/timeline': () => [withBo],
    'DELETE /api/contacts/5': () => { gone = true; return undefined },
    'PATCH /api/interactions/7': () => interaction(),
  })
  page()
  await user.click(await screen.findByRole('button', { name: 'Edit Bo' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: 'Delete this person' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs/1/timeline')).toHaveLength(2))
  await user.click(await screen.findByRole('button', { name: /^Edit Call on/ }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText('Next step'), 'Send rates')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'PATCH /api/interactions/7')).toBe(true))
  expect(calls.find((c) => c.key === 'PATCH /api/interactions/7')!.body).toEqual({
    next_step: 'Send rates',
    contact_ids: [],
    updated_at: withBo.updated_at,
  })
})

test('the research section shows the latest brief, and the header links to it', async () => {
  stubs({ 'GET /api/orgs/1/research': () => [research()] })
  page()
  expect(await screen.findByText('A made-up pottery.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '#research')
})

test('a finished Bench task joins the timeline, linked to Bench', async () => {
  stubs({
    'GET /api/orgs/1/timeline': () => [
      { kind: 'bench', id: 'bb0001', title: 'Kickoff deck', at: '2026-11-01T00:00:00.000000+00:00', by_email: null, url: 'https://bench.example.com/#!board=work!task=bb0001' },
    ],
  })
  page()
  expect(await screen.findByRole('link', { name: 'Kickoff deck' })).toHaveAttribute('href', 'https://bench.example.com/#!board=work!task=bb0001')
  expect(screen.getByText(/Finished in Bench:/)).toBeInTheDocument()
  expect(screen.getByText(/Nov 2026/)).toBeInTheDocument()
})

test('with Bench off the Work section is not shown and Work is not asked for', async () => {
  const calls = stubs()
  renderApp(<Routes><Route path="/o/:slug" element={<OrgPage />} /></Routes>, '/o/acme', { ...SESSION, meta: { ...SESSION.meta, bench: false } })
  await screen.findByRole('heading', { level: 1, name: 'Acme' })
  expect(screen.queryByRole('heading', { name: 'Work' })).toBeNull()
  expect(calls.some((c) => c.key === 'GET /api/orgs/1/work')).toBe(false)
})
