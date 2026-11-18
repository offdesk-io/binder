import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { activity, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { HomePage } from './HomePage'

test('shows what needs attention, with its reasons, and recent activity', async () => {
  stubFetch({
    'GET /api/orgs': () => [org({ value_estimate: 1000 }), org({ id: 2, kind: 'client', status: 'active' })],
    'GET /api/attention': () => [
      { org: org({ next_step: 'Send the deck', next_step_due: '2000-01-01' }), reasons: ['overdue', 'quiet'] },
    ],
    'GET /api/activity?limit=30': () => [
      activity(),
      activity({ kind: 'interaction', id: 2, type: 'call', summary: 'Rang about rates', from_status: null, to_status: null }),
    ],
  })
  renderApp(<HomePage />)
  expect(await screen.findByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Next step overdue')).toBeInTheDocument()
  expect(screen.getByText('No contact in 14 days')).toBeInTheDocument()
  expect(screen.getByText('1 Jan 2000')).toHaveClass('tenon-tag--urgent')
  expect(screen.getByText('Next step overdue')).toHaveClass('tenon-tag--urgent')
  expect(screen.getByText('Open pipeline').closest('.tenon-stat')).toHaveClass('tenon-stat')
  expect(await screen.findByText('€1,000')).toBeInTheDocument()
  expect(screen.getByText('1 with a missed next step')).toBeInTheDocument()
  expect(await screen.findByText('Moved from Lead to Contacted')).toBeInTheDocument()
  expect(screen.getByText('Call: Rang about rates')).toBeInTheDocument()
  const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
  expect(hrefs).toContain('/o/bolt#i-2')
  expect(hrefs).toContain('/o/bolt')
})

test('says so when nothing needs attention', async () => {
  stubFetch({ 'GET /api/attention': () => [], 'GET /api/activity?limit=30': () => [] })
  renderApp(<HomePage />)
  expect(await screen.findByText('Nothing needs you today.')).toBeInTheDocument()
  expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument()
})

test('Home has a visually hidden title: the tab says where you are', async () => {
  stubFetch({
    'GET /api/orgs': () => [org()],
    'GET /api/attention': () => [],
    'GET /api/activity?limit=30': () => [],
  })
  renderApp(<HomePage />)
  await screen.findByText('Open pipeline')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
})

test('the three figures sit in one panel', async () => {
  stubFetch({
    'GET /api/orgs': () => [org()],
    'GET /api/attention': () => [],
    'GET /api/activity?limit=30': () => [],
  })
  renderApp(<HomePage />)
  const panel = await screen.findByTestId('figures')
  expect(within(panel).getByText('Open pipeline')).toBeInTheDocument()
  expect(within(panel).getByText('Needs attention')).toBeInTheDocument()
  expect(within(panel).getByText('Active clients')).toBeInTheDocument()
})

test('a card under Needs attention opens the drawer', async () => {
  const user = userEvent.setup()
  stubFetch({
    'GET /api/orgs': () => [org()],
    'GET /api/attention': () => [{ org: org({ next_step: 'Send the deck', next_step_due: '2000-01-01' }), reasons: ['overdue'] }],
    'GET /api/activity?limit=30': () => [],
    'GET /api/orgs/by-slug/acme': () => org(),
    'GET /api/orgs/1/contacts': () => [],
    'GET /api/orgs/1/timeline': () => [],
    'GET /api/orgs/1/research': () => [],
    'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: '2026-01-01T00:00:00Z', error: null, refreshing: false }),
  })
  renderApp(<HomePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})
