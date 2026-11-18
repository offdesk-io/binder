import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { AT, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { OrgDrawer } from './OrgDrawer'

const acme = org({ id: 1, slug: 'acme', name: 'Acme', sector: 'Retail' })
const routes = {
  'GET /api/orgs/by-slug/acme': () => acme,
  'GET /api/orgs/1/contacts': () => [],
  'GET /api/orgs/1/timeline': () => [],
  'GET /api/orgs/1/research': () => [],
  'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
}

test('with no slug nothing shows', () => {
  stubFetch(routes)
  renderApp(<OrgDrawer slug={undefined} onClose={() => {}} />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('a slug loads the organisation into a drawer named after it', async () => {
  stubFetch(routes)
  renderApp(<OrgDrawer slug="acme" onClose={() => {}} />)
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Open page' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Retail')).toBeInTheDocument()
})

test('a status change in the drawer is reported to the page behind', async () => {
  const user = userEvent.setup()
  const onChanged = vi.fn()
  stubFetch({ ...routes, 'PATCH /api/orgs/1': () => org({ ...acme, status: 'contacted' }) })
  renderApp(<OrgDrawer slug="acme" onClose={() => {}} onChanged={onChanged} />)
  await user.click(await screen.findByRole('button', { name: 'Status' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  await vi.waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: 'contacted' })))
})

test('closing hands focus to the element that opened this organisation, even if the list re-rendered', async () => {
  const user = userEvent.setup()
  stubFetch(routes)
  function Harness() {
    const [open, setOpen] = useState(false)
    const [version, setVersion] = useState(0)
    return (
      <>
        {/* A new key stands for the list behind re-rendering and replacing the card that opened the drawer. */}
        <a key={version} href="/o/acme" data-org-open="acme" onClick={(e) => { e.preventDefault(); setOpen(true) }}>Acme card</a>
        <button onClick={() => setVersion((v) => v + 1)}>Refresh list</button>
        <OrgDrawer slug={open ? 'acme' : undefined} onClose={() => setOpen(false)} />
      </>
    )
  }
  renderApp(<Harness />)
  await user.click(screen.getByRole('link', { name: 'Acme card' }))
  await screen.findByRole('dialog', { name: 'Acme' })
  act(() => screen.getByRole('button', { name: 'Refresh list', hidden: true }).click())
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('link', { name: 'Acme card' })).toHaveFocus()
})

test('while loading the title is the slug, and a failed load offers Retry', async () => {
  const user = userEvent.setup()
  let ok = false
  stubFetch({ ...routes, 'GET /api/orgs/by-slug/acme': () => (ok ? acme : new Response(JSON.stringify({ detail: 'Down' }), { status: 500 })) })
  renderApp(<OrgDrawer slug="acme" onClose={() => {}} />)
  expect(screen.getByRole('dialog', { name: 'acme' })).toBeInTheDocument()
  const retry = await screen.findByRole('button', { name: 'Retry' })
  ok = true
  await user.click(retry)
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})
