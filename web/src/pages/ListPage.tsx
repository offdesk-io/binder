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
  const sort: OrgSort = SORTS.some((s) => s.value === raw) ? (raw as OrgSort) : 'updated'
  const orgs = useApi(() => api.orgs({ sort }), [sort], { keep: true })

  const put = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'kind') next.delete('status')
    setParams(next, { replace: true })
  }

  const all = orgs.data ?? []
  const rows = filterOrgs(all, f)

  return (
    <div className="tn-stack">
      <div className="tn-toolbar">
        <h1 className="tenon-heading-3">Organisations</h1>
        <div className="tn-custom-filters">
          <SegmentedControl
            aria-label="Kind"
            value={f.kind}
            onChange={(v) => put('kind', v)}
            options={[{ value: '', label: 'All' }, { value: 'lead', label: 'Leads' }, { value: 'client', label: 'Clients' }]}
          />
          <Dropdown className="tn-custom-filter" aria-label="Status" value={f.status} onChange={(v) => put('status', v)}
            options={[{ value: '', label: 'Any status' }, ...statuses.map((s) => ({ value: s, label: label(s) }))]} />
          <Dropdown className="tn-custom-filter" aria-label="Owner" value={f.owner} onChange={(v) => put('owner', v)}
            options={options(all.map((o) => o.owner_email), 'Anyone', person)} />
          <Dropdown className="tn-custom-filter" aria-label="Tag" value={f.tag} onChange={(v) => put('tag', v)}
            options={options(all.flatMap((o) => o.tags), 'Any tag')} />
          <Dropdown className="tn-custom-filter" aria-label="Sort" value={sort} onChange={(v) => put('sort', v === 'updated' ? '' : v)} options={SORTS} />
        </div>
      </div>
      {orgs.error ? (
        <Alert tone="error">{orgs.error.message}</Alert>
      ) : !orgs.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="tn-custom-faint">Nothing matches these filters.</p>
      ) : phone ? (
        <div className="tn-custom-cards">{rows.map((o) => <OrgCard key={o.id} org={o} />)}</div>
      ) : (
        <div className="tn-table-wrap tn-custom-table-wrap">
          <table>
            <caption>{rows.length === 1 ? '1 organisation' : `${rows.length} organisations`}</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
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
                  <td><Link to={`/o/${o.slug}`}>{o.name}</Link></td>
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
    </div>
  )
}
