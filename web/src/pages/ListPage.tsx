import { Alert, Dropdown, SegmentedControl, type DropdownOption } from '@tiagopedras/tenon'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type OrgSort } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { NextStep, OrgCard } from '../components/OrgCard'
import { StatusTag } from '../components/StatusTag'
import { ago, label, money, person } from '../lib/format'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'

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
      (!f.owner || o.owner_email === f.owner) &&
      (!f.tag || o.tags.includes(f.tag)),
  )
}

export function options(values: (string | null)[], any: string, show: (v: string) => string = (v) => v): DropdownOption[] {
  const unique = Array.from(new Set(values.filter((v): v is string => !!v))).sort()
  return [{ value: '', label: any }, ...unique.map((v) => ({ value: v, label: show(v) }))]
}

const SORTS: DropdownOption<OrgSort>[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name' },
  { value: 'last_contact', label: 'Last contact' },
  { value: 'value', label: 'Value' },
]

export function ListPage() {
  const { meta } = useSession()
  const phone = useIsPhone()
  const [params, setParams] = useSearchParams()
  const f: ListFilters = {
    kind: params.get('kind') ?? '',
    status: params.get('status') ?? '',
    owner: params.get('owner') ?? '',
    tag: params.get('tag') ?? '',
  }
  const raw = params.get('sort')
  const sort: OrgSort = SORTS.some((s) => s.value === raw) ? (raw as OrgSort) : 'updated'
  const orgs = useApi(() => api.orgs({ sort }), [sort])

  const put = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'kind') next.delete('status')
    setParams(next, { replace: true })
  }

  // `won` is never stored: a won lead is an active client.
  const leadStatuses = meta.lead_statuses.filter((s) => s !== 'won')
  const statuses = f.kind === 'client' ? meta.client_statuses : f.kind === 'lead' ? leadStatuses : [...leadStatuses, ...meta.client_statuses]
  const all = orgs.data ?? []
  const rows = filterOrgs(all, f)

  return (
    <div className="lg-page">
      <div className="lg-filters">
        <SegmentedControl
          aria-label="Kind"
          value={f.kind}
          onChange={(v) => put('kind', v)}
          options={[{ value: '', label: 'All' }, { value: 'lead', label: 'Leads' }, { value: 'client', label: 'Clients' }]}
        />
        <Dropdown aria-label="Status" value={f.status} onChange={(v) => put('status', v)}
          options={[{ value: '', label: 'Any status' }, ...statuses.map((s) => ({ value: s, label: label(s) }))]} />
        <Dropdown aria-label="Owner" value={f.owner} onChange={(v) => put('owner', v)}
          options={options(all.map((o) => o.owner_email), 'Anyone', person)} />
        <Dropdown aria-label="Tag" value={f.tag} onChange={(v) => put('tag', v)}
          options={options(all.flatMap((o) => o.tags), 'Any tag')} />
        <Dropdown aria-label="Sort" value={sort} onChange={(v) => put('sort', v === 'updated' ? '' : v)} options={SORTS} />
      </div>
      {orgs.error ? (
        <Alert tone="error">{orgs.error.message}</Alert>
      ) : !orgs.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="lg-faint">Nothing matches these filters.</p>
      ) : phone ? (
        <div className="lg-cards">{rows.map((o) => <OrgCard key={o.id} org={o} />)}</div>
      ) : (
        <table className="lg-table">
          <thead>
            <tr>
              <th>Name</th><th>Status</th><th>Owner</th><th>Last contact</th><th>Next step</th><th className="lg-num">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/o/${o.slug}`}>{o.name}</Link></td>
                <td><StatusTag status={o.status} /></td>
                <td>{person(o.owner_email)}</td>
                <td>{ago(o.last_contact)}</td>
                <td><NextStep org={o} /></td>
                <td className="lg-num">{money(o.value_estimate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
