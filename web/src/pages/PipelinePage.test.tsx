import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { Layout } from '../app/Layout'
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

/** The Pipeline inside the app shell, as the header's New needs. */
function inLayout(path = '/pipeline') {
  return renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/pipeline" element={<PipelinePage />} />
      </Route>
    </Routes>,
    path,
  )
}

const cobalt = org({ id: 3, name: 'Cobalt', slug: 'cobalt', status: 'lead', owner_email: 'rui@example.com' })
const cobaltRoutes = {
  'POST /api/orgs': () => cobalt,
  'GET /api/orgs/by-slug/cobalt': () => cobalt,
  'GET /api/orgs/3/contacts': () => [],
  'GET /api/orgs/3/timeline': () => [],
  'GET /api/orgs/3/research': () => [],
  'GET /api/orgs/3/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

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
  const heads = screen.getAllByRole('rowheader').map((h) => h.querySelector('.tn-custom-stage-name')?.textContent)
  expect(heads).toEqual(['Lead', 'Contacted', 'In conversation', 'Proposal sent', 'Lost', 'Parked'])
  const lead = screen.getByRole('button', { name: /^Lead/ })
  expect(lead).toHaveAccessibleName(expect.stringContaining('2 organisations, €12.5k'))
  expect(lead).toHaveTextContent('2 · €12.5k')
  expect(screen.queryByRole('button', { name: /^Won/ })).toBeNull()
  expect(within(stage(/^Contacted/)).getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
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
  expect(localStorage.getItem('binder.pipeline.fold.lead')).toBe('closed')
  await user.click(screen.getByRole('button', { name: /^Lost/ }))
  expect(screen.getByRole('link', { name: 'Gone' })).toBeInTheDocument()
  first.unmount()

  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Gone' })
  expect(screen.getByRole('button', { name: /^Lead/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('a remembered open overrides a stage that starts folded', async () => {
  localStorage.setItem('binder.pipeline.fold.parked', 'open')
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [org({ id: 6, name: 'Paused Co', slug: 'paused', status: 'parked' })] })
  renderApp(<PipelinePage />)
  expect(await screen.findByRole('link', { name: 'Paused Co' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Parked/ })).toHaveAttribute('aria-expanded', 'true')
})

test('a heading counts only the rows the filters leave', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('button', { name: /^Lead/ })).toHaveAccessibleName(expect.stringContaining('2 organisations'))
  await user.type(screen.getByRole('searchbox', { name: 'Filter organisations' }), 'zin')
  expect(screen.getByRole('button', { name: /^Lead/ })).toHaveAccessibleName(expect.stringContaining('1 organisation, €500'))
})

test('while the filter box has text every stage shows, and the folds are kept for later', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  const box = screen.getByRole('searchbox', { name: 'Filter organisations' })
  await user.type(box, 'gon')
  expect(screen.getByRole('link', { name: 'Gone' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Lost/ })).toHaveAttribute('aria-expanded', 'true')
  expect(localStorage.getItem('binder.pipeline.fold.lost')).toBeNull()
  await user.clear(box)
  expect(screen.queryByRole('link', { name: 'Gone' })).toBeNull()
  expect(screen.getByRole('button', { name: /^Lost/ })).toHaveAttribute('aria-expanded', 'false')
})

test('rows within a stage run by due date, overdue first, then undated by name', async () => {
  const rows = [
    org({ id: 11, name: 'Later', slug: 'later', next_step_due: '2099-01-01' }),
    org({ id: 12, name: 'beta', slug: 'beta' }),
    org({ id: 13, name: 'Overdue', slug: 'overdue', next_step_due: '2020-01-01' }),
    org({ id: 14, name: 'Alpha', slug: 'alpha' }),
    org({ id: 15, name: 'Earlier name', slug: 'earlier-name', next_step_due: '2099-01-01' }),
  ]
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => rows })
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Alpha' })
  const names = within(stage(/^Lead/)).getAllByRole('link').map((l) => l.textContent)
  // Two on the same day go by name.
  expect(names).toEqual(['Overdue', 'Earlier name', 'Later', 'Alpha', 'beta'])
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
  expect(Array.from(cells[0].children[1].children).map((c) => c.textContent)).toEqual(['Send the proposal', '€12,000', 'rui'])
  expect(screen.queryAllByRole('columnheader')).toHaveLength(0)
  expect(screen.getByRole('button', { name: /^Lead/ })).toBeInTheDocument()
  expect(screen.queryByRole('radiogroup', { name: 'Stage' })).toBeNull()
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
  stubFetch({ ...routes, ...cobaltRoutes })
  inLayout('/pipeline?owner=ana%40example.com')
  await user.type(await screen.findByRole('searchbox', { name: 'Filter organisations' }), 'zzz')
  await user.click(screen.getByRole('button', { name: '+ Add organisation' }))
  await user.type(screen.getByLabelText(/^Name/), 'Cobalt')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('dialog', { name: 'Cobalt' })).toBeInTheDocument()
  // The filters that would hide it are cleared, so its row is in the list behind the drawer.
  expect(screen.getByRole('searchbox', { name: 'Filter organisations', hidden: true })).toHaveValue('')
  expect(within(stage(/^Lead/)).getByRole('link', { name: 'Cobalt', hidden: true })).toBeInTheDocument()
})

test('New in the header shows the new lead under Lead, and closing the drawer focuses its row', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, ...cobaltRoutes })
  inLayout()
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Cobalt')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  const drawer = await screen.findByRole('dialog', { name: 'Cobalt' })
  expect(within(stage(/^Lead/)).getByRole('link', { name: 'Cobalt', hidden: true })).toBeInTheDocument()
  await user.click(within(drawer).getByRole('button', { name: /close/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('link', { name: 'Cobalt' })).toHaveFocus()
})

test('closing the drawer returns focus to the row that opened it', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: /close/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveFocus()
})

test('moving a row to a folded stage and closing the drawer focuses that stage heading', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...a, status: 'lost' }) })
  renderApp(<PipelinePage />)
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  const drawer = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(drawer).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Lost' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Lost.*2 organisations/, hidden: true })).toBeInTheDocument())
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.getByRole('button', { name: /^Lost/ })).toHaveFocus()
})

test('the fold buttons stay enabled while filtering, say so, and do nothing', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  renderApp(<PipelinePage />)
  await user.type(await screen.findByRole('searchbox', { name: 'Filter organisations' }), 'a')
  const lead = screen.getByRole('button', { name: /^Lead/ })
  expect(lead).toBeEnabled()
  expect(lead).toHaveAttribute('aria-disabled', 'true')
  expect(lead).toHaveAccessibleName(expect.stringContaining('(showing all while filtering)'))
  await user.click(lead)
  expect(lead).toHaveAttribute('aria-expanded', 'true')
  expect(localStorage.getItem('binder.pipeline.fold.lead')).toBeNull()
})

test('an empty Pipeline says there are no leads, whatever the owner filter does not hide', async () => {
  stubFetch({ ...routes, 'GET /api/orgs?kind=lead': () => [] })
  renderApp(<PipelinePage />)
  expect(await screen.findByText('No leads yet.')).toBeInTheDocument()
})

// The Columns view

const dt = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' })

async function openColumns() {
  localStorage.setItem('binder.pipeline.view', 'columns')
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
}

/** The column a stage's heading belongs to, and its body, where drops land. */
const columnOf = (name: string) => screen.getByRole('heading', { name, level: 2 }).closest('.tenon-column') as HTMLElement
const bodyOf = (name: string) => columnOf(name).querySelector('.tenon-column__body') as HTMLElement

function drag(card: string, to: string) {
  const el = screen.getByRole('link', { name: card }).closest('[draggable="true"]') as HTMLElement
  fireEvent.dragStart(el, { dataTransfer: dt() })
  fireEvent.dragOver(bodyOf(to), { dataTransfer: dt() })
  fireEvent.drop(bodyOf(to), { dataTransfer: dt() })
}

test('the toggle starts on List, switches to Columns, and the choice is remembered', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  const first = renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('table', { name: 'Leads by stage' })).toBeInTheDocument()
  await user.click(screen.getByRole('radio', { name: 'Columns' }))
  expect(screen.queryByRole('table')).toBeNull()
  expect(localStorage.getItem('binder.pipeline.view')).toBe('columns')
  first.unmount()
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  expect(screen.getByRole('radio', { name: 'Columns' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByRole('table')).toBeNull()
})

test('the page works when storage is off', async () => {
  stubFetch(routes)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('off') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('off') })
  const user = userEvent.setup()
  renderApp(<PipelinePage />)
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('radio', { name: 'Columns' }))
  expect(screen.getByRole('heading', { name: 'Contacted', level: 2 })).toBeInTheDocument()
  vi.restoreAllMocks()
})

test('Columns shows one column per stage, in order, without Won, each with its cards', async () => {
  stubFetch(routes)
  await openColumns()
  const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
  expect(names).toEqual(['Lead', 'Contacted', 'In conversation', 'Proposal sent', 'Lost', 'Parked'])
  expect(within(columnOf('Lead')).getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(within(columnOf('Lead')).getByRole('link', { name: 'Zinc' })).toBeInTheDocument()
  expect(within(columnOf('Contacted')).getByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  expect(within(columnOf('Lost')).getByRole('link', { name: 'Gone' })).toBeInTheDocument()
})

test('the filters and the drawer work in Columns', async () => {
  const user = userEvent.setup()
  stubFetch({
    ...routes,
    'GET /api/orgs/by-slug/bolt': () => b,
    'GET /api/orgs/2/contacts': () => [],
    'GET /api/orgs/2/timeline': () => [],
    'GET /api/orgs/2/research': () => [],
    'GET /api/orgs/2/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  await openColumns()
  await user.type(screen.getByRole('searchbox', { name: 'Filter organisations' }), 'bol')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
  await user.click(screen.getByRole('link', { name: 'Bolt' }))
  expect(await screen.findByRole('dialog', { name: 'Bolt' })).toBeInTheDocument()
})

test('dropping a card on another stage saves only the status and updated_at, and moves the card', async () => {
  const calls = stubFetch({ ...routes, 'PATCH /api/orgs/1': () => ({ ...a, status: 'contacted', updated_at: '2026-11-11T09:00:00.000000+00:00' }) })
  await openColumns()
  drag('Acme', 'Contacted')
  await waitFor(() => expect(within(columnOf('Contacted')).getByRole('link', { name: 'Acme' })).toBeInTheDocument())
  expect(within(columnOf('Lead')).queryByRole('link', { name: 'Acme' })).toBeNull()
  await waitFor(() => expect(calls.filter((c) => c.key === 'PATCH /api/orgs/1')).toHaveLength(1))
  expect(calls.find((c) => c.key === 'PATCH /api/orgs/1')!.body).toEqual({ status: 'contacted', updated_at: AT })
})

test('dropping a card on its own stage sends nothing', async () => {
  const calls = stubFetch(routes)
  await openColumns()
  drag('Acme', 'Lead')
  expect(calls.some((c) => c.key.startsWith('PATCH'))).toBe(false)
  expect(within(columnOf('Lead')).getByRole('link', { name: 'Acme' })).toBeInTheDocument()
})

test('a failed save puts the card back and shows an alert', async () => {
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => new Response(JSON.stringify({ detail: 'Server on fire' }), { status: 500 }) })
  await openColumns()
  drag('Acme', 'Contacted')
  expect(await screen.findByRole('alert')).toHaveTextContent('Server on fire')
  expect(within(columnOf('Lead')).getByRole('link', { name: 'Acme' })).toBeInTheDocument()
  expect(within(columnOf('Contacted')).queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('a 409 loads the current copy into the list and says so', async () => {
  const theirs = { ...a, status: 'in_conversation', updated_at: '2026-11-12T09:00:00.000000+00:00' }
  stubFetch({
    ...routes,
    'PATCH /api/orgs/1': () => new Response(JSON.stringify({ detail: 'Changed', current: theirs }), { status: 409 }),
  })
  await openColumns()
  drag('Acme', 'Contacted')
  expect(await screen.findByRole('alert')).toHaveTextContent('Someone changed this')
  await waitFor(() => expect(within(columnOf('In conversation')).getByRole('link', { name: 'Acme' })).toBeInTheDocument())
  expect(within(columnOf('Contacted')).queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('on a phone the columns still render', async () => {
  phone()
  stubFetch(routes)
  await openColumns()
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6)
})

const failing = () => new Response(JSON.stringify({ detail: 'Server on fire' }), { status: 500 })
const openAcme = {
  'GET /api/orgs/by-slug/acme': () => a,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  'GET /api/orgs/by-slug/bolt': () => b,
  'GET /api/orgs/2/contacts': () => [],
  'GET /api/orgs/2/timeline': () => [],
  'GET /api/orgs/2/research': () => [],
  'GET /api/orgs/2/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

test('a failed move\'s alert goes when the view changes', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': failing })
  await openColumns()
  drag('Acme', 'Contacted')
  expect(await screen.findByRole('alert')).toHaveTextContent('Server on fire')
  await user.click(screen.getByRole('radio', { name: 'List' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a failed move\'s alert goes when the drawer opens', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, ...openAcme, 'PATCH /api/orgs/1': failing })
  await openColumns()
  drag('Acme', 'Contacted')
  await screen.findByText('Server on fire')
  await user.click(screen.getByRole('link', { name: 'Bolt' }))
  await screen.findByRole('dialog')
  expect(screen.queryByText('Server on fire')).toBeNull()
})

test('a failed move keeps what the drawer saved meanwhile and puts only the status back', async () => {
  const user = userEvent.setup()
  let release: (r: Response) => void = () => {}
  let calls = 0
  stubFetch({
    ...routes,
    ...openAcme,
    'PATCH /api/orgs/1': () => {
      calls++
      if (calls === 1) return new Promise<Response>((res) => { release = res })
      return { ...a, status: 'contacted', next_step: 'Call Acme', updated_at: 'later' }
    },
  })
  await openColumns()
  drag('Acme', 'Contacted')
  // The drawer saves the same record while the move is in flight (here: a status the move also targets).
  await user.click(within(columnOf('Contacted')).getByRole('link', { name: 'Acme' }))
  const dialog = await screen.findByRole('dialog', { name: 'Acme' })
  await user.click(within(dialog).getByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await user.click(within(dialog).getByRole('button', { name: /close/i }))
  release(failing())
  await screen.findByText('Server on fire')
  const card = within(columnOf('Lead')).getByRole('link', { name: 'Acme' }).closest('.tenon-card') as HTMLElement
  expect(card).toHaveTextContent('Call Acme')
  expect(within(columnOf('Contacted')).queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('Columns cards show no stage tag and open the drawer from anywhere on the card', async () => {
  const user = userEvent.setup()
  stubFetch({ ...routes, ...openAcme })
  await openColumns()
  const lead = columnOf('Lead')
  for (const card of Array.from(lead.querySelectorAll('.tenon-card'))) expect(card).not.toHaveTextContent(/^Lead|\bLead$/)
  await user.click(within(lead).getAllByRole('link', { name: 'Acme' })[0].closest('.tenon-card') as HTMLElement)
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})
