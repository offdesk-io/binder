import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { brief, contact, interaction, research } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactPage } from './ContactPage'

const bo = contact({ role: 'CEO', email: 'bo@example.com', notes: 'Prefers mornings', relationship: 'warm' })

function page() {
  stubFetch({
    'GET /api/contacts/5': () => bo,
    'GET /api/contacts/5/interactions': () => [interaction({ contact_ids: [5] })],
    'GET /api/orgs/1/contacts': () => [bo],
    'GET /api/contacts/5/research': () => [],
  })
  return renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
}

test('shows the person, their organisation and what was logged with them', async () => {
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Bo' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Prefers mornings')).toBeInTheDocument()
  expect(screen.getByText('Warm')).toBeInTheDocument()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
})

test('Log opens with this person ticked', async () => {
  const user = userEvent.setup()
  page()
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
})

test('a link that is not a number says not found without calling the API', async () => {
  const calls = stubFetch({})
  renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/abc')
  expect(await screen.findByText('Person not found')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
})

test('a LinkedIn value that is not http(s) is shown as text, not a link', async () => {
  stubFetch({
    'GET /api/contacts/5': () => ({ ...bo, linkedin_url: 'javascript:alert(1)' }),
    'GET /api/contacts/5/interactions': () => [],
    'GET /api/orgs/1/contacts': () => [bo],
    'GET /api/contacts/5/research': () => [],
  })
  renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
  expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
})

test('a bare LinkedIn address becomes an https link', async () => {
  stubFetch({
    'GET /api/contacts/5': () => ({ ...bo, linkedin_url: 'linkedin.com/in/bo' }),
    'GET /api/contacts/5/interactions': () => [],
    'GET /api/orgs/1/contacts': () => [bo],
    'GET /api/contacts/5/research': () => [],
  })
  renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
  expect(await screen.findByRole('link', { name: 'Profile' })).toHaveAttribute('href', 'https://linkedin.com/in/bo')
})

test("shows the person's research", async () => {
  stubFetch({
    'GET /api/contacts/5': () => bo,
    'GET /api/contacts/5/interactions': () => [],
    'GET /api/orgs/1/contacts': () => [bo],
    'GET /api/contacts/5/research': () => [research({ contact_id: 5, brief: brief({ overview: 'Bo collects teapots.' }) })],
  })
  renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
  expect(await screen.findByText('Bo collects teapots.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '#research')
})

// Key connector and postal address

function pageFor(c: ReturnType<typeof contact>, extra: Record<string, (body: unknown) => unknown> = {}) {
  const calls = stubFetch({
    'GET /api/contacts/5': () => c,
    'GET /api/contacts/5/interactions': () => [],
    'GET /api/orgs/1/contacts': () => [c],
    'GET /api/contacts/5/research': () => [],
    ...extra,
  })
  renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
  return calls
}

test('the Key connector toggle saves only the star, and the star shows by the name', async () => {
  const user = userEvent.setup()
  const starred = contact({ connector: true, updated_at: '2026-11-11T09:00:00.000000+00:00' })
  const calls = pageFor(contact(), { 'PATCH /api/contacts/5': () => starred })
  const toggle = await screen.findByRole('button', { name: 'Key connector' })
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByRole('img', { name: 'Key person' })).toBeNull()
  await user.click(toggle)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Key connector' })).toHaveAttribute('aria-pressed', 'true'))
  expect(screen.getByRole('img', { name: 'Key person' })).toBeInTheDocument()
  expect(calls.find((c) => c.key === 'PATCH /api/contacts/5')!.body).toEqual({ connector: true, updated_at: contact().updated_at })
})

test('a stale toggle says so and shows their version', async () => {
  const user = userEvent.setup()
  const theirs = contact({ connector: true, role: 'CTO', updated_at: '2026-11-11T09:00:00.000000+00:00' })
  pageFor(contact({ connector: true }), {
    'PATCH /api/contacts/5': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  await user.click(await screen.findByRole('button', { name: 'Key connector' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByText(/CTO at/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Key connector' })).toHaveAttribute('aria-pressed', 'true')
})

test("a referrer's own person shows the star and no toggle", async () => {
  pageFor(contact({ is_referrer: true }))
  expect(await screen.findByRole('img', { name: 'Key person' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Key connector' })).toBeNull()
})

test('the postal address shows in the details, keeping its lines', async () => {
  pageFor(contact({ postal_address: '1 Example Street\nPorto' }))
  const address = await screen.findByText(/1 Example Street/)
  expect(address).toHaveClass('tn-custom-address')
  expect(screen.getByText('Postal address')).toBeInTheDocument()
})
