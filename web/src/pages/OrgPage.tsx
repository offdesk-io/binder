import { Alert, Button, LinkButton, Tag } from '@tiagopedras/tenon'
import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { Loading } from '../components/Loading'
import { NextStep } from '../components/OrgCard'
import { OrgForm } from '../components/OrgForm'
import { StatusPicker } from '../components/StatusPicker'
import { label, money, person, webHref } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { PeopleSection } from './org/PeopleSection'

export function OrgPage() {
  const { slug = '' } = useParams()
  const org = useApi(() => api.orgBySlug(slug), [slug])
  if (org.error) return <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
  if (!org.data) return <Loading />
  return <OrgView key={org.data.id} org={org.data} setOrg={org.setData} reloadOrg={org.reload} />
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

function OrgView({ org, setOrg, reloadOrg }: { org: Org; setOrg: (o: Org) => void; reloadOrg: () => void }) {
  const phone = useIsPhone()
  const navigate = useNavigate()
  const contacts = useApi(() => api.contacts(org.id), [org.id])
  const timeline = useApi(() => api.timeline(org.id), [org.id])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
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
      reloadOrg()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lg-page">
      <header className="lg-org-head">
        <div className="lg-org-title">
          <h1 className="tenon-heading-1">{org.name}</h1>
          <StatusPicker org={org} aria="Status" onChange={(s) => void changeStatus(s)} />
        </div>
        <p className="lg-faint">
          {label(org.kind)} · owned by {person(org.owner_email)}
          {org.website && <> · <a href={webHref(org.website)} target="_blank" rel="noreferrer">{org.website}</a></>}
        </p>
        <div className="lg-actions">
          {/* LOG BUTTON: Task 16 adds it here. */}
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          {!phone && primary?.phone && <LinkButton variant="secondary" href={`tel:${primary.phone}`}>Call {primary.name}</LinkButton>}
          {primary?.email && <LinkButton variant="secondary" href={`mailto:${primary.email}`}>Email {primary.name}</LinkButton>}
        </div>
        {notice && <Alert tone="error">{notice}</Alert>}
      </header>

      <div className="lg-org-body">
        <div className="lg-column">
          <section className="lg-section">
            <h2 className="tenon-heading-3">Overview</h2>
            {org.summary ? <p className="lg-entry-text">{org.summary}</p> : <p className="lg-faint">No summary yet.</p>}
            <dl className="lg-facts">
              {facts(org).map(([k, v]) => (
                <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
              ))}
            </dl>
          </section>
          {/* TIMELINE: Task 16 adds it here. */}
        </div>
        <div className="lg-column">
          <PeopleSection orgId={org.id} contacts={contacts} />
        </div>
      </div>

      {phone && (
        <div className="lg-bar">
          {/* LOG BAR BUTTON: Task 16 adds it here. */}
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
    </div>
  )
}
