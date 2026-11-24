import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { person } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { matchesPerson, PeoplePage } from './PeoplePage'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

const marta = person({
  id: 8, name: 'Marta', connector: true, org_id: null, org_name: null, org_slug: null,
  email: 'marta@example.com', phone: '+351 000 000 000', linkedin_url: 'linkedin.com/in/marta',
  last_contact: '2026-10-12', introduced_count: 2,
})
const zoe = person({ id: 9, name: 'Zoe', role: 'CTO' })

const phone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }))

test('matchesPerson looks at the name, the role and the organisation', () => {
  expect(matchesPerson(zoe, 'cto')).toBe(true)
  expect(matchesPerson(zoe, 'acme')).toBe(true)
  expect(matchesPerson(marta, 'acme')).toBe(false)
  expect(matchesPerson(marta, '')).toBe(true)
})

test('Connectors by default, Everyone shows the rest', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/people': () => [marta, zoe] })
  renderApp(<><PeoplePage /><Where /></>, '/people')
  expect(await screen.findByRole('link', { name: 'Marta' })).toHaveAttribute('href', '/c/8')
  expect(screen.queryByRole('link', { name: 'Zoe' })).toBeNull()
  expect(screen.getByRole('button', { name: /^Connectors/ })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: /^Everyone/ }))
  expect(screen.getByRole('link', { name: 'Zoe' })).toHaveAttribute('href', '/c/9')
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('at /people?who=everyone')).toBeInTheDocument()
})

test('a row has the star, last touched, introduced, and reach buttons only where there is a value', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/people': () => [marta, zoe] })
  renderApp(<PeoplePage />, '/people')
  expect(await screen.findByRole('img', { name: 'Key connector' })).toBeInTheDocument()
  expect(screen.getByText('12 Oct')).toBeInTheDocument()
  expect(screen.getByText('Introduced 2')).toBeInTheDocument()
  expect(screen.getByText('No organisation')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Email Marta' })).toHaveAttribute('href', 'mailto:marta@example.com')
  expect(screen.getByRole('link', { name: 'Call Marta' })).toHaveAttribute('href', 'tel:+351 000 000 000')
  expect(screen.getByRole('link', { name: 'Marta on LinkedIn' })).toHaveAttribute('href', 'https://linkedin.com/in/marta')
  await user.click(screen.getByRole('button', { name: /^Everyone/ }))
  expect(screen.queryByRole('link', { name: 'Email Zoe' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Call Zoe' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Zoe on LinkedIn' })).toBeNull()
})

test('the find box narrows the list', async () => {
  const user = userEvent.setup()
  stubFetch({ 'GET /api/people': () => [marta, zoe] })
  renderApp(<PeoplePage />, '/people?who=everyone')
  await screen.findByRole('link', { name: 'Zoe' })
  await user.type(screen.getByRole('searchbox', { name: 'Find people' }), 'cto')
  expect(screen.queryByRole('link', { name: 'Marta' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Zoe' })).toBeInTheDocument()
})

test('on a phone, people are cards with their reach buttons', async () => {
  phone()
  stubFetch({ 'GET /api/people': () => [marta] })
  const { container } = renderApp(<PeoplePage />, '/people')
  expect(await screen.findByRole('link', { name: 'Marta' })).toBeInTheDocument()
  expect(container.querySelector('table')).toBeNull()
  expect(container.querySelector('.tenon-card')).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Email Marta' })).toBeInTheDocument()
})

test('New person adds someone on their own with the star on, and the list loads again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/people': () => [],
    'GET /api/orgs?sort=name': () => [],
    'POST /api/contacts': () => marta,
  })
  renderApp(<PeoplePage />, '/people')
  expect(await screen.findByText(/No key connectors yet/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New person' }))
  await user.type(screen.getByLabelText(/^Name/), 'Marta')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.filter((c) => c.key === 'GET /api/people')).toHaveLength(2))
  expect(calls.find((c) => c.key === 'POST /api/contacts')!.body).toMatchObject({ name: 'Marta', connector: true, org_id: null })
})

test('Thanks is a view of the same page', async () => {
  const user = userEvent.setup()
  const year = new Date().getFullYear()
  const calls = stubFetch({ 'GET /api/people': () => [marta], [`GET /api/thanks?year=${year}`]: () => [] })
  renderApp(<><PeoplePage /><Where /></>, '/people')
  await screen.findByRole('link', { name: 'Marta' })
  await user.click(screen.getByRole('radio', { name: 'Thanks' }))
  expect(await screen.findByText('at /people?view=thanks')).toBeInTheDocument()
  await waitFor(() => expect(calls.some((c) => c.key === `GET /api/thanks?year=${year}`)).toBe(true))
})
