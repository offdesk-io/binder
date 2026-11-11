import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { contact } from '../test/fixtures'
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
