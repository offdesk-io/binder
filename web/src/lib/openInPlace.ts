import type { MouseEvent } from 'react'

/**
 * Runs `open` for a plain click on a link (or on a card standing in for one), in place of following it. A modified click (new tab, new window, download)
 * or a non-primary button is left alone, so the link still does what the browser does with it.
 */
export function openInPlace(e: MouseEvent<HTMLElement>, open: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  open()
}
