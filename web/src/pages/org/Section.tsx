import { Column, type ColumnProps } from '@tiagopedras/tenon'
import { createContext, useContext, useState, type DetailsHTMLAttributes, type ReactNode } from 'react'

/** Where an organisation's sections are drawn: on its own page, or in the drawer over a list. */
export type Frame = 'page' | 'drawer'
export const FrameContext = createContext<Frame>('page')
export const useFrame = () => useContext(FrameContext)

const key = (id: string) => `binder.drawer.${id}`

function readOpen(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) !== 'closed'
  } catch {
    return true
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    if (open) localStorage.removeItem(key(id))
    else localStorage.setItem(key(id), 'closed')
  } catch {
    // Storage can be off (a private window); the section still folds, it just isn't remembered.
  }
}

interface SectionProps extends Pick<ColumnProps, 'count' | 'titleAfter'> {
  /** The section's element id (a link like #research points at it), and the key its open state is remembered under
   * in the drawer. */
  id: string
  title: ReactNode
  action?: ReactNode
  children: ReactNode
}

/**
 * One section of an organisation: a Tenon Column with an h2 on the page, and in the drawer a collapsible Column
 * with an h3 whose open state is kept per device, as Bench's drawer sections are.
 */
export function Section({ id, title, action, count, titleAfter, children }: SectionProps) {
  const frame = useFrame()
  const [open, setOpen] = useState(() => readOpen(id))
  // Column spreads unknown props onto its <details>; its types are HTMLAttributes, which in React 18 lack onToggle.
  const onToggle: Pick<DetailsHTMLAttributes<HTMLDetailsElement>, 'onToggle'> = {
    onToggle: (e) => {
      const now = e.currentTarget.open
      setOpen(now)
      writeOpen(id, now)
    },
  }
  if (frame === 'page') {
    return <Column id={id} titleAs="h2" title={title} action={action} count={count} titleAfter={titleAfter}>{children}</Column>
  }
  return (
    <Column
      id={id}
      titleAs="h3"
      title={title}
      count={count}
      titleAfter={titleAfter}
      // A click in the summary folds the section, so a button there would too. Cancelling the click on this wrapper
      // stops the summary's toggle; the button's own onClick has already run. It also cancels the default of anything
      // inside it (a link would not follow, a submit would not submit), so head actions must be plain onClick buttons.
      action={action && <span onClick={(e) => e.preventDefault()}>{action}</span>}
      collapsible
      open={open}
      collapseKey={id}
      {...onToggle}
    >
      {children}
    </Column>
  )
}
