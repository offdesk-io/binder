import { Alert, ColumnEmpty, Dropdown, Input, type DropdownOption } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type OrgSort } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { FilterChips } from '../components/FilterChips'
import { Loading } from '../components/Loading'
import { NextStep, OrgCard } from '../components/OrgCard'
import { OrgDrawer } from '../components/OrgDrawer'
import { SectorLabel } from '../components/SectorLabel'
import { StatusTag } from '../components/StatusTag'
import { ago, label, money, person } from '../lib/format'
import { matchesText } from '../lib/matchesText'
import { openInPlace } from '../lib/openInPlace'
import { ownerOptions } from '../lib/ownerFilter'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { useOrgDrawer } from '../lib/useOrgDrawer'

export interface ListFilters {
  kind: string
  status: string
  owner: string
  tag: string
}

export function filterOrgs(orgs: Org[], f: ListFilters): Org[] {
  return orgs.filter(
    (o) =>
      (!f.kind || o.kind === f.kind) &&
      (!f.status || o.status === f.status) &&
      (!f.owner || (f.owner === 'none' ? !o.owner_email : o.owner_email === f.owner)) &&
      (!f.tag || o.tags.includes(f.tag)),
  )
}

export function options(values: (string | null)[], any: string): DropdownOption[] {
  const unique = Array.from(new Set(values.filter((v): v is string => !!v))).sort()
  return [{ value: '', label: any }, ...unique.map((v) => ({ value: v, label: v }))]
}

const SORTS: DropdownOption<OrgSort>[] = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'last_contact', label: 'Last contact' },
  { value: 'value', label: 'Value' },
]

export function ListPage() {
  const { meta, me } = useSession()
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const [find, setFind] = useState('')
  // `won` is never stored: a won lead is an active client.
  const leadStatuses = meta.lead_statuses.filter((s) => s !== 'won')
  const kindRaw = params.get('kind') ?? ''
  const kind = (meta.kinds as string[]).includes(kindRaw) ? kindRaw : ''
  const statuses = kind === 'client' ? meta.client_statuses : kind === 'lead' ? leadStatuses : [...leadStatuses, ...meta.client_statuses]
  const statusRaw = params.get('status') ?? ''
  const f: ListFilters = {
    kind,
    status: statuses.includes(statusRaw) ? statusRaw : '',
    owner: params.get('owner') ?? '',
    tag: params.get('tag') ?? '',
  }
  const raw = params.get('sort')
  const sort: OrgSort = SORTS.some((s) => s.value === raw) ? (raw as OrgSort) : 'name'
  const orgs = useApi(() => api.orgs({ sort }), [sort], { keep: true })

  const put = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'kind') next.delete('status')
    setParams(next, { replace: true })
  }

  const drawer = useOrgDrawer()
  /** A record saved in the drawer replaces its row in place, without asking the API for the list again. An edited row
   * keeps its position until the next load, even if the sort or filters would now put it elsewhere. Before the list
   * has loaded there is no row to replace, and the load in flight will bring the saved record. */
  function changed(saved: Org) {
    if (!orgs.data) return
    orgs.setData((prev) => (prev ?? []).map((o) => (o.id === saved.id ? saved : o)))
  }

  const all = orgs.data ?? []
  const rows = filterOrgs(all, f).filter((o) => matchesText(o, find))
  const kindCounts = filterOrgs(all, { ...f, kind: '' })

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Organisations</h1>
      {orgs.data && (
        <div className="tn-custom-filterbar">
          <FilterChips
            label="Kind"
            value={f.kind}
            onChange={(v) => put('kind', v)}
            chips={[
              { value: '', label: 'All', count: kindCounts.length },
              { value: 'lead', label: 'Leads', count: kindCounts.filter((o) => o.kind === 'lead').length },
              { value: 'client', label: 'Clients', count: kindCounts.filter((o) => o.kind === 'client').length },
            ]}
          />
          <div className="tn-custom-filterbar-end">
            <Input type="search" className="tn-custom-find" aria-label="Filter organisations" placeholder="Filter organisations…"
              value={find} onChange={(e) => setFind(e.target.value)} />
          </div>
        </div>
      )}
      <div className="tn-toolbar">
        <div className="tn-cluster">
          <Dropdown className="tn-custom-filter" aria-label="Owner" value={f.owner} onChange={(v) => put('owner', v)}
            options={ownerOptions(all, me.email, f.owner)} />
          <Dropdown className="tn-custom-filter" aria-label="Status" value={f.status} onChange={(v) => put('status', v)}
            options={[{ value: '', label: 'Any status' }, ...statuses.map((s) => ({ value: s, label: label(s) }))]} />
          <Dropdown className="tn-custom-filter" aria-label="Tag" value={f.tag} onChange={(v) => put('tag', v)}
            options={options(all.flatMap((o) => o.tags), 'Any tag')} />
          <Dropdown className="tn-custom-filter" aria-label="Sort" value={sort} onChange={(v) => put('sort', v === 'name' ? '' : v)} options={SORTS} />
        </div>
      </div>
      {orgs.error ? (
        <Alert tone="error">{orgs.error.message}</Alert>
      ) : !orgs.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <ColumnEmpty>Nothing matches these filters.</ColumnEmpty>
      ) : phone ? (
        <div className="tn-stack">{rows.map((o) => <OrgCard key={o.id} org={o} onOpen={(x) => drawer.open(x.slug)} />)}</div>
      ) : (
        <div className="tn-table-wrap">
          <table className="tn-custom-table">
            <caption>{rows.length === 1 ? '1 organisation' : `${rows.length} organisations`}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Sector</th>
                <th scope="col">Status</th>
                <th scope="col">Owner</th>
                <th scope="col">Last contact</th>
                <th scope="col">Next step</th>
                <th scope="col" data-numeric>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/o/${o.slug}`} data-org-open={o.slug} onClick={(e) => openInPlace(e, () => drawer.open(o.slug))}>{o.name}</Link>
                  </td>
                  <td>
                    <SectorLabel sector={o.sector} />
                  </td>
                  <td><StatusTag status={o.status} /></td>
                  <td>{person(o.owner_email)}</td>
                  <td>{ago(o.last_contact)}</td>
                  <td><NextStep org={o} /></td>
                  <td data-numeric className="tn-numeric">{money(o.value_estimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={changed} onDeleted={() => orgs.reload()} />
    </div>
  )
}
