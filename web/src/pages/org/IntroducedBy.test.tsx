import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org, person } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { IntroducedBy } from './IntroducedBy'

const marta = person({ id: 8, name: 'Marta', org_id: null, org_name: null, org_slug: null })
const zoe = person({ id: 9, name: 'Zoe', org_id: 1, org_name: 'Acme' })
const lists = { 'GET /api/people': () => [marta, zoe], 'GET /api/orgs?kind=partner&sort=name': () => [] }

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Change' }))
  await user.click(await screen.findByRole('button', { name: 'Introduced by' }))
}

test('people at an organisation are listed with it', async () => {
  const user = userEvent.setup()
  stubFetch(lists)
  renderApp(<IntroducedBy org={org()} setOrg={() => {}} onReload={() => {}} />)
  await openPicker(user)
  expect(screen.getByRole('menuitemradio', { name: 'Zoe · Acme' })).toBeInTheDocument()
  expect(screen.getByRole('menuitemradio', { name: 'Marta' })).toBeInTheDocument()
})

test('Cancel closes the picker without saving', async () => {
  const user = userEvent.setup()
  const calls = stubFetch(lists)
  renderApp(<IntroducedBy org={org()} setOrg={() => {}} onReload={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Change' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false)
})

test('a conflict shows their version', async () => {
  const user = userEvent.setup()
  const theirs = org({ introduced_by_contact_id: 9, introduced_by: { type: 'contact', id: 9, name: 'Zoe' }, updated_at: 'later' })
  const setOrg = vi.fn()
  stubFetch({
    ...lists,
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  renderApp(<IntroducedBy org={org()} setOrg={setOrg} onReload={() => {}} />)
  await openPicker(user)
  await user.click(screen.getByRole('menuitemradio', { name: 'Marta' }))
  await waitFor(() => expect(setOrg).toHaveBeenCalledWith(theirs))
})

test('any other failure reloads the organisation', async () => {
  const user = userEvent.setup()
  const onReload = vi.fn()
  stubFetch({ ...lists, 'PATCH /api/orgs/1': () => new Response(JSON.stringify({ detail: 'Boom' }), { status: 500 }) })
  renderApp(<IntroducedBy org={org()} setOrg={() => {}} onReload={onReload} />)
  await openPicker(user)
  await user.click(screen.getByRole('menuitemradio', { name: 'Marta' }))
  await waitFor(() => expect(onReload).toHaveBeenCalled())
})
