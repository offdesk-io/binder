import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { byOwner, ownerOptions, useOwnerFilter } from './ownerFilter'

const orgs = [
  org({ id: 1, owner_email: 'ana@example.com' }),
  org({ id: 2, owner_email: 'ana@example.com' }),
  org({ id: 3, owner_email: 'rui@example.com' }),
  org({ id: 4, owner_email: null }),
]

function Page() {
  const [owner, setOwner] = useOwnerFilter()
  const l = useLocation()
  return (
    <>
      <button onClick={() => setOwner('ana@example.com')}>pick ana</button>
      <button onClick={() => setOwner('none')}>pick none</button>
      <button onClick={() => setOwner('')}>pick anyone</button>
      <p>at {l.search}</p>
      <p>shown {byOwner(orgs, owner).length}</p>
    </>
  )
}

function app(path = '/pipeline') {
  renderApp(<Routes><Route path="*" element={<Page />} /></Routes>, path)
}

test('picking an owner filters and goes in the address', async () => {
  const user = userEvent.setup()
  app()
  await user.click(screen.getByRole('button', { name: 'pick ana' }))
  expect(screen.getByText('at ?owner=ana%40example.com')).toBeInTheDocument()
  expect(screen.getByText('shown 2')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'pick none' }))
  expect(screen.getByText('at ?owner=none')).toBeInTheDocument()
  expect(screen.getByText('shown 1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'pick anyone' }))
  expect(screen.getByText('at')).toBeInTheDocument()
  expect(screen.getByText('shown 4')).toBeInTheDocument()
})

test('a filter in a shared link is applied on load', () => {
  app('/pipeline?owner=rui%40example.com')
  expect(screen.getByText('shown 1')).toBeInTheDocument()
})

test('options: Any owner, Me, other owners by name, No owner', () => {
  expect(ownerOptions(orgs, 'ana@example.com')).toEqual([
    { value: '', label: 'Any owner' },
    { value: 'ana@example.com', label: 'Me' },
    { value: 'rui@example.com', label: 'rui' },
    { value: 'none', label: 'No owner' },
  ])
})

test('options leave out Me when I own none, and No owner when every one has an owner', () => {
  expect(ownerOptions([orgs[2]], 'ana@example.com').map((o) => o.label)).toEqual(['Any owner', 'rui'])
})

test('other owners are sorted by name', () => {
  const many = [org({ id: 1, owner_email: 'zed@example.com' }), org({ id: 2, owner_email: 'bo@example.com' })]
  expect(ownerOptions(many, 'me@example.com').map((o) => o.label)).toEqual(['Any owner', 'bo', 'zed'])
})

test('an active owner nobody matches is still listed', () => {
  expect(ownerOptions(orgs, 'ana@example.com', 'gone@example.com')[4]).toEqual({ value: 'gone@example.com', label: 'gone' })
  expect(ownerOptions(orgs, 'ana@example.com', 'rui@example.com')).toHaveLength(4)
})
