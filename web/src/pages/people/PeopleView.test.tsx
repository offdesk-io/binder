import { screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { keyPerson } from '../../test/fixtures'
import { appTree, renderApp, stubFetch } from '../../test/render'
import { matchesPerson, PeopleView } from './PeopleView'

const marta = keyPerson({
  id: 8, name: 'Marta Example', role: 'Head of ops', org_name: 'Acme', org_slug: 'acme',
  email: 'marta@example.com', phone: '+351 000 000 000', linkedin_url: 'linkedin.com/in/marta',
  last_contact: null,
})
const rita = keyPerson({
  id: 9, name: 'Rita Example', connector: false, org_name: 'Rita Example', org_slug: 'rita',
  referrer: { id: 4, slug: 'rita', name: 'Rita Example', status: 'active' }, introduced_count: 2,
})

const phone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))

test('matchesPerson looks at the name, the role and the organisation', () => {
  expect(matchesPerson(marta, 'ops')).toBe(true)
  expect(matchesPerson(marta, 'ACME')).toBe(true)
  expect(matchesPerson(rita, 'acme')).toBe(false)
  expect(matchesPerson(rita, '  ')).toBe(true)
})

test('a row has the star, the name, the organisation or a Referrer pill, and the introduced count', async () => {
  stubFetch({ 'GET /api/people': () => [marta, rita] })
  renderApp(<PeopleView find="" />)
  const table = await screen.findByRole('table', { name: 'Key people' })
  const [, first, second] = within(table).getAllByRole('row')
  expect(within(first).getByRole('img', { name: 'Key person' })).toBeInTheDocument()
  expect(within(first).getByRole('link', { name: 'Marta Example' })).toHaveAttribute('href', '/c/8')
  expect(within(first).getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(within(first).getByText('Head of ops')).toBeInTheDocument()
  expect(within(first).getByText('never')).toBeInTheDocument()
  expect(within(second).getByRole('img', { name: 'Key person' })).toBeInTheDocument()
  expect(within(second).getByText('Referrer')).toBeInTheDocument()
  expect(within(second).getByRole('cell', { name: '2' })).toBeInTheDocument()
})

test('reach buttons show only where there is a value', async () => {
  stubFetch({ 'GET /api/people': () => [marta, rita] })
  renderApp(<PeopleView find="" />)
  expect(await screen.findByRole('link', { name: 'Email Marta Example' })).toHaveAttribute('href', 'mailto:marta@example.com')
  expect(screen.getByRole('link', { name: 'Call Marta Example' })).toHaveAttribute('href', 'tel:+351 000 000 000')
  expect(screen.getByRole('link', { name: 'Marta Example on LinkedIn' })).toHaveAttribute('href', 'https://linkedin.com/in/marta')
  expect(screen.queryByRole('link', { name: /Rita Example on LinkedIn|Email Rita|Call Rita/ })).toBeNull()
})

test('the filter narrows the rows, and says when nobody matches', async () => {
  stubFetch({ 'GET /api/people': () => [marta, rita] })
  const { rerender } = renderApp(<PeopleView find="ops" />)
  expect(await screen.findByRole('link', { name: 'Marta Example' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Rita Example' })).toBeNull()
  rerender(appTree(<PeopleView find="nobody" />))
  expect(await screen.findByText('Nobody matches this filter.')).toBeInTheDocument()
})

test('with nobody yet it says how to add someone', async () => {
  stubFetch({ 'GET /api/people': () => [] })
  renderApp(<PeopleView find="" />)
  expect(await screen.findByText(/No key people yet/)).toBeInTheDocument()
})

test('on a phone, people are cards with their reach buttons', async () => {
  phone()
  stubFetch({ 'GET /api/people': () => [marta] })
  const { container } = renderApp(<PeopleView find="" />)
  expect(await screen.findByRole('link', { name: 'Marta Example' })).toBeInTheDocument()
  expect(container.querySelector('table')).toBeNull()
  expect(container.querySelector('.tenon-card')).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Email Marta Example' })).toBeInTheDocument()
})
