import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, stubFetch } from '../test/render'
import { filterOrgs, ListPage, options } from './ListPage'

const lead = org({ id: 1, name: 'Acme', slug: 'acme', tags: ['design'] })
const client = org({ id: 2, name: 'Bolt', slug: 'bolt', kind: 'client', status: 'active', owner_email: 'bo@example.com' })

test('filterOrgs applies every filter that is set', () => {
  const all = { kind: '', status: '', owner: '', tag: '' }
  expect(filterOrgs([lead, client], all)).toEqual([lead, client])
  expect(filterOrgs([lead, client], { ...all, kind: 'client' })).toEqual([client])
  expect(filterOrgs([lead, client], { ...all, tag: 'design' })).toEqual([lead])
  expect(filterOrgs([lead, client], { ...all, owner: 'bo@example.com' })).toEqual([client])
})

test('options are unique and sorted, after an Any choice', () => {
  expect(options(['b', null, 'a', 'b'], 'Anyone')).toEqual([
    { value: '', label: 'Anyone' }, { value: 'a', label: 'a' }, { value: 'b', label: 'b' },
  ])
})

test('the URL holds the filters', async () => {
  stubFetch({ 'GET /api/orgs?sort=updated': () => [lead, client] })
  renderApp(<ListPage />, '/list?kind=client')
  expect(await screen.findByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/o/bolt')
  expect(screen.queryByRole('link', { name: 'Acme' })).toBeNull()
})

test('changing the sort asks the API again', async () => {
  const user = userEvent.setup()
  const calls = stubFetch({
    'GET /api/orgs?sort=updated': () => [lead, client],
    'GET /api/orgs?sort=name': () => [lead, client],
  })
  renderApp(<ListPage />, '/list')
  await screen.findByRole('link', { name: 'Acme' })
  await user.click(screen.getByRole('button', { name: 'Sort' }))
  await user.click(screen.getByRole('menuitemradio', { name: 'Name' }))
  await screen.findByRole('link', { name: 'Acme' })
  expect(calls.map((c) => c.key)).toContain('GET /api/orgs?sort=name')
})
