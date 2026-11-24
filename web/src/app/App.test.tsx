import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderApp, SESSION, stubFetch } from '../test/render'
import { App } from './App'
import { org } from '../test/fixtures'

const routes = {
  'GET /api/meta': () => SESSION.meta,
  'GET /api/whoami': () => SESSION.me,
  'GET /api/orgs?kind=client&sort=name': () => [org({ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'active' })],
}

test('the old List address redirects to Clients', async () => {
  stubFetch(routes)
  renderApp(<App />, '/list')
  expect(await screen.findByRole('link', { name: 'Bolt' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page')
})
