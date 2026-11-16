import { Alert, Column, ColumnEmpty, Tag } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { ActivityItem } from '../api/types'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { ago, label, person, REASON_TEXT, statusLine } from '../lib/format'
import { useApi } from '../lib/useApi'

function what(a: ActivityItem): string {
  if (a.kind === 'status') return statusLine(a.from_status, a.to_status ?? '')
  return `${label(a.type ?? '')}: ${a.summary ?? ''}`
}

export function HomePage() {
  const attention = useApi(api.attention, [])
  const activity = useApi(() => api.activity(30), [])
  return (
    <div className="tn-stack">
      <div className="tn-toolbar">
        <h1 className="tenon-heading-3">Home</h1>
      </div>
      <div className="tn-grid tn-custom-split">
        <Column className="tn-col-8" titleAs="h2" title="Needs attention" count={attention.data?.length}>
          {attention.error ? (
            <Alert tone="error">{attention.error.message}</Alert>
          ) : !attention.data ? (
            <Loading />
          ) : attention.data.length === 0 ? (
            <ColumnEmpty boxed>Nothing needs you today.</ColumnEmpty>
          ) : (
            attention.data.map((a) => (
              <OrgCard
                key={a.org.id}
                org={a.org}
                footer={a.reasons.map((r) => (
                  <Tag key={r} tone={r === 'overdue' ? 'urgent' : 'soon'}>{REASON_TEXT[r]}</Tag>
                ))}
              />
            ))
          )}
        </Column>
        <Column className="tn-col-4" titleAs="h2" title="Recent activity">
          {activity.error ? (
            <Alert tone="error">{activity.error.message}</Alert>
          ) : !activity.data ? (
            <Loading />
          ) : activity.data.length === 0 ? (
            <ColumnEmpty>Nothing has happened yet.</ColumnEmpty>
          ) : (
            <ul className="tn-custom-rows">
              {activity.data.map((a) => (
                <li key={`${a.kind}${a.id}`}>
                  <p className="tenon-body">
                    <Link to={`/o/${a.org_slug}${a.kind === 'interaction' ? `#i-${a.id}` : ''}`}>{a.org_name}</Link>
                    <span className="tn-custom-faint" aria-hidden="true"> · </span>
                    <span>{what(a)}</span>
                  </p>
                  <div className="tenon-caption tn-custom-faint">{person(a.by_email)} · {ago(a.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Column>
      </div>
    </div>
  )
}
