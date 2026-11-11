import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { OrgForm, orgBody, orgForm } from './OrgForm'

test('orgBody trims, splits tags and turns empty into null', () => {
  const f = { ...orgForm(undefined, SESSION.me), name: ' Acme ', tags: 'design, , retail', value: '1200', website: ' ' }
  expect(orgBody(f)).toMatchObject({
    name: 'Acme', tags: ['design', 'retail'], value_estimate: 1200, website: null, owner_email: 'ana@example.com',
  })
  expect(orgBody({ ...f, value: '' }).value_estimate).toBeNull()
})

test('a new organisation is posted as a lead owned by me', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'POST /api/orgs': (b) => org({ name: (b as { name: string }).name }) })
  const onSaved = vi.fn()
  renderApp(<OrgForm open onClose={() => {}} onSaved={onSaved} />)
  await user.type(screen.getByLabelText(/^Name/), 'Acme')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls[0].body).toMatchObject({ name: 'Acme', kind: 'lead', owner_email: 'ana@example.com', tags: [] })
})

test('an edit sends only what changed, and a 409 loads their version', async () => {
  const user = userEvent.setup()
  const mine = org({ sector: 'Retail' })
  const theirs = org({ sector: 'Food', updated_at: '2026-11-11T09:00:00.000000+00:00' })
  const calls = stubFetch({
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Changed since you loaded it', current: theirs }), { status: 409 }),
  })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Location'), 'Leeds')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(calls[0].body).toEqual({ location: 'Leeds', updated_at: mine.updated_at })
  expect(screen.getByLabelText('Sector')).toHaveValue('Food')
})

test('delete takes two clicks', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ 'DELETE /api/orgs/1': () => undefined })
  const onDeleted = vi.fn()
  renderApp(<OrgForm open org={org()} onClose={() => {}} onSaved={() => {}} onDeleted={onDeleted} />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(calls).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Delete this organisation' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalled())
})
