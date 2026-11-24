import { useEffect, type MutableRefObject } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Kind, Org } from '../api/types'

/** What Layout hands its pages: the shared New form (opened with the kind to start from, a lead by default), and the
 * slot where a page registers what to do with the result. */
export interface NewOrgContext {
  open: (kind?: Kind) => void
  created: MutableRefObject<((org: Org) => void) | null>
}

/**
 * A page that lists organisations owns what happens to a new one (put its row in, clear what would hide it, open it).
 * Registers `onCreated` with Layout's New form while the page is mounted, and returns the function that opens the form,
 * so the page's own "add" button and the header's New share one form. Outside Layout the opener does nothing.
 */
export function useNewOrg(onCreated: (org: Org) => void): (kind?: Kind) => void {
  const ctx = useOutletContext<NewOrgContext | null | undefined>()
  const slot = ctx?.created
  // Each render swaps in the latest handler, so it never sees stale state.
  useEffect(() => {
    if (!slot) return
    slot.current = onCreated
    return () => {
      slot.current = null
    }
  })
  return ctx?.open ?? (() => {})
}
