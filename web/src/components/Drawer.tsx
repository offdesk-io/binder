import { Button } from '@tiagopedras/tenon'
import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface DrawerProps {
  open: boolean
  /** The drawer's name: shown in its head and read out as the dialog's label. */
  title: ReactNode
  onClose: () => void
  /** Buttons in the head, before Close. */
  actions?: ReactNode
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * A panel that slides in from the right over the page, in the shape Bench's task drawer has. It is a modal dialog:
 * a scrim dims the page, focus moves in and stays in, Escape or the scrim or Close shut it, and focus goes back to
 * whatever had it before. On a phone it is the whole screen. Written to move into Tenon unchanged.
 */
export function Drawer({ open, title, onClose, actions, children }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null)
  const before = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    before.current = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      // A Tenon modal opened from inside the drawer (Edit, Log) owns Escape and Tab while it is up.
      if (document.querySelector('.tenon-modal')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before.current?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <>
      <div className="tn-custom-scrim" data-testid="drawer-scrim" onClick={() => onClose()} />
      <div ref={panel} className="tn-custom-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="tn-custom-drawer-head">
          <h2 id={titleId} className="tn-custom-drawer-title">{title}</h2>
          <div className="tn-custom-drawer-actions">
            {actions}
            <Button size="sm" variant="ghost" onClick={() => onClose()}>Close</Button>
          </div>
        </div>
        <div className="tn-custom-drawer-body">{children}</div>
      </div>
    </>
  )
}
