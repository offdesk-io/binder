import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { contact, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactForm, contactBody, contactForm } from './ContactForm'

test('contactBody: empty is null, no relationship is null', () => {
  const f = { ...contactForm(), name: ' Bo ', email: '', relationship: '' }
  expect(contactBody(f)).toMatchObject({ name: 'Bo', email: null, relationship: null, is_primary: false })
})

test('adds a person to the organisation', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs/1/contacts': () => contact() })
  const onSaved = vi.fn()
  renderApp(<ContactForm open orgId={1} onClose={() => {}} onSaved={onSaved} />)
  await user.type(screen.getByLabelText(/^Name/), 'Bo')
  await user.click(screen.getByRole('radio', { name: 'Warm' }))
  await user.click(screen.getByLabelText('Who to talk to'))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ name: 'Bo', relationship: 'warm', is_primary: true })
})

test('an edit sends only what changed', async () => {
  const user = userEvent.setup()
  const bo = contact({ role: 'CEO' })
  const calls = stubFetch({ 'PATCH /api/contacts/5': () => bo })
  renderApp(<ContactForm open orgId={1} contact={bo} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Phone'), '0113')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  expect(calls[0].body).toEqual({ phone: '0113', updated_at: bo.updated_at })
})

test('a conflict loads their version into the form and says so', async () => {
  const user = userEvent.setup()
  const bo = contact()
  const theirs = contact({ role: 'CTO', updated_at: '2026-11-11T08:00:00.000000+00:00' })
  stubFetch({
    'PATCH /api/contacts/5': () =>
      new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
  })
  renderApp(<ContactForm open orgId={1} contact={bo} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Phone'), '0113')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(screen.getByLabelText('Role')).toHaveValue('CTO')
  expect(screen.getByLabelText('Phone')).toHaveValue('')
})


test('on its own, a new person goes to /api/contacts with the star on and no organisation', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [],
    'POST /api/contacts': () => contact({ org_id: null, org_name: null, org_slug: null, connector: true }),
  })
  const onSaved = vi.fn()
  renderApp(<ContactForm open orgId={null} chooseOrg connectorDefault onClose={() => {}} onSaved={onSaved} />)
  expect(screen.getByLabelText('Key connector')).toBeChecked()
  expect(screen.queryByLabelText('Who to talk to')).toBeNull()
  await user.type(screen.getByLabelText(/^Name/), 'Marta')
  await user.type(screen.getByLabelText('Postal address'), '1 Example Street')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls.find((c) => c.key === 'POST /api/contacts')!.body).toMatchObject({
    name: 'Marta', connector: true, postal_address: '1 Example Street', org_id: null, is_primary: false,
  })
})

test('taking a person out of their organisation sends only org_id', async () => {
  const user = userEvent.setup()
  const bo = contact()
  const calls = stubFetch({
    'GET /api/orgs?sort=name': () => [org(), org({ id: 2, name: 'Bolt', slug: 'bolt' })],
    'PATCH /api/contacts/5': () => ({ ...bo, org_id: null, org_name: null, org_slug: null }),
  })
  renderApp(<ContactForm open orgId={1} chooseOrg contact={bo} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.getByLabelText('Who to talk to')).toBeInTheDocument()
  // The dropdown waits for the organisations to load.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Organisation' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Organisation' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'No organisation' }))
  expect(screen.queryByLabelText('Who to talk to')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'PATCH /api/contacts/5')).toBe(true))
  expect(calls.find((c) => c.key === 'PATCH /api/contacts/5')!.body).toEqual({ org_id: null, updated_at: bo.updated_at })
})

test('on an organisation, the form does not offer a choice of organisation', () => {
  const calls = stubFetch({})
  renderApp(<ContactForm open orgId={1} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Organisation' })).toBeNull()
  expect(screen.getByLabelText('Key connector')).not.toBeChecked()
  expect(calls).toHaveLength(0)
})
