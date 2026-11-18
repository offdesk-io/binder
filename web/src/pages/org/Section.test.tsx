import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { FrameContext, Section } from './Section'

afterEach(() => localStorage.clear())

test('on the page a section is a plain column with an h2', () => {
  render(<Section id="people" title="People"><p>body</p></Section>)
  expect(screen.getByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument()
  expect(document.querySelector('details')).toBeNull()
})

test('in the drawer it collapses, starts open, and remembers being closed', async () => {
  const user = userEvent.setup()
  const { unmount } = render(
    <FrameContext.Provider value="drawer"><Section id="people" title="People"><p>body</p></Section></FrameContext.Provider>,
  )
  const details = document.querySelector('details')!
  expect(details.open).toBe(true)
  expect(screen.getByRole('heading', { level: 3, name: 'People' })).toBeInTheDocument()
  await user.click(screen.getByText('People'))
  expect(details.open).toBe(false)
  expect(localStorage.getItem('binder.drawer.people')).toBe('closed')
  unmount()
  render(<FrameContext.Provider value="drawer"><Section id="people" title="People"><p>body</p></Section></FrameContext.Provider>)
  expect(document.querySelector('details')!.open).toBe(false)
})

test("a button in a drawer section's head does not fold the section", async () => {
  const user = userEvent.setup()
  const onAdd = vi.fn()
  render(
    <FrameContext.Provider value="drawer">
      <Section id="people" title="People" action={<button onClick={onAdd}>Add person</button>}><p>body</p></Section>
    </FrameContext.Provider>,
  )
  await user.click(screen.getByRole('button', { name: 'Add person' }))
  expect(onAdd).toHaveBeenCalled()
  expect(document.querySelector('details')!.open).toBe(true)
})

test('on the page a section never touches storage', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem')
  const write = vi.spyOn(Storage.prototype, 'setItem')
  render(<Section id="people" title="People"><p>body</p></Section>)
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  read.mockRestore()
  write.mockRestore()
})
