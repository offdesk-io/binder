import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer, Dropdown } from '@tiagopedras/tenon'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'

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
  expect(dialog).toHaveFocus()
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

test('Shift+Tab from the first item wraps to the last', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  await user.tab()
  expect(screen.getByRole('button', { name: 'Log' })).toHaveFocus()
  await user.tab({ shift: true })
  expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus()
})

test('Shift+Tab with the panel itself focused stays inside', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  await user.tab({ shift: true })
  expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  expect(document.activeElement).not.toBe(screen.getByRole('dialog'))
})

test('a button that renders after opening is still trapped', async () => {
  const user = userEvent.setup()
  function Late() {
    const [more, setMore] = useState(false)
    return (
      <Drawer open title="Late" onClose={() => {}}>
        {more ? <button>Later</button> : <p>Nothing yet</p>}
        <input type="checkbox" aria-label="toggle" onChange={() => setMore(true)} />
      </Drawer>
    )
  }
  render(<><button>Outside</button><Late /></>)
  await user.click(screen.getByRole('checkbox', { name: 'toggle' }))
  expect(await screen.findByRole('button', { name: 'Later' })).toBeInTheDocument()
  for (let i = 0; i < 5; i++) {
    await user.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  }
})

test('Escape inside an open Dropdown closes the menu, not the drawer', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(
    <Drawer open title="D" onClose={onClose}>
      <Dropdown aria-label="Pick" value="a" onChange={() => {}} options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
    </Drawer>,
  )
  await user.click(screen.getByRole('button', { name: /Pick|Alpha/ }))
  expect(screen.getByRole('menuitemradio', { name: 'Beta' })).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menuitemradio', { name: 'Beta' })).toBeNull()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})

test('an opener removed while open does not throw, and returnFocus is honoured', async () => {
  const user = userEvent.setup()
  function H({ give }: { give?: () => HTMLElement | null }) {
    const [open, setOpen] = useState(false)
    const [gone, setGone] = useState(false)
    return (
      <>
        {!gone && <button onClick={() => setOpen(true)}>Open it</button>}
        <button>Elsewhere</button>
        <Drawer open={open} title="T" onClose={() => setOpen(false)} returnFocus={give} actions={<button onClick={() => setGone(true)}>Drop</button>}>
          <p>x</p>
        </Drawer>
      </>
    )
  }
  const { unmount } = render(<H />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  await user.click(screen.getByRole('button', { name: 'Drop' }))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body).toHaveFocus()
  unmount()

  render(<H give={() => screen.getByRole('button', { name: 'Elsewhere' })} />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus()
})

test('the page does not scroll while it is open, and does again after', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open it' }))
  expect(document.documentElement.style.overflow).toBe('hidden')
  await user.keyboard('{Escape}')
  expect(document.documentElement.style.overflow).toBe('')
})
