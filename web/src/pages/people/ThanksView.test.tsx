import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { ThanksPut } from '../../api/types'
import { todayIso } from '../../lib/format'
import { contact, thanks } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { ThanksView, years } from './ThanksView'

const Y = new Date().getFullYear()
const bea = contact({ id: 9, name: 'Bea', connector: true })
const marta = contact({ id: 8, name: 'Marta', connector: true, org_id: null, org_name: null, org_slug: null,
  postal_address: '1 Example Street\nPorto' })
const beaSent = thanks({ id: 1, contact_id: 9, year: Y, what: 'Port wine', sent_on: `${Y}-12-10` })
const list = () => [{ contact: bea, thanks: beaSent }, { contact: marta, thanks: null }]

test('years offers this one and the two before', () => {
  expect(years(new Date(2026, 5, 1))).toEqual([2026, 2025, 2024])
})

test('each connector with their address, and how many are done', async () => {
  stubFetch({ [`GET /api/thanks?year=${Y}`]: list })
  renderApp(<ThanksView />)
  expect(await screen.findByText('1 of 2 sent')).toBeInTheDocument()
  expect(screen.getByLabelText('Sent to Bea')).toBeChecked()
  expect(screen.getByLabelText('Sent to Marta')).not.toBeChecked()
  expect(screen.getByLabelText('What for Bea')).toHaveValue('Port wine')
  expect(screen.getByText(/1 Example Street/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
})

test('ticking Sent creates the row with today, and the count follows', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    [`GET /api/thanks?year=${Y}`]: list,
    [`PUT /api/thanks/8/${Y}`]: (b) => thanks({ id: 2, contact_id: 8, year: Y, sent_on: (b as ThanksPut).sent_on ?? null }),
  })
  renderApp(<ThanksView />)
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
  renderApp(<ThanksView />)
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
  renderApp(<ThanksView />)
  await user.type(await screen.findByLabelText('What for Bea'), '!')
  await user.tab()
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByLabelText('What for Bea')).toHaveValue('Cheese')
})

test('another year loads that year', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ [`GET /api/thanks?year=${Y}`]: list, [`GET /api/thanks?year=${Y - 1}`]: () => [] })
  renderApp(<ThanksView />)
  await screen.findByText('1 of 2 sent')
  await user.click(screen.getByRole('button', { name: 'Year' }))
  await user.click(screen.getByRole('menuitemradio', { name: String(Y - 1) }))
  expect(await screen.findByText(/No key connectors yet/)).toBeInTheDocument()
  expect(calls.map((c) => c.key)).toContain(`GET /api/thanks?year=${Y - 1}`)
})
