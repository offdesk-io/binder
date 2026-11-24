import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import * as embeddedModule from '../lib/embedded'
import { org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { Layout } from './Layout'
import { useNewOrg } from './newOrg'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

function app(path = '/') {
  return renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<Where />} />
      </Route>
    </Routes>,
    path,
  )
}

test('the top bar shows the nav and who is signed in', () => {
  app()
  expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Leads pipeline' })).toHaveAttribute('href', '/pipeline')
  expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/clients')
  expect(screen.queryByRole('link', { name: 'List' })).toBeNull()
  expect(screen.getByText('Ana')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
})

test('slash focuses search, and typing opens the results page', async () => {
  const user = userEvent.setup()
  app()
  await user.keyboard('/')
  const box = screen.getByRole('searchbox', { name: 'Search' })
  expect(box).toHaveFocus()
  await user.keyboard('acme')
  expect(box).toHaveValue('acme')
  expect(await screen.findByText('at /search?q=acme')).toBeInTheDocument()
})

test('slash inside a field types a slash', async () => {
  const user = userEvent.setup()
  app()
  const box = screen.getByRole('searchbox', { name: 'Search' })
  await user.click(box)
  await user.keyboard('a/b')
  expect(box).toHaveValue('a/b')
})

test('the box shows the query when the page opens on search', () => {
  app('/search?q=bolt')
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('bolt')
})

test('a pending search is dropped when the page changes first', async () => {
  const user = userEvent.setup()
  app()
  await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'ac')
  await user.click(screen.getByRole('link', { name: 'Leads pipeline' }))
  await new Promise((r) => setTimeout(r, 400))
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('')
})

function Nav() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/search?q=two')}>go two</button>
      <button onClick={() => navigate(-1)}>back</button>
    </>
  )
}

test('the box follows the URL on back and forward', async () => {
  const user = userEvent.setup()
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<Nav />} />
      </Route>
    </Routes>,
    '/search?q=one',
  )
  const box = screen.getByRole('searchbox', { name: 'Search' })
  await user.click(screen.getByRole('button', { name: 'go two' }))
  expect(box).toHaveValue('two')
  await user.click(screen.getByRole('button', { name: 'back' }))
  expect(box).toHaveValue('one')
})

test('clearing the box on the search page leaves the query', async () => {
  const user = userEvent.setup()
  app('/search?q=one')
  await user.clear(screen.getByRole('searchbox', { name: 'Search' }))
  expect(await screen.findByText('at /search')).toBeInTheDocument()
})

test('slash is ignored while a modal is open', async () => {
  const user = userEvent.setup()
  renderApp(
    <>
      <Layout />
      <div className="tenon-modal" />
    </>,
  )
  await user.keyboard('/')
  expect(screen.getByRole('searchbox', { name: 'Search' })).not.toHaveFocus()
})

test('slash does nothing while a drawer is open', async () => {
  const user = userEvent.setup()
  app()
  const panel = document.createElement('div')
  panel.setAttribute('data-drawer', '')
  document.body.appendChild(panel)
  await user.keyboard('/')
  expect(screen.getByRole('searchbox', { name: 'Search' })).not.toHaveFocus()
  panel.remove()
})

async function addOrganisation(path: string) {
  const user = userEvent.setup()
  stubFetch({ 'POST /api/orgs': (b) => org({ name: (b as { name: string }).name, slug: 'newco' }) })
  app(path)
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Newco')
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

function Lists() {
  const [seen, setSeen] = useState('nothing')
  useNewOrg((o) => setSeen(o.slug))
  return <p>page got {seen}</p>
}

test('a new organisation is handed to the page that registered for it, and does not leave the page', async () => {
  const user = userEvent.setup()
  stubFetch({ 'POST /api/orgs': (b) => org({ name: (b as { name: string }).name, slug: 'newco' }) })
  renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/pipeline" element={<Lists />} />
      </Route>
    </Routes>,
    '/pipeline',
  )
  await user.click(screen.getByRole('button', { name: 'New' }))
  await user.type(screen.getByLabelText(/^Name/), 'Newco')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('page got newco')).toBeInTheDocument()
})

test('a new organisation saved from anywhere else opens its page', async () => {
  await addOrganisation('/')
  expect(await screen.findByText('at /o/newco')).toBeInTheDocument()
})

test('a pending search keeps the organisation open in the drawer', async () => {
  const user = userEvent.setup()
  app('/search?q=one&org=acme')
  await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'x')
  expect(await screen.findByText('at /search?q=onex&org=acme')).toBeInTheDocument()
})

test('inside a frame the header leaves out the wordmark, the name and Sign out', () => {
  vi.spyOn(embeddedModule, 'isEmbedded').mockReturnValue(true)
  app()
  expect(screen.queryByRole('link', { name: 'Binder, home' })).not.toBeInTheDocument()
  expect(screen.queryByText('Ana')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Leads pipeline' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  vi.restoreAllMocks()
})

test('on its own the header is as before', () => {
  vi.spyOn(embeddedModule, 'isEmbedded').mockReturnValue(false)
  app()
  expect(screen.getByRole('link', { name: 'Binder, home' })).toBeInTheDocument()
  expect(screen.getByText('Ana')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  vi.restoreAllMocks()
})
