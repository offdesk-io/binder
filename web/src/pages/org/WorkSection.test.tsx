import { screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AT, benchTask } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { WorkSection } from './WorkSection'

const URL_AA = 'https://bench.example.com/#!board=work!task=aa0002'

function section(reloadMs = 10, stopMs = 2000) {
  return renderApp(<WorkSection orgId={1} slug="acme" reloadMs={reloadMs} stopMs={stopMs} />)
}

const idle = { refreshing: false }

test('open tasks come first, each linked, and done ones sit under Done', async () => {
  stubFetch({
    'GET /api/orgs/1/work': () => ({
      tasks: [
        benchTask({ task_key: 'bb0001', title: 'Kickoff deck', state: 'Done', done: true, done_on: '2026-11-01', url: 'https://bench.example.com/#!board=work!task=bb0001' }),
        benchTask({ title: 'Acme site rebuild', state: 'Doing', due: '2026-11-20', assignee: 'jerome', url: URL_AA }),
      ],
      fetched_at: AT,
      error: null,
      ...idle,
    }),
  })
  section()
  const open = await screen.findByRole('link', { name: 'Acme site rebuild' })
  expect(open).toHaveAttribute('href', URL_AA)
  expect(open).toHaveAttribute('target', '_blank')
  expect(open).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByText('Doing')).toBeInTheDocument()
  expect(screen.getByText('Due 20 Nov 2026 · jerome')).toHaveClass('tenon-caption')

  const done = screen.getByRole('heading', { name: 'Done' })
  const finished = screen.getByRole('link', { name: 'Kickoff deck' })
  expect(open.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(done.compareDocumentPosition(finished) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('Done 1 Nov 2026')).toBeInTheDocument()
})

test('with no tasks it says how to link one', async () => {
  stubFetch({ 'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, ...idle }) })
  section()
  expect(await screen.findByText(/No Bench tasks are tagged with this organisation yet/)).toBeInTheDocument()
  expect(screen.getByText('[lead:: acme]')).toHaveClass('tenon-code')
})

test('an error shows the cached tasks with the time they were read', async () => {
  stubFetch({
    'GET /api/orgs/1/work': () => ({
      tasks: [benchTask({ title: 'Acme site rebuild' })], fetched_at: AT, error: 'Bench answered 401.', ...idle,
    }),
  })
  section()
  expect(await screen.findByText(/Bench answered 401\./)).toBeInTheDocument()
  expect(screen.getByText(/Showing what was read at \d{2}:\d{2}/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme site rebuild' })).toBeInTheDocument()
})

test('while a refresh runs the page asks again, and stops as soon as it is done', async () => {
  let n = 0
  const calls = stubFetch({
    'GET /api/orgs/1/work': () =>
      ++n < 3
        ? { tasks: [], fetched_at: null, error: null, refreshing: true }
        : { tasks: [benchTask({ title: 'Fresh task' })], fetched_at: AT, error: null, ...idle },
  })
  section()
  expect(await screen.findByRole('link', { name: 'Fresh task' })).toBeInTheDocument()
  // Requests sent while an answer was still on its way may land late, so let those settle before counting.
  const asked = () => calls.filter((c) => c.key === 'GET /api/orgs/1/work').length
  await new Promise((r) => setTimeout(r, 100))
  const settled = asked()
  expect(settled).toBeGreaterThanOrEqual(3)
  await new Promise((r) => setTimeout(r, 100))
  expect(asked()).toBe(settled)
})

test('a refresh that never ends stops being asked for after the budget', async () => {
  const calls = stubFetch({
    'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: null, error: null, refreshing: true }),
  })
  section(10, 80)
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/orgs/1/work').length).toBeGreaterThan(2))
  await new Promise((r) => setTimeout(r, 40))
  const stopped = calls.filter((c) => c.key === 'GET /api/orgs/1/work').length
  await new Promise((r) => setTimeout(r, 150))
  expect(calls.filter((c) => c.key === 'GET /api/orgs/1/work')).toHaveLength(stopped)
})

test('with no refresh running the page asks once', async () => {
  const calls = stubFetch({
    'GET /api/orgs/1/work': () => ({ tasks: [benchTask({ title: 'Settled' })], fetched_at: AT, error: null, ...idle }),
  })
  section()
  expect(await screen.findByRole('link', { name: 'Settled' })).toBeInTheDocument()
  await new Promise((r) => setTimeout(r, 40))
  expect(calls.filter((c) => c.key === 'GET /api/orgs/1/work')).toHaveLength(1)
})

test('a cancelled task sits under Done with the day it was cancelled, not as done', async () => {
  stubFetch({
    'GET /api/orgs/1/work': () => ({
      tasks: [
        benchTask({ task_key: 'aa0005', title: 'Birch and Co pitch', state: 'Cancelled', cancelled: true, done_on: '2026-10-25' }),
        benchTask({ title: 'Acme site rebuild' }),
      ],
      fetched_at: AT,
      error: null,
      ...idle,
    }),
  })
  section()
  const cancelled = await screen.findByRole('link', { name: 'Birch and Co pitch' })
  expect(screen.getByText('Cancelled 25 Oct 2026')).toBeInTheDocument()
  expect(screen.queryByText('Done 25 Oct 2026')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Done' }).compareDocumentPosition(cancelled) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Acme site rebuild' })).toBeInTheDocument()
})

test('before Bench has ever been read it says so, not that nothing is tagged', async () => {
  stubFetch({ 'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: null, error: null }) })
  section(60_000)
  expect(await screen.findByText('Reading Bench…')).toBeInTheDocument()
  expect(screen.queryByText(/No Bench tasks are tagged/)).not.toBeInTheDocument()
})
