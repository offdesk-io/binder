import { Alert, Card, ColumnEmpty } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import { api } from '../../api/endpoints'
import type { KeyPerson } from '../../api/types'
import { KindTag } from '../../components/KindTag'
import { Loading } from '../../components/Loading'
import { Star } from '../../components/Star'
import { ago } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useIsPhone } from '../../lib/useIsPhone'
import { ReachButtons } from './ReachButtons'

/** True when the person's name, role or organisation contains `needle`, ignoring case. An empty needle matches all. */
export function matchesPerson(p: KeyPerson, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  return !n || [p.name, p.role, p.org_name].some((v) => v?.toLowerCase().includes(n))
}

function Name({ p }: { p: KeyPerson }) {
  return (
    <span className="tn-custom-person-name">
      <Star />
      <Link to={`/c/${p.id}`}>{p.name}</Link>
    </span>
  )
}

/** Where they are: their organisation, or for a referrer's own person a Referrer pill, since the record is them. */
function Where({ p }: { p: KeyPerson }) {
  return p.referrer ? <KindTag kind="referrer" /> : <Link to={`/o/${p.org_slug}`}>{p.org_name}</Link>
}

const HEADS = ['Name', 'Role', 'Organisation', 'Last contact', 'Introduced', 'Reach']

/** The People view of the pipeline: every key person, A to Z, with one tap to reach them. `find` is the page's
 * filter box. */
export function PeopleView({ find }: { find: string }) {
  const phone = useIsPhone()
  const people = useApi(() => api.people(), [])

  if (people.error) return <Alert tone="error">{people.error.message}</Alert>
  if (!people.data) return <Loading />
  const rows = people.data.filter((p) => matchesPerson(p, find))
  if (rows.length === 0) {
    return (
      <ColumnEmpty>
        {find.trim() ? 'Nobody matches this filter.' : 'No key people yet. Star someone as a key connector on their page, or add a referrer.'}
      </ColumnEmpty>
    )
  }
  if (phone) {
    return (
      <div className="tn-stack">
        {rows.map((p) => (
          <Card
            key={p.id}
            titleAs="h2"
            title={<Name p={p} />}
            summary={<span className="tn-custom-stage-line">{p.role && <span>{p.role}</span>}<Where p={p} /></span>}
            meta={
              <span className="tenon-caption tn-custom-faint">
                {[`Last contact ${ago(p.last_contact)}`, p.introduced_count > 0 && `Introduced ${p.introduced_count}`]
                  .filter(Boolean).join(' · ')}
              </span>
            }
            footer={<ReachButtons c={p} />}
          />
        ))}
      </div>
    )
  }
  return (
    <div className="tn-table-wrap">
      <table className="tn-custom-table tn-custom-people-table" aria-label="Key people">
        <thead>
          <tr>
            {HEADS.map((h) => (
              <th key={h} scope="col" data-numeric={h === 'Introduced' ? true : undefined}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><Name p={p} /></td>
              <td>{p.role}</td>
              <td><Where p={p} /></td>
              <td>{ago(p.last_contact)}</td>
              <td data-numeric className="tn-numeric">{p.introduced_count > 0 ? p.introduced_count : ''}</td>
              <td><ReachButtons c={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
