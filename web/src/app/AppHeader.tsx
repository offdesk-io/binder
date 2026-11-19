import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export interface AppTab {
  to: string
  label: string
  /** Match the address exactly, for a tab at "/". */
  end?: boolean
}

export interface AppHeaderProps {
  /** The wordmark, usually a link home. Null when the page is framed and the host shows its own. */
  brand: ReactNode
  /** The app's views, drawn as one segmented pill of links. Left out on a phone, where they move to a tab bar. */
  tabs?: AppTab[]
  /** Between the tabs and the actions, pushed right. */
  search?: ReactNode
  /** The right-hand end. */
  actions?: ReactNode
}

/**
 * An app's top bar: sticky, full width on the raised surface, the brand and the
 * view tabs on the left, search and actions on the right. Written to move into Tenon unchanged: it knows nothing
 * about Binder beyond its props, and its classes are its own.
 */
export function AppHeader({ brand, tabs, search, actions }: AppHeaderProps) {
  return (
    <header className="tn-custom-appbar">
      {brand && <div className="tn-custom-appbar-brand">{brand}</div>}
      {tabs && tabs.length > 0 && (
        <nav aria-label="Main">
          <ul className="tn-custom-pill">
            {tabs.map((t) => (
              <li key={t.to}>
                <NavLink to={t.to} end={t.end} className="tn-custom-pill-tab">{t.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="tn-custom-appbar-gap" />
      {search && <div className="tn-custom-appbar-search">{search}</div>}
      {actions && <div className="tn-custom-appbar-actions">{actions}</div>}
    </header>
  )
}
