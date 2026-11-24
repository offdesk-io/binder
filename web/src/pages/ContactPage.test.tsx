import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import type { Contact } from '../api/types'
import { brief, contact, interaction, research } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactPage } from './ContactPage'

const bo = contact({ role: 'CEO', email: 'bo@example.com', notes: 'Prefers mornings', relationship: 'warm' })
const NOTHING_INTRODUCED = { orgs: [], client_value: 0 }

function stubs(c: Contact = bo, extra: Record<string, (b: unknown) => unknown> = {}) {
  return stubFetch({
    'GET /api/contacts/5': () => c,
    'GET /api/contacts/5/interactions': () => [interaction({ contact_ids: [5] })],
    'GET /api/orgs/1/contacts': () => [c],
    'GET /api/contacts/5/research': () => [],
    'GET /api/contacts/5/introduced': () => NOTHING_INTRODUCED,
    ...extra,
  })
}

function page(path = '/c/5') {
  return renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, path)
}

test('shows the person, their organisation and what was logged with them', async () => {
  stubs()
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Bo' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Prefers mornings')).toBeInTheDocument()
  expect(screen.getByText('Warm')).toBeInTheDocument()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
})

test('Log opens with this person ticked, and saves against them', async () => {
  const user = userEvent.setup()
  const calls = stubs(bo, { 'POST /api/contacts/5/interactions': () => interaction() })
  page()
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
  await user.type(screen.getByLabelText(/What happened/), 'Coffee')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/contacts/5/interactions')).toBe(true))
})

test('a link that is not a number says not found without calling the API', async () => {
  const calls = stubFetch({})
  page('/c/abc')
  expect(await screen.findByText('Person not found')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
})

test('a LinkedIn value that is not http(s) is shown as text, not a link', async () => {
  stubs({ ...bo, linkedin_url: 'javascript:alert(1)' })
  page()
  expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
})

test('a bare LinkedIn address becomes an https link', async () => {
  stubs({ ...bo, linkedin_url: 'linkedin.com/in/bo' })
  page()
  expect(await screen.findByRole('link', { name: 'Profile' })).toHaveAttribute('href', 'https://linkedin.com/in/bo')
})

test("shows the person's research", async () => {
  stubs(bo, {
    'GET /api/contacts/5/research': () => [research({ contact_id: 5, brief: brief({ overview: 'Bo collects teapots.' }) })],
  })
  page()
  expect(await screen.findByText('Bo collects teapots.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Research' })).toHaveAttribute('href', '#research')
})

test('a person with no organisation: no organisation link, no research, and Log is just them', async () => {
  const user = userEvent.setup()
  const solo = contact({ org_id: null, org_name: null, org_slug: null, role: 'Chef' })
  const calls = stubs(solo)
  page()
  expect(await screen.findByText('Chef · No organisation')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Research' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
  expect(calls.some((c) => c.key.startsWith('GET /api/orgs/'))).toBe(false)
  expect(calls.some((c) => c.key === 'GET /api/contacts/5/research')).toBe(false)
})

test('the Key connector chip saves the flag and shows the star', async () => {
  const user = userEvent.setup()
  const calls = stubs(bo, { 'PATCH /api/contacts/5': () => ({ ...bo, connector: true, updated_at: '2026-11-12T00:00:00.000000+00:00' }) })
  page()
  await user.click(await screen.findByRole('button', { name: 'Key connector', pressed: false }))
  expect(await screen.findByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Key connector', pressed: true })).toBeInTheDocument()
  expect(calls.find((c) => c.key === 'PATCH /api/contacts/5')!.body).toEqual({ connector: true, updated_at: bo.updated_at })
})

test('a conflict on the star shows their version', async () => {
  const user = userEvent.setup()
  const theirs = { ...bo, connector: true, role: 'CTO', updated_at: '2026-11-12T00:00:00.000000+00:00' }
  stubs(bo, {
    'PATCH /api/contacts/5': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  page()
  await user.click(await screen.findByRole('button', { name: 'Key connector', pressed: false }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByText(/CTO at/)).toBeInTheDocument()
})

test('shows the postal address and what they introduced', async () => {
  stubs({ ...bo, postal_address: '1 Example Street\nPorto' }, {
    'GET /api/contacts/5/introduced': () => ({
      orgs: [{ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'active', value_estimate: 4000 }],
      client_value: 4000,
    }),
  })
  page()
  expect(await screen.findByText(/1 Example Street/)).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(screen.getByText('Clients worth €4,000')).toBeInTheDocument()
})
