import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AT, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { PipelinePage } from './PipelinePage'

const a = org({ id: 1, name: 'Acme', slug: 'acme', status: 'lead', value_estimate: 12000 })
const b = org({ id: 2, name: 'Bolt', slug: 'bolt', status: 'contacted' })
const z = org({ id: 4, name: 'Zinc', slug: 'zinc', status: 'lead', value_estimate: 500 })
const gone = org({ id: 5, name: 'Gone', slug: 'gone', status: 'lost' })

const routes = {
  'GET /api/orgs?kind=lead': () => [a, b, z, gone],
  'GET /api/orgs/by-slug/acme': () => a,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

afterEach(() => localStorage.clear())

const phone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))

/** A stage's row group, found from its heading's fold button. */
function stage(name: RegExp) {
  return screen.getByRole('button', { name, hidden: true }).closest('tbody')!
}

test('stages appear in pipeline order with their count and total, and Won is not one', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  const heads = screen.getAllByRole('rowheader').map((h) => h.textContent ?? '')
  expect(heads.map((t) => t.split(/[,\d]/)[0])).toEqual(['Lead', 'Contacted', 'In conversation', 'Proposal sent', 'Lost', 'Parked'])
  const lead = screen.getByRole('button', { name: /^Lead/ })
  expect(lead).toHaveAccessibleName(expect.stringContaining('2 organisations, €12.5k'))
  expect(lead).toHaveTextContent('2 · €12.5k')
  expect(screen.queryByRole('button', { name: /^Won/ })).toBeNull()
  expect(within(stage(/^Contacted/)).getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
})

test('the heading names the rows it folds', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  const lead = screen.getByRole('button', { name: /^Lead/ })
  expect(lead).toHaveAttribute('aria-controls', lead.closest('tbody')!.id)
})

test('Lost and Parked start folded', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('button', { name: /^Lost/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: /^Parked/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: /^Lead/ })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.queryByRole('link', { name: 'Gone' })).toBeNull()
})

test('a heading folds and unfolds its stage, and the choice is remembered', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  const first = renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: /^Lead/ }))
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(localStorage.getItem('binder.pipeline.lead')).toBe('closed')
  await user.click(screen.getByRole('button', { name: /^Lost/ }))
  expect(screen.getByRole('link', { name: 'Gone' })).toBeInTheDocument()
  first.unmount()

  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Gone' })
  expect(screen.getByRole('button', { name: /^Lead/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('a remembered open overrides a stage that starts folded', async () => {
  localStorage.setItem('binder.pipeline.parked', 'open')
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [org({ id: 6, name: 'Paused Co', slug: 'paused', status: 'parked' })] })
  renderApp(<PipelinePage />)
  expect(await screen.findByRole('link', { name: 'Paused Co' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Parked/ })).toHaveAttribute('aria-expanded', 'true')
})

test('rows within a stage run by due date, overdue first, then undated by name', async () => {
  const rows = [
    org({ id: 11, name: 'Later', slug: 'later', next_step_due: '2099-01-01' }),
    org({ id: 12, name: 'beta', slug: 'beta' }),
    org({ id: 13, name: 'Overdue', slug: 'overdue', next_step_due: '2020-01-01' }),
    org({ id: 14, name: 'Alpha', slug: 'alpha' }),
  ]
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => rows })
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Alpha' })
  const names = within(stage(/^Lead/)).getAllByRole('link').map((l) => l.textContent)
  expect(names).toEqual(['Overdue', 'Later', 'Alpha', 'beta'])
})

test('a row shows sector, next step with its due date, value, owner and last contact', async () => {
  const full = org({
    id: 1, name: 'Acme', slug: 'acme', sector: 'Retail', next_step: 'Send the proposal', next_step_due: '2099-01-01',
    value_estimate: 12000, owner_email: 'rui@example.com', last_contact: null,
  })
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [full] })
  renderApp(<PipelinePage />)
  const row = (await screen.findByRole('link', { name: 'Acme' })).closest('tr')!
  const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
  expect(cells[1]).toBe('Retail')
  expect(cells[2]).toContain('Send the proposal')
  expect(cells[3]).toBe('€12,000')
  expect(cells[4]).toBe('rui')
  expect(cells[5]).toBe('never')
  expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Sector', 'Next step', 'Value', 'Owner', 'Last contact'])
})

test('the pipeline has a visually hidden title', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
})

test('the phone pipeline has a visually hidden title too', async () => {
  phone()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('tn-custom-sr-only')
})

test('rows carry no status picker', async () => {
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.queryByRole('button', { name: /Status/ })).toBeNull()
})

test('clicking a name opens it in the drawer, and a move there takes the row to its new stage', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, status: 'contacted' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await waitFor(() =>
    expect(within(stage(/^Contacted/)).getByRole('link', { name: 'Acme', hidden: true })).toBeInTheDocument(),
  )
  expect(within(stage(/^Lead/)).queryByRole('link', { name: 'Acme', hidden: true })).toBeNull()
})

test('Won from the drawer says it became a client and takes it off the Pipeline', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, kind: 'client', status: 'active' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  await waitFor(() => expect(within(stage(/^Lead/)).queryByRole('link', { name: 'Acme', hidden: true })).toBeNull())
})

test('after Won, a later save of the same client does not announce it again', async () => {
  const user = userEvent.setup()
  const won = org({ ...a, kind: 'client', status: 'active' })
  stubFetch({
    ...routes,
    'PATCH /api/orgs/1': (body) => ((body as { status?: string }).status ? won : org({ ...won, sector: 'Retail', updated_at: '2026-11-11T12:00:00.000000+00:00' })),
  })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Won' }))
  expect(await screen.findByText('Acme is now a client.')).toBeInTheDocument()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByLabelText('Sector'), 'Retail')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByText('Acme is now a client.')).toBeNull())
})

test('a client opened by its link and edited in the drawer shows no notice', async () => {
  const user = userEvent.setup()
  const client = org({ id: 1, slug: 'acme', name: 'Acme', kind: 'client', status: 'active' })
  const calls = stubFetch({
    ...routes,
    // A client is not on the Pipeline.
    'GET /api/orgs?kind=lead': () => [b],
    'GET /api/orgs/by-slug/acme': () => client,
    'PATCH /api/orgs/1': () => org({ ...client, sector: 'Retail', updated_at: '2026-11-11T12:00:00.000000+00:00' }),
  })
  renderApp(<PipelinePage />, '/pipeline?org=acme')
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: 'Edit' }))
  await user.type(screen.getByLabelText('Sector'), 'Retail')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.key === 'PATCH /api/orgs/1')).toBe(true))
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Acme' })).toBeInTheDocument())
  expect(screen.queryByText(/is now a client/)).toBeNull()
})

test('on a phone, rows are two-line items under the same stages, with no stage switcher', async () => {
  phone()
  const full = org({ ...a, sector: 'Retail', next_step: 'Send the proposal', owner_email: 'rui@example.com' })
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [full, b] })
  renderApp(<PipelinePage />)
  const row = (await screen.findByRole('link', { name: 'Acme' })).closest('tr')!
  const cells = within(row).getAllByRole('cell')
  expect(cells).toHaveLength(1)
  expect(cells[0].children).toHaveLength(2)
  expect(cells[0].children[0]).toHaveTextContent('Acme Retail')
  expect(cells[0].children[1]).toHaveTextContent(/^Send the proposal\s*·\s*€12,000\s*·\s*rui$/)
  expect(screen.queryAllByRole('columnheader')).toHaveLength(0)
  expect(screen.getByRole('button', { name: /^Lead/ })).toBeInTheDocument()
  expect(screen.queryByRole('radiogroup')).toBeNull()
})

test('on a phone, a row also opens in the drawer', async () => {
  phone()
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})

test('the owner dropdown narrows the rows', async () => {
  const user = userEvent.setup()
  const c = org({ id: 3, name: 'Cobalt', slug: 'cobalt', status: 'lead', owner_email: 'rui@example.com' })
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [a, b, c] })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('button', { name: 'Owner' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Me' }))
  expect(screen.queryByRole('link', { name: 'Cobalt' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Acme' })).toBeInTheDocument()
})

test('the filter box narrows the rows, and says so when nothing is left', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  const box = await screen.findByRole('searchbox', { name: 'Filter organisations' })
  await user.type(box, 'bol')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  await user.type(box, 'zzz')
  expect(screen.getByText('Nothing matches these filters.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).toBeNull()
})

test('+ Add organisation saves a lead, opens it in the drawer and shows its row under Lead', async () => {
  const user = userEvent.setup()
  const cobalt = org({ id: 3, name: 'Cobalt', slug: 'cobalt', status: 'lead', owner_email: 'rui@example.com' })
  stubFetch({
    ...routes,
    'POST /api/orgs': () => cobalt,
    'GET /api/orgs/by-slug/cobalt': () => cobalt,
    'GET /api/orgs/3/contacts': () => [],
    'GET /api/orgs/3/timeline': () => [],
    'GET /api/orgs/3/research': () => [],
    'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  renderApp(<PipelinePage />, '/pipeline?owner=ana%40example.com')
  await user.type(await screen.findByRole('searchbox', { name: 'Filter organisations' }), 'zzz')
  await user.click(screen.getByRole('button', { name: '+ Add organisation' }))
  await user.type(screen.getByLabelText(/^Name/), 'Cobalt')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('dialog', { name: 'Cobalt' })).toBeInTheDocument()
  // The filters that would hide it are cleared, so its row is in the list behind the drawer.
  expect(screen.getByRole('searchbox', { name: 'Filter organisations', hidden: true })).toHaveValue('')
  expect(within(stage(/^Lead/)).getByRole('link', { name: 'Cobalt', hidden: true })).toBeInTheDocument()
})
