import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderApp } from '../test/render'
import { AppHeader } from './AppHeader'

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/pipeline', label: 'Pipeline' },
]

test('the header holds the brand, the tabs, the search slot and the actions', () => {
  renderApp(
    <AppHeader brand={<span>brand</span>} tabs={TABS} search={<input aria-label="Find" />} actions={<button>Go</button>} />,
    '/pipeline',
  )
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByText('brand')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('textbox', { name: 'Find' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
})

test('without tabs there is no nav', () => {
  renderApp(<AppHeader brand={<span>brand</span>} />)
  expect(screen.queryByRole('navigation')).toBeNull()
})
