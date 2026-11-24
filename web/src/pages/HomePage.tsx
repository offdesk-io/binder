import { Alert, Column, ColumnEmpty, Stat, Tag } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { ActivityItem, Org, OrgAttention } from '../api/types'
import { useSession } from '../app/session'
import { ColourDot } from '../components/ColourTag'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { OrgDrawer } from '../components/OrgDrawer'
import { REASON_TONE, stageColour, typeColour } from '../lib/colour'
import { ago, label, money, REASON_TEXT, statusLine } from '../lib/format'
import { ownerName } from '../lib/owners'
import { useApi } from '../lib/useApi'
import { useOrgDrawer } from '../lib/useOrgDrawer'

function what(a: ActivityItem): string {
  if (a.kind === 'status') return statusLine(a.from_status, a.to_status ?? '')
  return `${label(a.type ?? '')}: ${a.summary ?? ''}`
}

/** The figures the stat strip counts, from the organisations and the attention list the page already loads. */
export function headline(orgs: Org[], openStatuses: string[], overdue: number, attention: number) {
  const open = orgs.filter((o) => o.kind === 'lead' && openStatuses.includes(o.status))
  const clients = orgs.filter((o) => o.kind === 'client')
  return {
    pipeline: open.reduce((sum, o) => sum + (o.value_estimate ?? 0), 0),
    openLeads: open.length,
    attention,
    overdue,
    active: clients.filter((o) => o.status === 'active').length,
    paused: clients.filter((o) => o.status === 'paused').length,
  }
}

export function HomePage() {
  const { meta } = useSession()
  const attention = useApi(api.attention, [])
  const activity = useApi(() => api.activity(30), [])
  const orgs = useApi(() => api.orgs(), [])
  const drawer = useOrgDrawer()
  const orgItems = attention.data?.filter((a): a is OrgAttention => 'org' in a)
  const overdue = orgItems?.filter((a) => a.reasons.includes('overdue')).length ?? 0
  const figures = orgs.data && attention.data ? headline(orgs.data, meta.open_lead_statuses, overdue, attention.data.length) : undefined
  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Home</h1>
      {orgs.error ? (
        <Alert tone="error">{orgs.error.message}</Alert>
      ) : !figures ? (
        <Loading />
      ) : (
        <section className="tn-custom-figures" data-testid="figures" aria-label="Figures">
          <Stat eyebrow="Open pipeline" value={money(figures.pipeline)} caption={`${figures.openLeads} open leads`} />
          <Stat
            eyebrow="Needs attention"
            value={String(figures.attention)}
            caption={`${figures.overdue} with a missed next step`}
          />
          <Stat eyebrow="Active clients" value={String(figures.active)} caption={`${figures.paused} paused`} />
        </section>
      )}
      <div className="tn-grid tn-custom-split">
        <Column className="tn-col-8" titleAs="h2" title="Needs attention" count={attention.data?.length}>
          {attention.error ? (
            <Alert tone="error">{attention.error.message}</Alert>
          ) : !attention.data ? (
            <Loading />
          ) : attention.data.length === 0 ? (
            <ColumnEmpty boxed>Nothing needs you today.</ColumnEmpty>
          ) : (
            orgItems?.map((a) => (
              <OrgCard
                key={a.org.id}
                org={a.org}
                onOpen={(o) => drawer.open(o.slug)}
                footer={
                  <span className="tn-custom-chiprow">
                    {a.reasons.map((r) => <Tag key={r} tone={REASON_TONE[r]}>{REASON_TEXT[r]}</Tag>)}
                  </span>
                }
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
                    <ColourDot colour={a.kind === 'status' ? stageColour(a.to_status ?? '') : typeColour(a.type ?? '')} />{' '}
                    <Link to={`/o/${a.org_slug}${a.kind === 'interaction' ? `#i-${a.id}` : ''}`}>{a.org_name}</Link>
                    <span className="tn-custom-faint" aria-hidden="true"> · </span>
                    <span>{what(a)}</span>
                  </p>
                  <div className="tenon-caption tn-custom-faint">{ownerName(meta.owners, a.by_email)} · {ago(a.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Column>
      </div>
      <OrgDrawer
        slug={drawer.slug}
        onClose={drawer.close}
        onChanged={() => { attention.reload(); orgs.reload(); activity.reload() }}
        onDeleted={() => { attention.reload(); orgs.reload() }}
      />
    </div>
  )
}
