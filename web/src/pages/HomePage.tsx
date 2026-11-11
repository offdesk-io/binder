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
    <div className="lg-home">
      <Column title="Needs attention" count={attention.data?.length}>
        {attention.error ? (
          <Alert tone="error">{attention.error.message}</Alert>
        ) : !attention.data ? (
          <Loading />
        ) : attention.data.length === 0 ? (
          <ColumnEmpty>Nothing needs you today.</ColumnEmpty>
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
      <Column title="Recent activity">
        {activity.error ? (
          <Alert tone="error">{activity.error.message}</Alert>
        ) : !activity.data ? (
          <Loading />
        ) : activity.data.length === 0 ? (
          <ColumnEmpty>Nothing has happened yet.</ColumnEmpty>
        ) : (
          <ul className="lg-activity">
            {activity.data.map((a) => (
              <li key={`${a.kind}${a.id}`}>
                <span><Link to={`/o/${a.org_slug}${a.kind === 'interaction' ? `#i-${a.id}` : ''}`}>{a.org_name}</Link></span>
                <span>{what(a)}</span>
                <span className="lg-faint">{person(a.by_email)} · {ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Column>
    </div>
  )
}
