import { Button } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { OrgForm } from '../components/OrgForm'
import { useIsPhone } from '../lib/useIsPhone'
import { SearchBox } from './SearchBox'
import { useSession } from './session'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/pipeline', label: 'Pipeline', end: false },
  { to: '/list', label: 'List', end: false },
]

/** The desktop links sit in the header; on a phone they are a tab bar at the foot of the screen. */
function Nav({ tabs }: { tabs?: boolean }) {
  return (
    <nav aria-label="Main" className={tabs ? 'tn-custom-tabs' : undefined}>
      <ul className={tabs ? 'tn-nav tn-custom-tab-list' : 'tn-nav'}>
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
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  return (
    <div className="tn-page">
      <a className="tn-skip-link" href="#main">Skip to content</a>
      <header className="tn-header">
        <div className="tn-custom-brand">
          <Link to="/" className="tn-identity">Binder</Link>
          {!phone && <Nav />}
        </div>
        <SearchBox />
        <div className="tn-cluster tn-custom-tools">
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>New</Button>
          {!phone && <span className="tenon-caption tn-custom-me">{me.name}</span>}
          {/* nginx answers /auth/logout and ends the Offdesk sign-in. */}
          <form method="post" action="/auth/logout">
            <Button size="sm" variant="ghost" type="submit">Sign out</Button>
          </form>
        </div>
      </header>
      <main id="main" className="tn-custom-main">
        <Outlet />
      </main>
      {phone && <Nav tabs />}
      <OrgForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(o) => {
          setCreating(false)
          navigate(`/o/${o.slug}`)
        }}
      />
    </div>
  )
}
