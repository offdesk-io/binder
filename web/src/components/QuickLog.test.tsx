import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { toLocalInput } from '../lib/format'
import { contact, interaction } from '../test/fixtures'
import { appTree, renderApp, SESSION, stubFetch } from '../test/render'
import { fromSummary, logBody, logForm, QuickLog } from './QuickLog'

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

test('a conflict loads their version into the form and says so', async () => {
  const user = userEvent.setup()
  const i = interaction()
  const theirs = interaction({ summary: 'Their version', updated_at: '2026-11-11T08:00:00.000000+00:00' })
  stubFetch({
    'PATCH /api/interactions/7': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  renderApp(<QuickLog open orgId={1} contacts={[]} initial={i} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Next step'), 'Mine')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByLabelText(/What happened/)).toHaveValue('Their version')
  expect(screen.getByLabelText('Next step')).toHaveValue('')
})

test('opening a log drops people who no longer exist', async () => {
  const user = userEvent.setup()
  const i = interaction({ contact_ids: [5, 99] })
  const calls = stubFetch({ 'PATCH /api/interactions/7': () => i })
  renderApp(<QuickLog open orgId={1} contacts={[contact()]} initial={i} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.getByRole('button', { name: 'Bo' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0].body).toEqual({ contact_ids: [5], updated_at: i.updated_at })
})

test('people are sent in id order', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs/1/interactions': () => interaction() })
  renderApp(<QuickLog open orgId={1} contacts={[contact({ id: 9, name: 'Cy' }), contact()]} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Cy' }))
  await user.click(screen.getByRole('button', { name: 'Bo' }))
  await user.type(screen.getByLabelText(/What happened/), 'x')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect((calls[0].body as { contact_ids: number[] }).contact_ids).toEqual([5, 9])
})

test('a log opened before the people have loaded keeps its people', async () => {
  const user = userEvent.setup()
  const i = interaction({ contact_ids: [1] })
  const calls = stubFetch({ 'PATCH /api/interactions/7': () => i })
  renderApp(<QuickLog open orgId={1} contacts={undefined} initial={i} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Next step'), 'Send rates')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0].body).toEqual({ next_step: 'Send rates', updated_at: i.updated_at })
})

const summary = { summary: 'Agreed a pilot', type: 'meeting', happened_at: '2026-11-10T09:30:00.000000+00:00',
  next_step: 'Send the plan', next_step_due: '2026-11-20', contact_ids: [5, 99] }

test('fromSummary fills the form, keeping only known people and known types', () => {
  const f = logForm(undefined, [], new Date(2026, 10, 12, 9, 30), 'call')
  const out = fromSummary(f, summary, ['call', 'email', 'meeting', 'note'], new Set([5]))
  expect(out).toEqual({ type: 'meeting', when: toLocalInput(summary.happened_at), contact_ids: [5],
    summary: 'Agreed a pilot', next_step: 'Send the plan', next_step_due: '2026-11-20' })
  const odd = fromSummary(f, { ...summary, type: 'lunch', happened_at: null, next_step: null, next_step_due: null }, ['call'], undefined)
  expect(odd).toMatchObject({ type: 'call', when: f.when, contact_ids: [5, 99], next_step: '', next_step_due: '' })
})

test('paste and summarise fills the form for checking, then saves as usual', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'POST /api/summarise': () => summary,
    'POST /api/orgs/1/interactions': () => interaction(),
  })
  const onSaved = vi.fn()
  renderApp(<QuickLog open orgId={1} contacts={[contact()]} onClose={() => {}} onSaved={onSaved} />)
  await user.click(screen.getByRole('button', { name: 'Paste and summarise' }))
  await user.type(screen.getByLabelText('Pasted text'), 'Notes from the meeting with Bo')
  await user.click(screen.getByRole('button', { name: 'Summarise' }))
  expect(await screen.findByText(/Filled in from the pasted text/)).toBeInTheDocument()
  expect(calls[0]).toEqual({ key: 'POST /api/summarise', body: { org_id: 1, text: 'Notes from the meeting with Bo' } })
  expect(screen.getByLabelText(/What happened/)).toHaveValue('Agreed a pilot')
  expect(screen.getByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
  expect(screen.queryByLabelText('Pasted text')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  const saved = calls[1].body as { happened_at: string }
  expect(saved).toMatchObject({ type: 'meeting', summary: 'Agreed a pilot', contact_ids: [5],
    next_step: 'Send the plan', next_step_due: '2026-11-20' })
  expect(new Date(saved.happened_at).getTime()).toBe(new Date(summary.happened_at).getTime())
})

test('a failed summarise says why and keeps the pasted text', async () => {
  const user = userEvent.setup()
  stubFetch({ 'POST /api/summarise': () => new Response(JSON.stringify({ detail: 'The AI service is busy. Try again in a minute.' }), { status: 502 }) })
  renderApp(<QuickLog open orgId={1} contacts={[]} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Paste and summarise' }))
  await user.type(screen.getByLabelText('Pasted text'), 'Some notes')
  await user.click(screen.getByRole('button', { name: 'Summarise' }))
  expect(await screen.findByText('The AI service is busy. Try again in a minute.')).toBeInTheDocument()
  expect(screen.getByLabelText('Pasted text')).toHaveValue('Some notes')
})

test('paste and summarise is only for new logs, and only with AI', () => {
  stubFetch({})
  const { unmount } = renderApp(<QuickLog open orgId={1} contacts={[]} initial={interaction()} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Paste and summarise' })).not.toBeInTheDocument()
  unmount()
  renderApp(<QuickLog open orgId={1} contacts={[]} onClose={() => {}} onSaved={() => {}} />, '/', { ...SESSION, meta: { ...SESSION.meta, ai: false } })
  expect(screen.queryByRole('button', { name: 'Paste and summarise' })).not.toBeInTheDocument()
})

test('a summary that arrives after the log was closed and reopened does not fill the new one', async () => {
  const user = userEvent.setup()
  let answer = () => {}
  const held = new Promise<unknown>((resolve) => (answer = () => resolve(summary)))
  const calls = stubFetch({ 'POST /api/summarise': () => held })
  const props = { orgId: 1, contacts: [contact()], onClose: () => {}, onSaved: () => {} }
  const { rerender } = renderApp(<QuickLog open {...props} />)
  await user.click(screen.getByRole('button', { name: 'Paste and summarise' }))
  await user.type(screen.getByLabelText('Pasted text'), 'Notes from the meeting with Bo')
  await user.click(screen.getByRole('button', { name: 'Summarise' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  rerender(appTree(<QuickLog open={false} {...props} />))
  rerender(appTree(<QuickLog open {...props} />))
  await user.click(screen.getByRole('button', { name: 'Paste and summarise' }))
  await user.type(screen.getByLabelText('Pasted text'), 'Other notes')
  expect(screen.getByRole('button', { name: 'Summarise' })).toBeEnabled()
  await act(async () => answer())
  expect(screen.getByLabelText(/What happened/)).toHaveValue('')
  expect(screen.queryByText(/Filled in from the pasted text/)).not.toBeInTheDocument()
})
