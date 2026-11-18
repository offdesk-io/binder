import type { MouseEvent } from 'react'
import { expect, test, vi } from 'vitest'
import { openInPlace } from './openInPlace'

function click(over: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn()
  const e = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0, preventDefault, ...over }
  return { e: e as unknown as MouseEvent<HTMLAnchorElement>, preventDefault }
}

test('a plain click runs the function and stops the link', () => {
  const fn = vi.fn()
  const { e, preventDefault } = click()
  openInPlace(e, fn)
  expect(fn).toHaveBeenCalledOnce()
  expect(preventDefault).toHaveBeenCalledOnce()
})

test.each([
  ['meta', { metaKey: true }],
  ['ctrl', { ctrlKey: true }],
  ['shift', { shiftKey: true }],
  ['alt', { altKey: true }],
  ['a non-primary button', { button: 1 }],
])('a click with %s is left to the browser', (_, over) => {
  const fn = vi.fn()
  const { e, preventDefault } = click(over)
  openInPlace(e, fn)
  expect(fn).not.toHaveBeenCalled()
  expect(preventDefault).not.toHaveBeenCalled()
})
