import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { OrgCard } from './OrgCard'

const acme = org({
  id: 1, slug: 'acme', name: 'Acme', sector: 'Retail', next_step: 'Send the proposal', next_step_due: '2026-11-20',
  value_estimate: 12000, owner_email: 'rui@example.com',
})

test('a card shows sector, name, next step and the chips', () => {
  renderApp(<OrgCard org={acme} />)
  expect(screen.getByText('Retail')).toHaveClass('tn-custom-sector')
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/o/acme')
  expect(screen.getByText('Send the proposal')).toBeInTheDocument()
  expect(screen.getByText('€12k')).toBeInTheDocument()
  expect(screen.getByText('R')).toHaveAttribute('title', expect.stringContaining('rui'))
})

test('the name link carries the slug the drawer hands focus back to', () => {
  renderApp(<OrgCard org={acme} />)
  expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('data-org-open', 'acme')
})

test('no sector, no label', () => {
  renderApp(<OrgCard org={org({ sector: null })} />)
  expect(document.querySelector('.tn-custom-sector')).toBeNull()
})

test('with onOpen, clicking the name opens instead of navigating', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} />)
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  expect(onOpen).toHaveBeenCalledWith(acme)
})

test('a modified click still follows the link, so it can open in a new tab', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} />)
  await user.keyboard('{Meta>}')
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  await user.keyboard('{/Meta}')
  expect(onOpen).not.toHaveBeenCalled()
})
