import { Alert, Button, Card, LinkButton, Tag } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Org, TimelineInteraction } from '../api/types'
import { Loading } from '../components/Loading'
import { NextStep } from '../components/OrgCard'
import { OrgForm } from '../components/OrgForm'
import { QuickLog } from '../components/QuickLog'
import { ResearchSection } from '../components/ResearchSection'
import { StatusPicker } from '../components/StatusPicker'
import { useSession } from '../app/session'
import { label, money, person, safeHref } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { PeopleSection } from './org/PeopleSection'
import { TimelineSection } from './org/TimelineSection'

export function OrgPage() {
  const { slug = '' } = useParams()
  const org = useApi(() => api.orgBySlug(slug), [slug])
  if (org.error && !org.data) return <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
  if (!org.data) return <Loading />
  // A failed refresh keeps the page that is already on screen.
  return <OrgView key={org.data.id} org={org.data} setOrg={org.setData} reloadOrg={org.reload} refreshError={org.error?.message} />
}

function facts(org: Org): [string, ReactNode][] {
  const all: [string, ReactNode][] = [
    ['Next step', org.next_step ? <NextStep org={org} /> : null],
    ['Sector', org.sector],
    ['Size', org.size],
    ['Location', org.location],
    ['Source', org.source],
    ['Value', money(org.value_estimate)],
    ['Tags', org.tags.length ? org.tags.map((t) => <Tag key={t}>{t}</Tag>) : null],
  ]
  return all.filter(([, v]) => v)
}

interface ViewProps {
  org: Org
  setOrg: (o: Org) => void
  reloadOrg: () => void
  refreshError?: string
}

function OrgView({ org, setOrg, reloadOrg, refreshError }: ViewProps) {
  const phone = useIsPhone()
  const navigate = useNavigate()
  const { meta } = useSession()
  const contacts = useApi(() => api.contacts(org.id), [org.id])
  const timeline = useApi(() => api.timeline(org.id), [org.id])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [log, setLog] = useState<'new' | TimelineInteraction>()
  const afterLog = () => {
    setLog(undefined)
    timeline.reload()
    reloadOrg() // last_contact moves
  }
  const siteHref = safeHref(org.website)
  const siteLink = siteHref ? <a href={siteHref} target="_blank" rel="noreferrer">{org.website}</a> : org.website
  const primary = contacts.data?.find((c) => c.is_primary)

  async function changeStatus(status: string) {
    if (status === org.status || busy) return
    setBusy(true)
    setNotice(undefined)
    try {
      setOrg(await api.patchOrg(org.id, { updated_at: org.updated_at, status }))
      timeline.reload()
    } catch (e) {
      setNotice(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) setOrg(e.current as Org)
      else reloadOrg()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tn-stack">
      <header className="tn-stack">
        <div className="tn-toolbar">
          <div className="tn-custom-title">
            <h1 className="tenon-heading-3">{org.name}</h1>
            <StatusPicker org={org} aria="Status" onChange={(s) => void changeStatus(s)} disabled={busy} />
          </div>
          <div className="tn-cluster tn-custom-actions">
            {!phone && <Button variant="primary" onClick={() => setLog('new')}>Log</Button>}
            <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
            {meta.ai && <LinkButton variant="ghost" href="#research">Research</LinkButton>}
            {!phone && primary?.phone && <LinkButton variant="ghost" href={`tel:${primary.phone}`}>Call {primary.name}</LinkButton>}
            {primary?.email && <LinkButton variant="ghost" href={`mailto:${primary.email}`}>Email {primary.name}</LinkButton>}
          </div>
        </div>
        <p className="tenon-caption tn-custom-faint">
          {label(org.kind)} · owned by {person(org.owner_email)}
          {org.website && <> · {siteLink}</>}
        </p>
        {(notice ?? refreshError) && <Alert tone="error">{notice ?? `Could not refresh this page: ${refreshError}`}</Alert>}
      </header>

      <div className="tn-grid tn-custom-split">
        <div className="tn-col-8 tn-stack">
          <Card titleAs="h2" title="Overview">
            {org.summary ? <p className="tn-custom-body">{org.summary}</p> : <p className="tn-custom-faint">No summary yet.</p>}
            <dl className="tn-custom-facts">
              {facts(org).map(([k, v]) => (
                <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
              ))}
            </dl>
          </Card>
          <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} />
          <ResearchSection subject={{ kind: 'org', id: org.id }} orgId={org.id} people={contacts} />
        </div>
        <div className="tn-col-4 tn-stack">
          <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
        </div>
      </div>

      {phone && (
        <div className="tn-custom-bar">
          <Button variant="primary" onClick={() => setLog('new')}>Log</Button>
          {primary?.phone && <LinkButton variant="secondary" href={`tel:${primary.phone}`}>Call</LinkButton>}
        </div>
      )}

      <OrgForm
        open={editing}
        org={org}
        onClose={() => setEditing(false)}
        onSaved={(o) => {
          setEditing(false)
          setOrg(o)
          timeline.reload()
        }}
        onDeleted={() => navigate('/list')}
      />
      <QuickLog
        open={log !== undefined}
        orgId={org.id}
        contacts={contacts.data}
        initial={log === 'new' ? undefined : log}
        onClose={() => setLog(undefined)}
        onSaved={afterLog}
      />
    </div>
  )
}
