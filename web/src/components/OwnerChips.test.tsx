import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { byOwner, OwnerChips, useOwnerFilter } from './OwnerChips'

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
      <OwnerChips orgs={orgs} value={owner} onChange={setOwner} />
      <p>at {l.search}</p>
      <p>shown {byOwner(orgs, owner).length}</p>
    </>
  )
}

function app(path = '/pipeline') {
  renderApp(<Routes><Route path="*" element={<Page />} /></Routes>, path)
}

test('All, Me first, then other owners, then No owner, each with its count', () => {
  app()
  const chips = screen.getAllByRole('button').map((b) => b.textContent)
  expect(chips).toEqual(['All4', 'Me2', 'rui1', 'No owner1'])
  expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true')
})

test('picking an owner filters and goes in the address', async () => {
  const user = userEvent.setup()
  app()
  await user.click(screen.getByRole('button', { name: /^Me/ }))
  expect(screen.getByText('at ?owner=ana%40example.com')).toBeInTheDocument()
  expect(screen.getByText('shown 2')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /No owner/ }))
  expect(screen.getByText('at ?owner=none')).toBeInTheDocument()
  expect(screen.getByText('shown 1')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /All/ }))
  expect(screen.getByText('at')).toBeInTheDocument()
})

test('a filter in a shared link is applied on load', () => {
  app('/pipeline?owner=rui%40example.com')
  expect(screen.getByRole('button', { name: /^rui/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('shown 1')).toBeInTheDocument()
})
