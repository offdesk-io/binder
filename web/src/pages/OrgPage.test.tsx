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
    'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
    ...extra,
  })
}

test('shows the header, quick actions and overview', async () => {
  stubs()
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'acme.example.com' })).toHaveAttribute('href', 'https://acme.example.com')
  expect(screen.getByText('Design studio in Leeds')).toBeInTheDocument()
  expect(screen.getByText('€5,000')).toBeInTheDocument()
  const facts = screen.getByText('Value').closest('dl')!
  expect(within(facts).getByText('Value').tagName).toBe('DT')
  expect(within(facts).getByText('€5,000').tagName).toBe('DD')
  expect(within(facts).getByText('Last contact').tagName).toBe('DT')
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
  expect(screen.getByText(/Client · handled by/)).toBeInTheDocument()
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
  const header = container.querySelector('.tn-toolbar')?.lastElementChild as HTMLElement
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
  expect(screen.getByText('· 1 Nov 2026')).toBeInTheDocument()
})

test('with Bench off the Work section is not shown and Work is not asked for', async () => {
  const calls = stubs()
  renderApp(<Routes><Route path="/o/:slug" element={<OrgPage />} /></Routes>, '/o/acme', { ...SESSION, meta: { ...SESSION.meta, bench: false } })
  await screen.findByRole('heading', { level: 1, name: 'Acme' })
  expect(screen.queryByRole('heading', { name: 'Work' })).toBeNull()
  expect(calls.some((c) => c.key === 'GET /api/orgs/1/work')).toBe(false)
})

test('a lead or client shows who introduced it, linking to that page', async () => {
  const intro = { id: 8, slug: 'pixel', name: 'Pixel Partners', kind: 'partner' as const }
  stubs({ 'GET /api/orgs/by-slug/acme': () => ({ ...acme, introduced_by_id: 8, introduced_by: intro }) })
  page()
  await screen.findByRole('heading', { level: 1, name: 'Acme' })
  expect(screen.getByText(/Introduced by/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Pixel Partners' })).toHaveAttribute('href', '/o/pixel')
  expect(screen.queryByRole('heading', { name: 'Introduced' })).toBeNull()
})

test('a lead with nobody behind it shows no Introduced by', async () => {
  stubs()
  page()
  await screen.findByRole('heading', { level: 1, name: 'Acme' })
  expect(screen.queryByText(/Introduced by/)).toBeNull()
})

test('a partner lists what it introduced, each linking to its page with its status', async () => {
  const partner = org({
    id: 1, slug: 'acme', name: 'Acme', kind: 'partner', status: 'active',
    introduced: [
      { id: 3, slug: 'bolt', name: 'Bolt', kind: 'lead', status: 'contacted' },
      { id: 4, slug: 'cobalt', name: 'Cobalt', kind: 'client', status: 'paused' },
    ],
  })
  stubs({ 'GET /api/orgs/by-slug/acme': () => partner })
  page()
  const section = (await screen.findByRole('heading', { name: 'Introduced' })).closest('.tenon-column')!
  expect(within(section as HTMLElement).getByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(within(section as HTMLElement).getByRole('link', { name: 'Cobalt' })).toHaveAttribute('href', '/o/cobalt')
  expect(section).toHaveTextContent('Contacted')
  expect(section).toHaveTextContent('Paused')
  expect(screen.getByText(/Partner · handled by/)).toBeInTheDocument()
})

test('a referrer that has introduced nobody says so, and its status picker is its own', async () => {
  const user = userEvent.setup()
  stubs({ 'GET /api/orgs/by-slug/acme': () => org({ id: 1, kind: 'referrer', status: 'identified' }) })
  page()
  expect(await screen.findByText('Nobody introduced yet.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Identified', 'In talks', 'Active', 'Paused'])
})

async function deleteFromPage(kind: 'lead' | 'client' | 'partner' | 'referrer') {
  const user = userEvent.setup()
  stubs({
    'GET /api/orgs/by-slug/acme': () => org({ id: 1, kind, status: kind === 'client' ? 'active' : kind === 'lead' ? 'lead' : 'identified' }),
    'GET /api/orgs?kind=partner&sort=name': () => [],
    'GET /api/orgs?kind=referrer&sort=name': () => [],
    'DELETE /api/orgs/1': () => undefined,
  })
  renderApp(
    <Routes>
      <Route path="/o/:slug" element={<OrgPage />} />
      <Route path="/pipeline" element={<p>pipeline page</p>} />
      <Route path="/clients" element={<p>clients page</p>} />
    </Routes>,
    '/o/acme',
  )
  await user.click(await screen.findByRole('button', { name: 'Edit' }))
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: 'Delete this organisation' }))
}

test('deleting a client from its page goes to Clients', async () => {
  await deleteFromPage('client')
  expect(await screen.findByText('clients page')).toBeInTheDocument()
})

test('deleting a lead from its page goes to the Pipeline, on the Leads segment', async () => {
  localStorage.setItem('binder.pipeline.kind', 'partner')
  await deleteFromPage('lead')
  expect(await screen.findByText('pipeline page')).toBeInTheDocument()
  expect(localStorage.getItem('binder.pipeline.kind')).toBe('lead')
  localStorage.clear()
})

test.each(['partner', 'referrer'] as const)('deleting a %s from its page goes to the Pipeline with that segment selected', async (kind) => {
  localStorage.clear()
  await deleteFromPage(kind)
  expect(await screen.findByText('pipeline page')).toBeInTheDocument()
  expect(localStorage.getItem('binder.pipeline.kind')).toBe(kind)
  localStorage.clear()
})

test('what they do shows under the name, and the sector and handler by name', async () => {
  stubs({ 'GET /api/orgs/by-slug/acme': () => org({ id: 1, description: 'Makes industrial kilns', sector: 'manufacturing', owner_email: 'rui@example.com' }) })
  page()
  const title = await screen.findByRole('heading', { level: 1, name: 'Acme' })
  const text = screen.getByText('Makes industrial kilns')
  expect(title.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('Manufacturing')).toBeInTheDocument()
  expect(screen.getByText(/Lead · handled by Rui/)).toBeInTheDocument()
})

test('a referrer shows its details as a person card at the top and has no People section', async () => {
  const rui = org({
    id: 1, name: 'Rui Costa', kind: 'referrer', status: 'identified', description: 'Costa Kilns',
    person: { contact_id: 4, email: 'rui@example.com', phone: '+351 900 000 000', linkedin_url: 'linkedin.com/in/rui' },
  })
  stubs({ 'GET /api/orgs/by-slug/acme': () => rui })
  page()
  const card = (await screen.findByRole('heading', { name: 'Contact details' })).closest('#person') as HTMLElement
  expect(card).not.toBeNull()
  expect(within(card).getByText('Costa Kilns')).toBeInTheDocument()
  expect(within(card).getByRole('link', { name: 'rui@example.com' })).toHaveAttribute('href', 'mailto:rui@example.com')
  expect(within(card).getByRole('link', { name: '+351 900 000 000' })).toHaveAttribute('href', 'tel:+351 900 000 000')
  expect(within(card).getByRole('link', { name: 'linkedin.com/in/rui' })).toHaveAttribute('href', 'https://linkedin.com/in/rui')
  expect(screen.queryByRole('heading', { name: 'People' })).toBeNull()
  // Works at is in the card, not repeated under the name.
  expect(screen.getAllByText('Costa Kilns')).toHaveLength(1)
})

test('a company still has its People section and no person card', async () => {
  stubs()
  page()
  await screen.findByRole('heading', { level: 1, name: 'Acme' })
  expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Contact details' })).toBeNull()
})
