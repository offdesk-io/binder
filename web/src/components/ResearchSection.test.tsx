import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { api } from '../api/endpoints'
import type { Contact, Research } from '../api/types'
import { useApi } from '../lib/useApi'
import { brief, contact, research } from '../test/fixtures'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { ResearchSection } from './ResearchSection'

function Section({ pollMs }: { pollMs?: number }) {
  const people = useApi(() => api.contacts(1), [])
  return <ResearchSection subject={{ kind: 'org', id: 1 }} people={people} pollMs={pollMs} />
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

test('the #research hash scrolls once, not on every poll', async () => {
  const scroll = vi.fn()
  const proto = Element.prototype as { scrollIntoView?: unknown }
  const before = proto.scrollIntoView
  proto.scrollIntoView = scroll
  let gets = 0
  stubFetch({
    'GET /api/orgs/1/research': () => {
      gets++
      return gets < 4 ? [research({ id: 9, status: 'running', brief: null, finished_at: null, cost_usd: null })] : [research({ id: 9 })]
    },
    'GET /api/orgs/1/contacts': () => [],
  })
  try {
    renderApp(<Section pollMs={20} />, '/#research')
    expect(await screen.findByText('A made-up pottery.')).toBeInTheDocument()
    expect(gets).toBeGreaterThanOrEqual(4)
    expect(scroll).toHaveBeenCalledTimes(1)
  } finally {
    proto.scrollIntoView = before
  }
})

test('a newer run that finishes replaces the older run that was picked', async () => {
  const user = userEvent.setup()
  let finished = false
  let runs: Research[] = [
    research({ id: 9, status: 'running', brief: null, finished_at: null, cost_usd: null }),
    research({ id: 4, run_at: '2026-10-01T09:00:00.000000+00:00', brief: brief({ overview: 'The October brief.' }) }),
  ]
  stubFetch({
    'GET /api/orgs/1/research': () => {
      if (finished) runs = [research({ id: 9, brief: brief({ overview: 'The new brief.' }) }), runs[1]]
      return runs
    },
    'GET /api/orgs/1/contacts': () => [],
  })
  renderApp(<Section pollMs={20} />)
  await user.click(await screen.findByRole('button', { name: /1 Oct 2026/ }))
  expect(screen.getByText('The October brief.')).toBeInTheDocument()
  finished = true
  expect(await screen.findByText('The new brief.')).toBeInTheDocument()
  expect(screen.queryByText('The October brief.')).not.toBeInTheDocument()
})

test('a javascript: link in the news is text, and a source with no title shows its URL', async () => {
  stubFetch({
    'GET /api/orgs/1/research': () => [
      research({
        brief: brief({ recent_news: [{ headline: 'Bad link', date: '2026-10-01', url: 'javascript:alert(1)' }] }),
        sources: [{ url: 'https://example.com/untitled', title: '' }],
      }),
    ],
    'GET /api/orgs/1/contacts': () => [],
  })
  renderApp(<Section />)
  const item = await screen.findByText(/Bad link/)
  expect(item.closest('a')).toBeNull()
  expect(screen.getByRole('link', { name: 'https://example.com/untitled' })).toHaveAttribute('href', 'https://example.com/untitled')
})

test('the Add? button is replaced by the link as soon as the contact is created, not when the list reloads', async () => {
  const user = userEvent.setup()
  let people: Contact[] = [contact()]
  let listed = 0
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  stubFetch({
    'GET /api/orgs/1/research': () => [research({ brief: withPeople })],
    'GET /api/orgs/1/contacts': async () => {
      if (++listed > 1) await held
      return people
    },
    'POST /api/orgs/1/contacts': () => {
      const sam = contact({ id: 6, name: 'Sam Example', role: 'Head of Product' })
      people = [...people, sam]
      return sam
    },
  })
  renderApp(<Section />)
  await user.click(await screen.findByRole('button', { name: 'Add Sam Example' }))
  expect(await screen.findByRole('link', { name: 'Sam Example' })).toHaveAttribute('href', '/c/6')
  expect(screen.queryByRole('button', { name: 'Add Sam Example' })).not.toBeInTheDocument()
  release()
})

test('Add files a suggested person at the organisation the run was for, not the one the page is at now', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/contacts/5/research': () => [research({ org_id: 1, contact_id: 5, brief: withPeople })],
    'GET /api/orgs/2/contacts': () => [],
    'POST /api/orgs/1/contacts': () => contact({ id: 6, name: 'Sam Example' }),
  })
  function Moved() {
    const people = useApi(() => api.contacts(2), [])
    return <ResearchSection subject={{ kind: 'contact', id: 5 }} people={people} />
  }
  renderApp(<Moved />)
  await user.click(await screen.findByRole('button', { name: 'Add Sam Example' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/orgs/1/contacts')).toBe(true))
})
