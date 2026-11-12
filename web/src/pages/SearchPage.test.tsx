import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { SearchHit } from '../api/types'
import { renderApp, stubFetch } from '../test/render'
import { hitLink, SearchPage, Snippet } from './SearchPage'

const hit = (o: Partial<SearchHit>): SearchHit => ({
  kind: 'org', id: 1, org_id: 1, org_name: 'Acme', org_slug: 'acme', title: 'Acme', snippet: '\u0002Acme\u0003 studio', contact_id: null, ...o,
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
