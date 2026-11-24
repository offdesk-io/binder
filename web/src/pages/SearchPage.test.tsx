import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { SearchHit } from '../api/types'
import { AT, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { hitLink, SearchPage, Snippet } from './SearchPage'

const hit = (o: Partial<SearchHit>): SearchHit => ({
  kind: 'org', id: 1, org_id: 1, org_name: 'Acme', org_slug: 'acme', org_status: 'lead', title: 'Acme', snippet: '\u0002Acme\u0003 studio',
  contact_id: null, connector: false, ...o,
})
const ON_THEIR_OWN = { org_id: null, org_name: null, org_slug: null, org_status: null }

test('each kind of hit links to its page', () => {
  expect(hitLink(hit({}))).toBe('/o/acme')
  expect(hitLink(hit({ kind: 'contact', id: 5 }))).toBe('/c/5')
  expect(hitLink(hit({ kind: 'interaction', id: 7 }))).toBe('/o/acme#i-7')
})

test('the snippet marks the matched words', () => {
  render(<Snippet text={'Met \u0002Acme\u0003 about \u0002rebrand\u0003 [draft]'} />)
  expect(screen.getByText('Acme').tagName).toBe('MARK')
  expect(screen.getByText('rebrand').tagName).toBe('MARK')
  expect(screen.getByText(/\[draft\]/)).toBeInTheDocument()
})

test('results are grouped, and empty groups are left out', async () => {
  stubFetch({
    'GET /api/search?q=acme': () => [
      hit({}),
      hit({ kind: 'contact', id: 5, title: 'Bo Ray', snippet: 'Bo at \u0002Acme\u0003' }),
    ],
  })
  renderApp(<SearchPage />, '/search?q=acme')
  expect(await screen.findByRole('heading', { name: 'Organisations' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Contacts' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Interactions' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Bo Ray' })).toHaveAttribute('href', '/c/5')
})

test('no hits says so', async () => {
  stubFetch({ 'GET /api/search?q=zzz': () => [] })
  renderApp(<SearchPage />, '/search?q=zzz')
  expect(await screen.findByText('No matches for “zzz”.')).toBeInTheDocument()
})

test('a research hit links to the brief on its page', () => {
  expect(hitLink(hit({ kind: 'research', id: 3 }))).toBe('/o/acme#research')
  expect(hitLink(hit({ kind: 'research', id: 4, contact_id: 5 }))).toBe('/c/5#research')
})

test('research hits have their own group', async () => {
  stubFetch({ 'GET /api/search?q=kilns': () => [hit({ kind: 'research', id: 3, title: 'Research brief', snippet: 'makes \u0002kilns\u0003' })] })
  renderApp(<SearchPage />, '/search?q=kilns')
  expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Research brief' })).toHaveAttribute('href', '/o/acme#research')
})

test('an organisation hit opens its drawer; contact and anchored hits stay links', async () => {
  const user = userEvent.setup()
  stubFetch({
    'GET /api/search?q=acme': () => [
      hit({}),
      hit({ kind: 'research', id: 3, title: 'Research brief', snippet: 'about \u0002Acme\u0003' }),
    ],
    'GET /api/orgs/by-slug/acme': () => org({ id: 1, slug: 'acme', name: 'Acme' }),
    'GET /api/orgs/1/contacts': () => [],
    'GET /api/orgs/1/timeline': () => [],
    'GET /api/orgs/1/research': () => [],
    'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
  })
  renderApp(<SearchPage />, '/search?q=acme')
  expect(await screen.findByRole('link', { name: 'Research brief' })).not.toHaveAttribute('data-org-open')
  await user.click(await screen.findByRole('link', { name: 'Acme' }))
  expect(await screen.findByRole('dialog', { name: 'Acme' })).toBeInTheDocument()
})


test('a log with no organisation links to its person', () => {
  expect(hitLink(hit({ kind: 'interaction', id: 7, ...ON_THEIR_OWN, contact_id: 8 }))).toBe('/c/8')
})

test('a person with no organisation shows no organisation or status, and a connector shows the star', async () => {
  stubFetch({
    'GET /api/search?q=marta': () => [hit({ kind: 'contact', id: 8, title: 'Marta', snippet: '\u0002Marta\u0003', connector: true, ...ON_THEIR_OWN })],
  })
  const { container } = renderApp(<SearchPage />, '/search?q=marta')
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.getByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.queryByText(/·/)).toBeNull()
  expect(container.querySelector('.tenon-tag')).toBeNull()
})

test('a hit with neither an organisation nor a person links back to search', () => {
  expect(hitLink(hit({ kind: 'interaction', id: 7, ...ON_THEIR_OWN, contact_id: null }))).toBe('/search')
})
