import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import { contact, interaction } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { ContactPage } from './ContactPage'

const bo = contact({ role: 'CEO', email: 'bo@example.com', notes: 'Prefers mornings', relationship: 'warm' })

function page() {
  stubFetch({
    'GET /api/contacts/5': () => bo,
    'GET /api/contacts/5/interactions': () => [interaction({ contact_ids: [5] })],
    'GET /api/orgs/1/contacts': () => [bo],
  })
  return renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/5')
}

test('shows the person, their organisation and what was logged with them', async () => {
  page()
  expect(await screen.findByRole('heading', { level: 1, name: 'Bo' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Prefers mornings')).toBeInTheDocument()
  expect(screen.getByText('Warm')).toBeInTheDocument()
  expect(await screen.findByText('Talked budgets')).toBeInTheDocument()
})

test('Log opens with this person ticked', async () => {
  const user = userEvent.setup()
  page()
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  expect(await screen.findByRole('button', { name: 'Bo', pressed: true })).toBeInTheDocument()
})

test('a link that is not a number says not found without calling the API', async () => {
  const calls = stubFetch({})
  renderApp(<Routes><Route path="/c/:id" element={<ContactPage />} /></Routes>, '/c/abc')
  expect(await screen.findByText('Person not found')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
})
