import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { SearchHit } from '../api/types'
import { AT, org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { hitLink, SearchPage, Snippet } from './SearchPage'

const hit = (o: Partial<SearchHit>): SearchHit => ({
  kind: 'org', id: 1, org_id: 1, org_name: 'Acme', org_slug: 'acme', org_status: 'lead', org_kind: 'lead', title: 'Acme', snippet: '\u0002Acme\u0003 studio', contact_id: null, ...o,
})

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

test('a partner or referrer hit carries its own kind chip, and a lead or client does not', async () => {
  stubFetch({
    'GET /api/search?q=x': () => [
      hit({ id: 1, title: 'Pixel', org_slug: 'pixel', org_kind: 'partner', org_status: 'active' }),
      hit({ id: 2, title: 'Rui', org_slug: 'rui', org_kind: 'referrer', org_status: 'in_talks' }),
      hit({ id: 3, title: 'Lee', org_slug: 'lee', org_kind: 'lead', org_status: 'contacted' }),
    ],
  })
  renderApp(<SearchPage />, '/search?q=x')
  const rows = (await screen.findAllByRole('listitem')).map((li) => li.textContent)
  expect(rows[0]).toContain('Partner')
  expect(rows[0]).toContain('Active')
  expect(rows[1]).toContain('Referrer')
  expect(rows[1]).toContain('In talks')
  expect(rows[2]).not.toMatch(/Lead|Client|Partner|Referrer/)
})
