import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { api } from '../api/endpoints'
import type { Contact, Research } from '../api/types'
import { useApi } from '../lib/useApi'
import { brief, contact, research } from '../test/fixtures'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { ResearchSection } from './ResearchSection'

function Section({ pollMs }: { pollMs?: number }) {
  const people = useApi(() => api.contacts(1), [])
  return <ResearchSection subject={{ kind: 'org', id: 1 }} orgId={1} people={people} pollMs={pollMs} />
}

const withPeople = brief({
  people: [
    { name: 'Bo', role: 'CEO', contact_id: 5, why: 'Runs it.' },
    { name: 'Sam Example', role: 'Head of Product', contact_id: null, why: 'Runs product.' },
  ],
})

test('shows the latest brief, its sources and its cost', async () => {
  stubFetch({ 'GET /api/orgs/1/research': () => [research()], 'GET /api/orgs/1/contacts': () => [] })
  renderApp(<Section />)
  expect(await screen.findByText('A made-up pottery.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', 'https://example.com/about')
  expect(screen.getByText(/\$0\.03/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Research again' })).toBeEnabled()
})

test('a known person links to them, and a new one can be added', async () => {
  const user = userEvent.setup()
  let people: Contact[] = [contact()]
  const calls = stubFetch({
    'GET /api/orgs/1/research': () => [research({ brief: withPeople })],
    'GET /api/orgs/1/contacts': () => people,
    'POST /api/orgs/1/contacts': () => {
      const sam = contact({ id: 6, name: 'Sam Example', role: 'Head of Product' })
      people = [...people, sam]
      return sam
    },
  })
  renderApp(<Section />)
  expect(await screen.findByRole('link', { name: 'Bo' })).toHaveAttribute('href', '/c/5')
  await user.click(screen.getByRole('button', { name: 'Add Sam Example' }))
  expect(await screen.findByRole('link', { name: 'Sam Example' })).toHaveAttribute('href', '/c/6')
  expect(calls.find((c) => c.key === 'POST /api/orgs/1/contacts')!.body).toEqual({ name: 'Sam Example', role: 'Head of Product' })
})

test('starting a run shows progress and polls until it is done', async () => {
  const user = userEvent.setup()
  let runs: Research[] = []
  let polls = 0
  stubFetch({
    'GET /api/orgs/1/research': () => {
      if (runs[0]?.status === 'running' && ++polls >= 2) runs = [research({ id: 9 })]
      return runs
    },
    'GET /api/orgs/1/contacts': () => [],
    'POST /api/orgs/1/research': () => {
      runs = [research({ id: 9, status: 'running', brief: null, finished_at: null, cost_usd: null })]
      return runs[0]
    },
  })
  renderApp(<Section pollMs={20} />)
  await user.click(await screen.findByRole('button', { name: 'Research' }))
  expect(await screen.findByText(/Researching\./)).toBeInTheDocument()
  expect(await screen.findByText('A made-up pottery.')).toBeInTheDocument()
  expect(screen.queryByText(/Researching\./)).not.toBeInTheDocument()
})

test('a failed run says why and can be retried', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs/1/research': () => [research({ id: 4, status: 'failed', brief: null, error: 'The model declined this request.' })],
    'GET /api/orgs/1/contacts': () => [],
    'POST /api/orgs/1/research': () => research({ id: 9, status: 'running', brief: null }),
  })
  renderApp(<Section />)
  expect(await screen.findByText('The model declined this request.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'POST /api/orgs/1/research')).toHaveLength(1))
})

test('a run already going is reported and the list reloads', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs/1/research': () => [],
    'GET /api/orgs/1/contacts': () => [],
    'POST /api/orgs/1/research': () =>
      new Response(JSON.stringify({ detail: 'Research is already running', current: research({ status: 'running' }) }), { status: 409 }),
  })
  renderApp(<Section />)
  await user.click(await screen.findByRole('button', { name: 'Research' }))
  expect(await screen.findByText('Research is already running')).toBeInTheDocument()
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs/1/research')).toHaveLength(2))
})

test('an older run can be shown', async () => {
  const user = userEvent.setup()
  stubFetch({
    'GET /api/orgs/1/research': () => [
      research({ id: 9 }),
      research({ id: 4, run_at: '2026-10-01T09:00:00.000000+00:00', brief: brief({ overview: 'The October brief.' }) }),
    ],
    'GET /api/orgs/1/contacts': () => [],
  })
  renderApp(<Section />)
  await screen.findByText('A made-up pottery.')
  await user.click(screen.getByRole('button', { name: /1 Oct 2026/ }))
  expect(screen.getByText('The October brief.')).toBeInTheDocument()
})

test('without AI there is no button, and it says why', async () => {
  stubFetch({ 'GET /api/orgs/1/research': () => [], 'GET /api/orgs/1/contacts': () => [] })
  renderApp(<Section />, '/', { ...SESSION, meta: { ...SESSION.meta, ai: false } })
  expect(await screen.findByText(/AI is not set up on this server/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Research' })).not.toBeInTheDocument()
})
