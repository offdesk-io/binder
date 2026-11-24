import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { OrgForm, orgBody, orgForm } from './OrgForm'

const partner = org({ id: 8, name: 'Pixel Partners', slug: 'pixel', kind: 'partner', status: 'identified' })
const referrer = org({ id: 9, name: 'Rui', slug: 'rui', kind: 'referrer', status: 'identified' })
/** What the form asks for on opening, to fill the Introduced by picker. */
const introducers = {
  'GET /api/orgs?kind=partner&sort=name': () => [partner],
  'GET /api/orgs?kind=referrer&sort=name': () => [referrer],
}
const writes = <C extends { key: string }>(calls: C[]) => calls.filter((c) => !c.key.startsWith('GET '))

test('orgBody trims, splits tags and turns empty into null', () => {
  const f = { ...orgForm(undefined, SESSION.me, SESSION.meta.owners), name: ' Acme ', tags: 'design, , retail', value: '1200', website: ' ' }
  expect(orgBody(f)).toMatchObject({
    name: 'Acme', tags: ['design', 'retail'], value_estimate: 1200, website: null, owner_email: 'ana@example.com',
  })
  expect(orgBody({ ...f, value: '' }).value_estimate).toBeNull()
})

test('a new organisation is posted as a lead owned by me', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'POST /api/orgs': (b) => org({ name: (b as { name: string }).name }) })
  const onSaved = vi.fn()
  renderApp(<OrgForm open onClose={() => {}} onSaved={onSaved} />)
  await user.type(screen.getByLabelText(/^Name/), 'Acme')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(writes(calls)[0].body).toMatchObject({ name: 'Acme', kind: 'lead', owner_email: 'ana@example.com', tags: [] })
  expect(writes(calls)[0].body).not.toHaveProperty('introduced_by_id')
})

test('an edit sends only what changed, and a 409 loads their version', async () => {
  const user = userEvent.setup()
  const mine = org({ size: 'Small' })
  const theirs = org({ size: 'Large', updated_at: '2026-11-11T09:00:00.000000+00:00' })
  const calls = stubFetch({
    ...introducers,
    'PATCH /api/orgs/1': () =>
      new Response(JSON.stringify({ detail: 'Changed since you loaded it', current: theirs }), { status: 409 }),
  })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('Location'), 'Leeds')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText(/Someone changed this/)).toBeInTheDocument()
  expect(writes(calls)[0].body).toEqual({ location: 'Leeds', updated_at: mine.updated_at })
  expect(screen.getByLabelText('Size')).toHaveValue('Large')
})

test('delete takes two clicks', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'DELETE /api/orgs/1': () => undefined })
  const onDeleted = vi.fn()
  renderApp(<OrgForm open org={org()} onClose={() => {}} onSaved={() => {}} onDeleted={onDeleted} />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(writes(calls)).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Delete this organisation' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalled())
})

test('saving an edit with nothing changed sends no request', async () => {
  const user = userEvent.setup()
  const calls = stubFetch(introducers)
  const mine = org()
  const onSaved = vi.fn()
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={onSaved} />)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(mine))
  expect(writes(calls)).toHaveLength(0)
})

test('an empty name is refused with a message, even by Cmd+Enter', async () => {
  const user = userEvent.setup()
  const calls = stubFetch(introducers)
  const onSaved = vi.fn()
  renderApp(<OrgForm open onClose={() => {}} onSaved={onSaved} />)
  await user.type(screen.getByLabelText(/^Name/), '   {Meta>}{Enter}{/Meta}')
  expect(await screen.findByText('Name is required')).toBeInTheDocument()
  expect(writes(calls)).toHaveLength(0)
  expect(onSaved).not.toHaveBeenCalled()
})

test('a new record can be any of the four kinds, and a lead or client can be introduced by a partner or referrer', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'POST /api/orgs': () => org() })
  renderApp(<OrgForm open onClose={() => {}} onSaved={() => {}} />)
  const kind = within(screen.getByRole('radiogroup', { name: 'Kind' }))
  expect(kind.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Lead', 'Client', 'Partner', 'Referrer'])
  await user.type(screen.getByLabelText(/^Name/), 'Acme')
  await user.click(await screen.findByRole('button', { name: 'Introduced by' }))
  expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual(['None', 'Pixel Partners (partner)', 'Rui (referrer)'])
  await user.click(screen.getByRole('menuitemradio', { name: 'Rui (referrer)' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toMatchObject({ kind: 'lead', introduced_by_id: 9 })
})

test('a partner or referrer has no Introduced by picker, and no introducer is sent', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'POST /api/orgs': () => org() })
  renderApp(<OrgForm open onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText(/^Name/), 'Pixel')
  await user.click(screen.getByRole('radio', { name: 'Partner' }))
  expect(screen.queryByRole('button', { name: 'Introduced by' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toMatchObject({ kind: 'partner' })
  expect(writes(calls)[0].body).not.toHaveProperty('introduced_by_id')
})

test('editing can change the kind, and sends the kind with only what else changed', async () => {
  const user = userEvent.setup()
  const mine = org({ id: 1, kind: 'lead' })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org({ kind: 'partner' }) })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('radio', { name: 'Partner' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ kind: 'partner', updated_at: mine.updated_at })
})

test('editing an introducer sends introduced_by_id, and None sends null', async () => {
  const user = userEvent.setup()
  const mine = org({ id: 1, kind: 'client', status: 'active', introduced_by_id: 8, introduced_by: { id: 8, slug: 'pixel', name: 'Pixel Partners', kind: 'partner' } })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Introduced by' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'None' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ introduced_by_id: null, updated_at: mine.updated_at })
})

test('Handled by lists the team by name with Nobody, defaults to me on a new record, and saves the email', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'POST /api/orgs': () => org() })
  renderApp(<OrgForm open onClose={() => {}} onSaved={() => {}} />)
  const handled = screen.getByRole('button', { name: 'Handled by' })
  expect(handled).toHaveTextContent('Ana')
  expect(screen.queryByLabelText('Owner email')).toBeNull()
  await user.click(handled)
  expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual(['Nobody', 'Ana', 'Rui'])
  await user.click(screen.getByRole('menuitemradio', { name: 'Rui' }))
  await user.type(screen.getByLabelText(/^Name/), 'Acme')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toMatchObject({ owner_email: 'rui@example.com' })
})

test('Nobody saves null, and someone off the team list stays listed on a record they handle', async () => {
  const user = userEvent.setup()
  const mine = org({ owner_email: 'gone@example.com' })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Handled by' }))
  expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual(['Nobody', 'Ana', 'Rui', 'gone'])
  await user.click(screen.getByRole('menuitemradio', { name: 'Nobody' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ owner_email: null, updated_at: mine.updated_at })
})

test('a new record is handled by nobody when I am not on the team list', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'POST /api/orgs': () => org() })
  const session = { ...SESSION, meta: { ...SESSION.meta, owners: [] } }
  renderApp(<OrgForm open onClose={() => {}} onSaved={() => {}} />, '/', session)
  expect(screen.getByRole('button', { name: 'Handled by' })).toHaveTextContent('Nobody')
  await user.type(screen.getByLabelText(/^Name/), 'Acme')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toMatchObject({ owner_email: null })
})

test('Sector is a picker of the six sectors by name, plus None, and saves the key', async () => {
  const user = userEvent.setup()
  const mine = org({ sector: null })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.queryByRole('textbox', { name: 'Sector' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Sector' }))
  expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual([
    'None', 'Manufacturing', 'Consulting', 'Technology', 'Retail and e-commerce', 'Healthcare', 'Construction and installations',
  ])
  await user.click(screen.getByRole('menuitemradio', { name: 'Retail and e-commerce' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ sector: 'retail_ecommerce', updated_at: mine.updated_at })
})

test('None clears the sector', async () => {
  const user = userEvent.setup()
  const mine = org({ sector: 'healthcare' })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.getByRole('button', { name: 'Sector' })).toHaveTextContent('Healthcare')
  await user.click(screen.getByRole('button', { name: 'Sector' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'None' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ sector: null, updated_at: mine.updated_at })
})

test('What they do saves as description', async () => {
  const user = userEvent.setup()
  const mine = org()
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.type(screen.getByLabelText('What they do'), 'Makes kilns')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ description: 'Makes kilns', updated_at: mine.updated_at })
})

test('a referrer is a person: its form has email, phone, LinkedIn and Works at, and no website, size or sector', async () => {
  const user = userEvent.setup()
  stubFetch(introducers)
  renderApp(<OrgForm open onClose={() => {}} onSaved={() => {}} />)
  expect(screen.getByLabelText('Website')).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Referrer' }))
  for (const l of ['Email', 'Phone', 'LinkedIn', 'Works at']) expect(screen.getByLabelText(l)).toBeInTheDocument()
  for (const l of ['Website', 'Size', 'What they do']) expect(screen.queryByLabelText(l)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Sector' })).toBeNull()
  await user.click(screen.getByRole('radio', { name: 'Lead' }))
  expect(screen.getByLabelText('Website')).toBeInTheDocument()
  expect(screen.queryByLabelText('Phone')).toBeNull()
})

test('a new referrer posts its person fields and works-at, and no website, size or sector', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({ ...introducers, 'POST /api/orgs': () => org() })
  renderApp(<OrgForm open onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('radio', { name: 'Referrer' }))
  await user.type(screen.getByLabelText(/^Name/), 'Rui Costa')
  await user.type(screen.getByLabelText('Email'), 'rui@example.com')
  await user.type(screen.getByLabelText('LinkedIn'), 'linkedin.com/in/rui')
  await user.type(screen.getByLabelText('Works at'), 'Costa Kilns')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  const body = writes(calls)[0].body as Record<string, unknown>
  expect(body).toMatchObject({
    kind: 'referrer', name: 'Rui Costa', description: 'Costa Kilns',
    person: { email: 'rui@example.com', linkedin_url: 'linkedin.com/in/rui' },
  })
  expect(body.person).not.toHaveProperty('phone')
  for (const k of ['website', 'size', 'sector']) expect(body).not.toHaveProperty(k)
})

test('editing a referrer sends only the person fields that changed', async () => {
  const user = userEvent.setup()
  const mine = org({
    kind: 'referrer', status: 'identified', description: 'Costa Kilns',
    person: { contact_id: 4, email: 'rui@example.com', phone: null, linkedin_url: null },
  })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  expect(screen.getByLabelText('Email')).toHaveValue('rui@example.com')
  await user.type(screen.getByLabelText('Phone'), '+351 900 000 000')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ person: { phone: '+351 900 000 000' }, updated_at: mine.updated_at })
})

test('clearing a person field sends null for it', async () => {
  const user = userEvent.setup()
  const mine = org({
    kind: 'referrer', status: 'identified',
    person: { contact_id: 4, email: 'rui@example.com', phone: '1', linkedin_url: null },
  })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.clear(screen.getByLabelText('Phone'))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ person: { phone: null }, updated_at: mine.updated_at })
})

test('refiling a lead that has a website as a referrer sends the kind and leaves the company fields out', async () => {
  const user = userEvent.setup()
  const mine = org({ website: 'acme.example.com', sector: 'healthcare', size: '10' })
  const calls = stubFetch({ ...introducers, 'PATCH /api/orgs/1': () => org() })
  renderApp(<OrgForm open org={mine} onClose={() => {}} onSaved={() => {}} />)
  await user.click(screen.getByRole('radio', { name: 'Referrer' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(writes(calls)).toHaveLength(1))
  expect(writes(calls)[0].body).toEqual({ kind: 'referrer', updated_at: mine.updated_at })
})
