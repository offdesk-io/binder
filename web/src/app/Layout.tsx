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

function Nav({ className }: { className: string }) {
  return (
    <nav className={className}>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
      ))}
    </nav>
  )
}

export function Layout() {
  const { me } = useSession()
  const phone = useIsPhone()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  return (
    <div className="lg-app">
      <header className="lg-top">
        <Link to="/" className="lg-brand">Ledger</Link>
        {!phone && <Nav className="lg-nav" />}
        <SearchBox />
        <Button size="sm" onClick={() => setCreating(true)}>New</Button>
        {!phone && <span className="lg-me">{me.name}</span>}
        {/* nginx answers /auth/logout and ends the Offdesk sign-in. */}
        <form method="post" action="/auth/logout">
          <Button size="sm" variant="ghost" type="submit">Sign out</Button>
        </form>
      </header>
      <main className="lg-main">
        <Outlet />
      </main>
      {phone && <Nav className="lg-tabs" />}
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
