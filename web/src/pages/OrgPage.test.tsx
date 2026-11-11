import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { contact, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
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
