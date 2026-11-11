import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { renderApp } from '../test/render'
import { Layout } from './Layout'

function Where() {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}

function app(path = '/') {
  return renderApp(
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<Where />} />
      </Route>
    </Routes>,
    path,
  )
}

test('the top bar shows the nav and who is signed in', () => {
  app()
  expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('href', '/pipeline')
  expect(screen.getByText('Ana')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
})

test('slash focuses search, and typing opens the results page', async () => {
  const user = userEvent.setup()
  app()
  await user.keyboard('/')
  const box = screen.getByRole('searchbox', { name: 'Search' })
  expect(box).toHaveFocus()
  await user.keyboard('acme')
  expect(box).toHaveValue('acme')
  expect(await screen.findByText('at /search?q=acme')).toBeInTheDocument()
})

test('slash inside a field types a slash', async () => {
  const user = userEvent.setup()
  app()
  const box = screen.getByRole('searchbox', { name: 'Search' })
  await user.click(box)
  await user.keyboard('a/b')
  expect(box).toHaveValue('a/b')
})

test('the box shows the query when the page opens on search', () => {
  app('/search?q=bolt')
  expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('bolt')
})
