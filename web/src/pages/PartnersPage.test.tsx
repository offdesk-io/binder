import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { Layout } from '../app/Layout'
import { AT, org, person } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { broughtIn, introducedBy, PartnersPage } from './PartnersPage'

const northwind = org({ id: 10, slug: 'northwind', name: 'Northwind', kind: 'partner', status: 'active' })
const acme = org({ id: 1, kind: 'client', status: 'active', value_estimate: 4000, introduced_by_org_id: 10 })
const bolt = org({ id: 2, slug: 'bolt', name: 'Bolt', value_estimate: 900, introduced_by_org_id: 10 })
const marta = person({ id: 8, name: 'Marta', org_id: 10, org_name: 'Northwind', org_slug: 'northwind', connector: true })

test('introducedBy counts each partner’s clients and leads, and what the clients are worth', () => {
  expect(introducedBy([acme, bolt, northwind]).get(10)).toEqual({ clients: 1, leads: 1, value: 4000 })
  expect(introducedBy([northwind]).get(10)).toBeUndefined()
  expect(broughtIn({ clients: 2, leads: 1, value: 0 })).toBe('2 clients · 1 lead')
  expect(broughtIn(undefined)).toBe('Nothing yet')
})

test('lists partners only, with their people, what they brought in and its value', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [acme, bolt, northwind], 'GET /api/people': () => [marta] })
  renderApp(<PartnersPage />, '/partners')
  expect(await screen.findByRole('link', { name: 'Northwind' })).toHaveAttribute('href', '/o/northwind')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.getByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByText('1 client · 1 lead')).toBeInTheDocument()
  expect(screen.getByText('€4,000')).toBeInTheDocument()
})

test('says so when there are no partners', async () => {
  stubFetch({ 'GET /api/orgs?sort=name': () => [acme], 'GET /api/people': () => [] })
  renderApp(<PartnersPage />, '/partners')
  expect(await screen.findByText('No partners yet.')).toBeInTheDocument()
})

test('New partner opens the shared form with Partner chosen, and the new one opens in the drawer', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [],
    'GET /api/people': () => [],
    'POST /api/orgs': () => northwind,
    'GET /api/orgs/by-slug/northwind': () => northwind,
    'GET /api/orgs/10/contacts': () => [],
    'GET /api/orgs/10/timeline': () => [],
    'GET /api/orgs/10/research': () => [],
    'GET /api/orgs/10/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
    'GET /api/orgs/10/introduced': () => ({ orgs: [], client_value: 0 }),
  })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/partners" element={<PartnersPage />} />
      </Route>
    </Routes>,
    '/partners',
  )
  await user.click(await screen.findByRole('button', { name: 'New partner' }))
  expect(screen.getByRole('radio', { name: 'Partner' })).toBeChecked()
  await user.type(screen.getByLabelText(/^Name/), 'Northwind')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.find((c) => c.key === 'POST /api/orgs')?.body).toMatchObject({ name: 'Northwind', kind: 'partner' }))
  expect(await screen.findByRole('dialog', { name: 'Northwind' })).toBeInTheDocument()
})
