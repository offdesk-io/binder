import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { toLocalInput } from '../lib/format'
import { contact, interaction } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { logBody, logForm, QuickLog } from './QuickLog'

test('a new log defaults to now and to the preselected people', () => {
  const now = new Date(2026, 10, 12, 9, 30)
  const f = logForm(undefined, [5], now, 'call')
  expect(f).toMatchObject({ type: 'call', when: '2026-11-12T09:30', contact_ids: [5], summary: '' })
})

test('logBody keeps the stored time when the time was not touched', () => {
  const i = interaction({ happened_at: '2026-11-10T09:30:12.345678+00:00' })
  const f = logForm(i)
  expect(logBody(f, i).happened_at).toBe(i.happened_at)
  const moved = { ...f, when: '2026-11-10T08:00' }
  expect(logBody(moved, i).happened_at).toBe(new Date('2026-11-10T08:00').toISOString())
  expect(toLocalInput(i.happened_at)).toBe(f.when)
})

test('logs an interaction with the chosen people', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs/1/interactions': () => interaction() })
  const onSaved = vi.fn()
  renderApp(<QuickLog open orgId={1} contacts={[contact()]} onClose={() => {}} onSaved={onSaved} />)
  await user.click(screen.getByRole('radio', { name: 'Meeting' }))
  await user.click(screen.getByRole('button', { name: 'Bo' }))
  await user.type(screen.getByLabelText(/What happened/), 'Kick-off')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ type: 'meeting', summary: 'Kick-off', contact_ids: [5], next_step: null, next_step_due: null })
})

test('will not save without saying what happened', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({})
  renderApp(<QuickLog open orgId={1} contacts={[]} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Say what happened.')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
})

test('editing sends only what changed', async () => {
  const user = userEvent.setup()
  const i = interaction()
  const calls = stubFetch({ 'PATCH /api/interactions/7': () => i })
  renderApp(<QuickLog open orgId={1} contacts={[]} initial={i} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Next step'), 'Send rates')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0].body).toEqual({ next_step: 'Send rates', updated_at: i.updated_at })
})

test('saving an edit with nothing changed sends nothing', async () => {
  const user = userEvent.setup()
  const i = interaction()
  const calls = stubFetch({})
  const onSaved = vi.fn()
  renderApp(<QuickLog open orgId={1} contacts={[]} initial={i} onClose={() => {}} onSaved={onSaved} />)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls).toHaveLength(0)
})
