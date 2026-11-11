import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { activity, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { HomePage } from './HomePage'

test('shows what needs attention, with its reasons, and recent activity', async () => {
  stubFetch({
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
  expect(screen.getByText(/Send the deck/)).toHaveClass('lg-overdue')
  expect(await screen.findByText('Moved from Lead to Contacted')).toBeInTheDocument()
  expect(screen.getByText('Call: Rang about rates')).toBeInTheDocument()
})

test('says so when nothing needs attention', async () => {
  stubFetch({ 'GET /api/attention': () => [], 'GET /api/activity?limit=30': () => [] })
  renderApp(<HomePage />)
  expect(await screen.findByText('Nothing needs you today.')).toBeInTheDocument()
  expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument()
})
