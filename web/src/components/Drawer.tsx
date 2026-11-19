import { Button } from '@tiagopedras/tenon'
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface DrawerProps {
  open: boolean
  /** The drawer's name: shown in its head and read out as the dialog's label. */
  title: ReactNode
  onClose: () => void
  /** Buttons in the head, before Close. */
  actions?: ReactNode
  children: ReactNode
  /** Where focus goes on close, if not back to what had it on open (for an opener that may be gone). */
  returnFocus?: () => HTMLElement | null
}

/**
 * The element in the drawer's head that content inside the drawer can portal its tools into, so they stay put while
 * the body scrolls. Undefined outside a drawer; null while the drawer has not yet attached the element.
 */
const ToolsSlot = createContext<HTMLElement | null | undefined>(undefined)
export const useDrawerTools = () => useContext(ToolsSlot)

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * A panel that slides in from the right over the page. It is a modal dialog:
 * a scrim dims the page, focus moves in and stays in, Escape or the scrim or Close shut it, and focus goes back to
 * whatever had it before. On a phone it is the whole screen. Written to move into Tenon unchanged.
 */
export function Drawer({ open, title, onClose, actions, children, returnFocus }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null)
  const before = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const [tools, setTools] = useState<HTMLElement | null>(null)
  const close = useRef(onClose)
  close.current = onClose
  const giveBack = useRef(returnFocus)
  giveBack.current = returnFocus

  useEffect(() => {
    if (!open) return
    before.current = document.activeElement as HTMLElement | null
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    panel.current?.focus()
    // Buttons that can be reached now. jsdom has no layout, so when nothing reports a box the box test is skipped.
    const reachable = () => {
      const all = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => !el.closest('[inert]'))
      const shown = all.filter((el) => el.getClientRects().length > 0)
      return shown.length > 0 ? shown : all
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      // A Tenon modal opened from inside the drawer (Edit, Log) owns Escape and Tab while it is up.
      if (document.querySelector('.tenon-modal')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = reachable()
      if (items.length === 0) {
        e.preventDefault()
        panel.current.focus()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const active = document.activeElement
      const inside = panel.current.contains(active)
      if (e.shiftKey && (!inside || active === panel.current || active === firstItem)) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && (!inside || active === lastItem)) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      root.style.overflow = overflow
      // The preferred element first; if it is gone (or not given), what had focus on open; else nothing.
      const target = [giveBack.current?.(), before.current].find((el) => el?.isConnected)
      target?.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <>
      <div className="tn-custom-scrim" data-testid="drawer-scrim" aria-hidden="true" onClick={() => onClose()} />
      <div ref={panel} className="tn-custom-drawer" data-drawer role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="tn-custom-drawer-head">
          <h2 id={titleId} className="tn-custom-drawer-title">{title}</h2>
          <div className="tn-custom-drawer-tools-slot" ref={setTools} />
          <div className="tn-custom-drawer-actions">
            {actions}
            <Button size="sm" variant="ghost" onClick={() => onClose()}>Close</Button>
          </div>
        </div>
        <ToolsSlot.Provider value={tools}>
          <div className="tn-custom-drawer-body">{children}</div>
        </ToolsSlot.Provider>
      </div>
    </>,
    document.body,
  )
}
