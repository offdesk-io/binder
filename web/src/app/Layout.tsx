import { Button } from '@tiagopedras/tenon'
import { useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { OrgForm } from '../components/OrgForm'
import { isEmbedded } from '../lib/embedded'
import { useIsPhone } from '../lib/useIsPhone'
import type { Org } from '../api/types'
import { AppHeader } from './AppHeader'
import type { NewOrgContext } from './newOrg'
import { SearchBox } from './SearchBox'
import { useSession } from './session'
import { Wordmark } from './Wordmark'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/pipeline', label: 'Pipeline', end: false },
  { to: '/list', label: 'List', end: false },
]

/** On a phone the views are a tab bar at the foot of the screen; on a desktop they are AppHeader's tabs. */
function Nav() {
  return (
    <nav aria-label="Main" className="tn-custom-tabs">
      <ul className="tn-nav tn-custom-tab-list">
        {NAV.map((n) => (
          <li key={n.to}><NavLink to={n.to} end={n.end}>{n.label}</NavLink></li>
        ))}
      </ul>
    </nav>
  )
}

export function Layout() {
  const { me } = useSession()
  const phone = useIsPhone()
  // Inside the Offdesk shell, the shell shows the brand, the person and Sign out.
  const embedded = isEmbedded()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  // A page that lists organisations registers here what to do with a new one; with none, it gets its own page.
  const created = useRef<((org: Org) => void) | null>(null)
  const context: NewOrgContext = { open: () => setCreating(true), created }
  return (
    <div className="tn-custom-app">
      <a className="tn-skip-link" href="#main">Skip to content</a>
      <AppHeader
        brand={embedded ? null : <Link to="/" aria-label="Binder, home"><Wordmark className="tn-custom-wordmark" /></Link>}
        tabs={phone ? undefined : NAV}
        search={<SearchBox />}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>New</Button>
            {!embedded && !phone && <span className="tenon-caption tn-custom-me">{me.name}</span>}
            {/* nginx answers /auth/logout and ends the Offdesk sign-in. */}
            {!embedded && (
              <form method="post" action="/auth/logout">
                <Button size="sm" variant="ghost" type="submit">Sign out</Button>
              </form>
            )}
          </>
        }
      />
      <main id="main" tabIndex={-1} className="tn-custom-main">
        <Outlet context={context} />
      </main>
      {phone && <Nav />}
      <OrgForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(o) => {
          setCreating(false)
          if (created.current) created.current(o)
          else navigate(`/o/${o.slug}`)
        }}
      />
    </div>
  )
}
