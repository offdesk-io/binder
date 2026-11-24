import { Alert, Button, ColumnEmpty, Input } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Org, Person } from '../api/types'
import { useNewOrg } from '../app/newOrg'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { OrgDrawer } from '../components/OrgDrawer'
import { Star } from '../components/Star'
import { StatusTag } from '../components/StatusTag'
import { money, person } from '../lib/format'
import { matchesText } from '../lib/matchesText'
import { openInPlace } from '../lib/openInPlace'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { useOrgDrawer } from '../lib/useOrgDrawer'

export interface PartnerFigures {
  clients: number
  leads: number
  /** The summed value of the clients they brought in. */
  value: number
}

/** What each partner brought in, counted from every organisation's introduced_by_org_id, by partner id. */
export function introducedBy(orgs: Org[]): Map<number, PartnerFigures> {
  const out = new Map<number, PartnerFigures>()
  for (const o of orgs) {
    if (o.introduced_by_org_id == null) continue
    const f = out.get(o.introduced_by_org_id) ?? { clients: 0, leads: 0, value: 0 }
    if (o.kind === 'client') {
      f.clients += 1
      f.value += o.value_estimate ?? 0
    } else if (o.kind === 'lead') {
      f.leads += 1
    }
    out.set(o.introduced_by_org_id, f)
  }
  return out
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `2 clients · 1 lead`, or `Nothing yet`. */
export function broughtIn(f: PartnerFigures | undefined): string {
  if (!f || (f.clients === 0 && f.leads === 0)) return 'Nothing yet'
  const parts: string[] = []
  if (f.clients) parts.push(count(f.clients, 'client', 'clients'))
  if (f.leads) parts.push(count(f.leads, 'lead', 'leads'))
  return parts.join(' · ')
}

/** The people at a partner, connectors starred. */
function PeopleThere({ people }: { people: Person[] }) {
  if (people.length === 0) return <span className="tn-custom-faint">No one yet</span>
  return (
    <span className="tn-custom-chiprow">
      {people.map((p) => (
        <span key={p.id} className="tn-cluster">
          {p.connector && <Star />}
          <Link to={`/c/${p.id}`}>{p.name}</Link>
        </span>
      ))}
    </span>
  )
}

export function PartnersPage() {
  const phone = useIsPhone()
  // Every organisation, not just the partners: what each partner brought in is counted from the rest.
  const orgs = useApi(() => api.orgs({ sort: 'name' }), [])
  const people = useApi(() => api.people(), [])
  const [find, setFind] = useState('')
  const drawer = useOrgDrawer()

  /** A new organisation, a partner or anything else made from the header's New, opens in the drawer over the list. */
  function created(o: Org) {
    orgs.reload()
    setFind('')
    drawer.open(o.slug)
  }
  const addOrganisation = useNewOrg(created)

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  const figures = introducedBy(orgs.data)
  const partners = orgs.data.filter((o) => o.kind === 'partner' && matchesText(o, find))
  const at = (id: number) => (people.data ?? []).filter((p) => p.org_id === id)
  const value = (id: number) => figures.get(id)?.value ?? 0

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Partners</h1>
      <div className="tn-custom-filterbar">
        <div className="tn-custom-filterbar-end">
          <Input type="search" className="tn-custom-find" aria-label="Filter partners" placeholder="Filter partners…"
            value={find} onChange={(e) => setFind(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={() => addOrganisation('partner')}>New partner</Button>
        </div>
      </div>
      {people.error && <Alert tone="error">{people.error.message}</Alert>}
      {partners.length === 0 ? (
        <ColumnEmpty>{find.trim() ? 'Nothing matches this filter.' : 'No partners yet.'}</ColumnEmpty>
      ) : phone ? (
        <div className="tn-stack">
          {partners.map((o) => (
            <OrgCard
              key={o.id}
              org={o}
              onOpen={(x) => drawer.open(x.slug)}
              summary={<PeopleThere people={at(o.id)} />}
              footer={
                <span className="tn-custom-chiprow">
                  <span>{broughtIn(figures.get(o.id))}</span>
                  {value(o.id) > 0 && <span>{money(value(o.id))}</span>}
                </span>
              }
            />
          ))}
        </div>
      ) : (
        <div className="tn-table-wrap">
          <table className="tn-custom-table">
            <caption>{partners.length === 1 ? '1 partner' : `${partners.length} partners`}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Owner</th>
                <th scope="col">People</th>
                <th scope="col">Brought in</th>
                <th scope="col" data-numeric>Clients’ value</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/o/${o.slug}`} data-org-open={o.slug} onClick={(e) => openInPlace(e, () => drawer.open(o.slug))}>{o.name}</Link>
                  </td>
                  <td><StatusTag status={o.status} /></td>
                  <td>{person(o.owner_email)}</td>
                  <td><PeopleThere people={at(o.id)} /></td>
                  <td>{broughtIn(figures.get(o.id))}</td>
                  <td data-numeric className="tn-numeric">{value(o.id) > 0 ? money(value(o.id)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={() => orgs.reload()}
        onDeleted={() => { orgs.reload(); people.reload() }} />
    </div>
  )
}
