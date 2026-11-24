import { Alert, Button, Card, ColumnEmpty, Input, SegmentedControl } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Person } from '../api/types'
import { ContactForm } from '../components/ContactForm'
import { FilterChips } from '../components/FilterChips'
import { Loading } from '../components/Loading'
import { Star } from '../components/Star'
import { shortDay } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { ReachButtons } from './people/ReachButtons'
import { ThanksView } from './people/ThanksView'

type Who = 'connectors' | 'everyone'
type View = 'people' | 'thanks'

/** True when the person's name, role or organisation contains `needle`, ignoring case. An empty needle matches all. */
export function matchesPerson(p: Person, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  return !n || [p.name, p.role, p.org_name].some((v) => v?.toLowerCase().includes(n))
}

const introduced = (n: number) => (n > 0 ? `Introduced ${n}` : '')

function Name({ p }: { p: Person }) {
  return (
    <span className="tn-cluster">
      {p.connector && <Star />}
      <Link to={`/c/${p.id}`}>{p.name}</Link>
    </span>
  )
}

function OrgName({ p }: { p: Person }) {
  return p.org_slug ? <Link to={`/o/${p.org_slug}`}>{p.org_name}</Link> : <span className="tn-custom-faint">No organisation</span>
}

export function PeoplePage() {
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'thanks' ? 'thanks' : 'people'
  const who: Who = params.get('who') === 'everyone' ? 'everyone' : 'connectors'
  const [find, setFind] = useState('')
  const [adding, setAdding] = useState(false)
  const people = useApi(() => api.people(), [])

  // The view and the filter live in the address, replaced in place so Back leaves the page.
  const put = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const found = (people.data ?? []).filter((p) => matchesPerson(p, find))
  const connectors = found.filter((p) => p.connector)
  const rows = who === 'connectors' ? connectors : found
  const empty = find.trim()
    ? 'Nobody matches this filter.'
    : who === 'connectors'
      ? 'No key connectors yet. Star someone on their page, or add a person.'
      : 'No one yet.'

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">People</h1>
      <div className="tn-custom-filterbar">
        <SegmentedControl<View>
          aria-label="View"
          value={view}
          onChange={(v) => put('view', v === 'thanks' ? 'thanks' : '')}
          options={[{ value: 'people', label: 'People' }, { value: 'thanks', label: 'Thanks' }]}
        />
        <div className="tn-custom-filterbar-end">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>New person</Button>
        </div>
      </div>
      {view === 'thanks' ? (
        <ThanksView />
      ) : (
        <>
          <div className="tn-custom-filterbar">
            <FilterChips<Who>
              label="Who"
              value={who}
              onChange={(v) => put('who', v === 'everyone' ? 'everyone' : '')}
              chips={[
                { value: 'connectors', label: 'Connectors', count: connectors.length },
                { value: 'everyone', label: 'Everyone', count: found.length },
              ]}
            />
            <div className="tn-custom-filterbar-end">
              <Input type="search" className="tn-custom-find" aria-label="Find people" placeholder="Find people…"
                value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
          </div>
          {people.error ? (
            <Alert tone="error">{people.error.message}</Alert>
          ) : !people.data ? (
            <Loading />
          ) : rows.length === 0 ? (
            <ColumnEmpty>{empty}</ColumnEmpty>
          ) : phone ? (
            <div className="tn-stack">
              {rows.map((p) => (
                <Card
                  key={p.id}
                  titleAs="h3"
                  title={<Name p={p} />}
                  summary={<span className="tn-custom-muted">{p.role && `${p.role} · `}<OrgName p={p} /></span>}
                  meta={
                    <span className="tenon-caption tn-custom-faint">
                      {[p.last_contact ? `Last touched ${shortDay(p.last_contact)}` : 'Not logged yet', introduced(p.introduced_count)]
                        .filter(Boolean).join(' · ')}
                    </span>
                  }
                  footer={<ReachButtons c={p} />}
                />
              ))}
            </div>
          ) : (
            <div className="tn-table-wrap">
              <table className="tn-custom-table">
                <caption>{rows.length === 1 ? '1 person' : `${rows.length} people`}</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col">Organisation</th>
                    <th scope="col">Last touched</th>
                    <th scope="col">Introduced</th>
                    <th scope="col">Reach</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td><Name p={p} /></td>
                      <td>{p.role}</td>
                      <td><OrgName p={p} /></td>
                      <td>{shortDay(p.last_contact)}</td>
                      <td>{introduced(p.introduced_count)}</td>
                      <td><ReachButtons c={p} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <ContactForm
        open={adding}
        orgId={null}
        chooseOrg
        connectorDefault
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false)
          people.reload()
        }}
      />
    </div>
  )
}
