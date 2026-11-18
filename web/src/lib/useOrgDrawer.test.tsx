import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { expect, test } from 'vitest'
import { useOrgDrawer } from './useOrgDrawer'

function Probe() {
  const d = useOrgDrawer()
  const l = useLocation()
  const back = useNavigate()
  return (
    <>
      <p>at {l.pathname + l.search}</p>
      <p>slug {d.slug ?? '-'}</p>
      <button onClick={() => d.open('acme')}>open</button>
      <button onClick={() => d.open('beta')}>open beta</button>
      <button onClick={() => { d.close(); d.close() }}>close twice</button>
      <button onClick={d.close}>close</button>
      <button onClick={() => back(-1)}>back</button>
    </>
  )
}

function app(path: string | string[]) {
  render(
    <MemoryRouter initialEntries={Array.isArray(path) ? path : [path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="*" element={<Probe />} /></Routes>
    </MemoryRouter>,
  )
}

test('open puts the slug in the address and keeps the other params', async () => {
  const user = userEvent.setup()
  app('/pipeline?owner=ana%40example.com')
  await user.click(screen.getByRole('button', { name: 'open' }))
  expect(screen.getByText('at /pipeline?owner=ana%40example.com&org=acme')).toBeInTheDocument()
  expect(screen.getByText('slug acme')).toBeInTheDocument()
})

test('Back closes a drawer this page opened', async () => {
  const user = userEvent.setup()
  app('/pipeline')
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'back' }))
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
})

test('close after open goes back, so Back afterwards does not reopen it', async () => {
  const user = userEvent.setup()
  app('/pipeline')
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('slug -')).toBeInTheDocument()
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
})

test('a shared link opens with the drawer, and close drops the param without leaving the page', async () => {
  const user = userEvent.setup()
  app('/list?org=acme')
  expect(screen.getByText('slug acme')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('at /list')).toBeInTheDocument()
})

test('a double close goes back once and stays on the page', async () => {
  const user = userEvent.setup()
  app(['/', '/pipeline'])
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'close twice' }))
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
})

test('opening another organisation over an open drawer replaces it, so one close shuts it', async () => {
  const user = userEvent.setup()
  app(['/', '/pipeline'])
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'open beta' }))
  expect(screen.getByText('slug beta')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('slug -')).toBeInTheDocument()
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
})

test('opening the same organisation twice still takes one close', async () => {
  const user = userEvent.setup()
  app(['/', '/pipeline'])
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('slug -')).toBeInTheDocument()
  expect(screen.getByText('at /pipeline')).toBeInTheDocument()
})

test('close keeps the other params', async () => {
  const user = userEvent.setup()
  app('/pipeline?owner=ana%40example.com')
  await user.click(screen.getByRole('button', { name: 'open' }))
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByText('at /pipeline?owner=ana%40example.com')).toBeInTheDocument()
})
