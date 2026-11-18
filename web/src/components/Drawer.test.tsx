import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { Drawer } from './Drawer'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Drawer open={open} title="Acme" onClose={() => { setOpen(false); onClose() }} actions={<button>Log</button>}>
        <button>Inside</button>
      </Drawer>
    </>
  )
}

test('closed, nothing is in the page', () => {
  render(<Harness />)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('open, it is a labelled dialog with its title, actions and body, and focus moves in', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  const dialog = screen.getByRole('dialog', { name: 'Acme' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument()
  expect(dialog).toContainElement(document.activeElement as HTMLElement)
})

test('Escape and Close both close it, and focus returns to what opened it', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<Harness onClose={onClose} />)
  const opener = screen.getByRole('button', { name: 'Open it' })
  await user.click(opener)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(opener).toHaveFocus()
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('clicking the scrim closes it', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  await user.click(screen.getByTestId('drawer-scrim'))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('Tab stays inside the drawer', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  const dialog = screen.getByRole('dialog')
  for (let i = 0; i < 6; i++) {
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  }
})
