import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { ThanksPut } from '../../api/types'
import { todayIso } from '../../lib/format'
import { keyPerson, thanks } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { ThanksView, years } from './ThanksView'

const Y = new Date().getFullYear()
const bea = keyPerson({ id: 9, name: 'Bea' })
const marta = keyPerson({ id: 8, name: 'Marta', connector: false, org_name: 'Marta', org_slug: 'marta',
  referrer: { id: 3, slug: 'marta', name: 'Marta', status: 'active' }, postal_address: '1 Example Street\nPorto' })
const beaSent = thanks({ id: 1, contact_id: 9, year: Y, what: 'Port wine', sent_on: `${Y}-12-10` })
const list = () => [{ person: bea, thanks: beaSent }, { person: marta, thanks: null }]

test('years offers this one and the two before', () => {
  expect(years(new Date(2026, 5, 1))).toEqual([2026, 2025, 2024])
})

test('each key person with their address, and how many are done', async () => {
  stubFetch({ [`GET /api/thanks?year=${Y}`]: list })
  renderApp(<ThanksView year={Y} />)
  expect(await screen.findByText('1 of 2 sent')).toBeInTheDocument()
  expect(screen.getByLabelText('Sent to Bea')).toBeChecked()
  expect(screen.getByLabelText('Sent to Marta')).not.toBeChecked()
  expect(screen.getByLabelText('What for Bea')).toHaveValue('Port wine')
  expect(screen.getByText(/1 Example Street/)).toBeInTheDocument()
  expect(screen.getByText('No postal address yet')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
})

test('ticking Sent creates the row with today, and the count follows', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/8/${Y}`]: (b) => thanks({ id: 2, contact_id: 8, year: Y, sent_on: (b as ThanksPut).sent_on ?? null }),
  })
  renderApp(<ThanksView year={Y} />)
  await user.click(await screen.findByLabelText('Sent to Marta'))
  expect(await screen.findByText('2 of 2 sent')).toBeInTheDocument()
  expect(calls.find((c) => c.key.startsWith('PUT'))!.body).toEqual({ sent_on: todayIso(), updated_at: null })
})

test('what is saved on leaving the field, only when it changed, with the row’s updated_at', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/9/${Y}`]: () => ({ ...beaSent, what: 'Port wine and cheese', updated_at: '2026-12-11T00:00:00.000000+00:00' }),
  })
  renderApp(<ThanksView year={Y} />)
  await user.type(await screen.findByLabelText('What for Bea'), ' and cheese')
  await user.tab()
  await waitFor(() => expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(1))
  expect(calls.find((c) => c.key.startsWith('PUT'))!.body).toEqual({ what: 'Port wine and cheese', updated_at: beaSent.updated_at })
  await user.click(screen.getByLabelText('Note for Bea'))
  await user.tab()
  expect(calls.filter((c) => c.key.startsWith('PUT'))).toHaveLength(1)
})

test('a stale save shows their version', async () => {
  const user = userEvent.setup()
  const theirs = { ...beaSent, what: 'Cheese', updated_at: '2026-12-11T00:00:00.000000+00:00' }
  stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/9/${Y}`]: () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  renderApp(<ThanksView year={Y} />)
  await user.type(await screen.findByLabelText('What for Bea'), '!')
  await user.tab()
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByLabelText('What for Bea')).toHaveValue('Cheese')
})

test('a change made while a save is in flight is sent after it, with the new updated_at', async () => {
  const user = userEvent.setup()
  let release!: (t: unknown) => void
  let n = 0
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/9/${Y}`]: () =>
      ++n === 1
        ? new Promise((r) => { release = r })
        : { ...beaSent, what: 'Port wine!', sent_on: null, updated_at: '2026-12-12T00:00:00.000000+00:00' },
  })
  renderApp(<ThanksView year={Y} />)
  await user.type(await screen.findByLabelText('What for Bea'), '!')
  await user.tab()
  await waitFor(() => expect(n).toBe(1))
  await user.click(screen.getByLabelText('Sent to Bea'))
  expect(n).toBe(1)
  release({ ...beaSent, what: 'Port wine!', updated_at: '2026-12-11T00:00:00.000000+00:00' })
  await waitFor(() => expect(n).toBe(2))
  const puts = calls.filter((c) => c.key.startsWith('PUT'))
  expect(puts[0].body).toEqual({ what: 'Port wine!', updated_at: beaSent.updated_at })
  expect(puts[1].body).toEqual({ sent_on: null, updated_at: '2026-12-11T00:00:00.000000+00:00' })
})

test('unticking Sent sends sent_on null with the row’s updated_at', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/9/${Y}`]: () => ({ ...beaSent, sent_on: null }),
  })
  renderApp(<ThanksView year={Y} />)
  await user.click(await screen.findByLabelText('Sent to Bea'))
  await waitFor(() => expect(screen.getByText('0 of 2 sent')).toBeInTheDocument())
  expect(calls.find((c) => c.key.startsWith('PUT'))!.body).toEqual({ sent_on: null, updated_at: beaSent.updated_at })
})

test('a stale save where the row is gone leaves the line empty', async () => {
  const user = userEvent.setup()
  stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/8/${Y}`]: () =>
      new Response(JSON.stringify({ detail: 'Changed', current: null }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  renderApp(<ThanksView year={Y} />)
  await user.type(await screen.findByLabelText('What for Marta'), 'Wine')
  await user.tab()
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByLabelText('What for Marta')).toHaveValue('')
  expect(screen.getByLabelText('Sent to Marta')).not.toBeChecked()
})

test('with nobody yet it says how to add someone', async () => {
  stubFetch({ [`GET /api/thanks?year=${Y}`]: () => [] })
  renderApp(<ThanksView year={Y} />)
  expect(await screen.findByText(/No key people yet/)).toBeInTheDocument()
})
