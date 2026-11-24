import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp, SESSION } from '../test/render'
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
  expect(screen.getByText('R')).toHaveAttribute('title', expect.stringContaining('Handled by Rui'))
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
  // The card must leave the click alone so the browser follows the link; stop it there, as jsdom cannot navigate.
  let followed = false
  const follow = (e: MouseEvent) => {
    followed = !e.defaultPrevented
    e.preventDefault()
  }
  document.addEventListener('click', follow)
  await user.keyboard('{Meta>}')
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  await user.keyboard('{/Meta}')
  document.removeEventListener('click', follow)
  expect(followed).toBe(true)
  expect(onOpen).not.toHaveBeenCalled()
})

test('Enter on the focused name opens it too', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} />)
  screen.getByRole('link', { name: 'Acme' }).focus()
  await user.keyboard('{Enter}')
  expect(onOpen).toHaveBeenCalledWith(acme)
})

test('with openOnCard, a click on the card body opens it once', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} openOnCard />)
  await user.click(screen.getByText('Send the proposal'))
  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(onOpen).toHaveBeenCalledWith(acme)
})

test('with openOnCard, a click on the name opens it once, not twice', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} openOnCard />)
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  expect(onOpen).toHaveBeenCalledTimes(1)
})

test('with openOnCard, Enter on the name opens it once, and the card has no second interactive element', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} openOnCard />)
  screen.getByRole('link', { name: 'Acme' }).focus()
  await user.keyboard('{Enter}')
  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(screen.getAllByRole('link')).toHaveLength(1)
  expect(screen.queryByRole('button')).toBeNull()
})

test('with openOnCard, a modified click on the name still follows the link', async () => {
  const user = userEvent.setup()
  const onOpen = vi.fn()
  renderApp(<OrgCard org={acme} onOpen={onOpen} openOnCard />)
  let followed = false
  const follow = (e: MouseEvent) => {
    followed = !e.defaultPrevented
    e.preventDefault()
  }
  document.addEventListener('click', follow)
  await user.keyboard('{Meta>}')
  await user.click(screen.getByRole('link', { name: 'Acme' }))
  await user.keyboard('{/Meta}')
  document.removeEventListener('click', follow)
  expect(followed).toBe(true)
  expect(onOpen).not.toHaveBeenCalled()
})

test('the stage tag shows unless showStatus is off', () => {
  const { unmount } = renderApp(<OrgCard org={acme} />)
  expect(screen.getByText('Lead', { selector: '.tenon-tag *, .tenon-tag' })).toBeInTheDocument()
  unmount()
  renderApp(<OrgCard org={acme} showStatus={false} />)
  expect(screen.queryByText('Lead')).toBeNull()
})

test('the avatar takes its initials from the name on the team list, and its tooltip says Handled by', () => {
  const session = { ...SESSION, meta: { ...SESSION.meta, owners: [{ email: 'ana.silva@example.com', name: 'Ana Silva' }] } }
  renderApp(<OrgCard org={org({ owner_email: 'ana.silva@example.com' })} />, '/', session)
  expect(screen.getByText('AS')).toHaveAttribute('title', 'Handled by Ana Silva')
})

test('the eyebrow names the sector and takes its colour', () => {
  renderApp(<OrgCard org={org({ sector: 'healthcare' })} />)
  const eyebrow = screen.getByText('Healthcare')
  expect(eyebrow).toHaveClass('tn-custom-sector')
  expect(eyebrow).toHaveStyle({ '--tn-sector': 'var(--tenon-chart-4)' })
})
