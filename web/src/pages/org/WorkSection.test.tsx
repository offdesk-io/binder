import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AT, benchTask } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { WorkSection } from './WorkSection'

const URL_AA = 'https://bench.example.com/#!board=work!task=aa0002'

function section(reloadMs = 10) {
  return renderApp(<WorkSection orgId={1} slug="acme" reloadMs={reloadMs} />)
}

test('open tasks come first, each linked, and done ones sit under Done', async () => {
  stubFetch({
    'GET /api/orgs/1/work': () => ({
      tasks: [
        benchTask({ task_key: 'bb0001', title: 'Kickoff deck', state: 'Done', done: true, done_on: '2026-11-01', url: 'https://bench.example.com/#!board=work!task=bb0001' }),
        benchTask({ title: 'Acme site rebuild', state: 'Doing', due: '2026-11-20', assignee: 'jerome', url: URL_AA }),
      ],
      fetched_at: AT,
      error: null,
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
  stubFetch({ 'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null }) })
  section()
  expect(await screen.findByText(/No Bench tasks are tagged with this organisation yet/)).toBeInTheDocument()
  expect(screen.getByText('[lead:: acme]')).toHaveClass('tenon-code')
})

test('an error shows the cached tasks with the time they were read', async () => {
  stubFetch({
    'GET /api/orgs/1/work': () => ({ tasks: [benchTask({ title: 'Acme site rebuild' })], fetched_at: AT, error: 'Bench answered 401.' }),
  })
  section()
  expect(await screen.findByText(/Bench answered 401\./)).toBeInTheDocument()
  expect(screen.getByText(/Showing what was read at \d{2}:\d{2}/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme site rebuild' })).toBeInTheDocument()
})

test('when the first read has not finished it loads again once', async () => {
  let n = 0
  const calls = stubFetch({
    'GET /api/orgs/1/work': () =>
      ++n === 1
        ? { tasks: [], fetched_at: null, error: null }
        : { tasks: [benchTask({ title: 'Fresh task' })], fetched_at: AT, error: null },
  })
  section()
  expect(await screen.findByRole('link', { name: 'Fresh task' })).toBeInTheDocument()
  expect(calls.filter((c) => c.key === 'GET /api/orgs/1/work')).toHaveLength(2)
})
