import { Alert, Button, ColumnEmpty, LinkButton, Tag, useDrawerTools } from '@tiagopedras/tenon'
import { createPortal } from 'react-dom'
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Org, TimelineInteraction } from '../../api/types'
import { useSession } from '../../app/session'
import { NextStep } from '../../components/OrgCard'
import { OrgForm } from '../../components/OrgForm'
import { QuickLog } from '../../components/QuickLog'
import { ResearchSection } from '../../components/ResearchSection'
import { StatusPicker } from '../../components/StatusPicker'
import { stageColour } from '../../lib/colour'
import { ago, label, money, person, safeHref } from '../../lib/format'
import { saveErrorText } from '../../lib/forms'
import { SEGMENT_KEY } from '../../lib/pipeline'
import { writeChoice } from '../../lib/remembered'
import { useApi } from '../../lib/useApi'
import { useIsPhone } from '../../lib/useIsPhone'
import { IntroducedSection } from './IntroducedSection'
import { PeopleSection } from './PeopleSection'
import { FrameContext, Section, type Frame } from './Section'
import { TimelineSection } from './TimelineSection'
import { WorkSection } from './WorkSection'

/** The facts under the overview, value and last contact first. */
function facts(org: Org): [string, ReactNode][] {
  const all: [string, ReactNode][] = [
    ['Next step', org.next_step ? <NextStep org={org} /> : null],
    ['Value', org.value_estimate != null ? money(org.value_estimate) : null],
    ['Last contact', ago(org.last_contact)],
    ['Sector', org.sector],
    ['Size', org.size],
    ['Location', org.location],
    ['Source', org.source],
    ['Tags', org.tags.length ? org.tags.map((t) => <Tag key={t}>{t}</Tag>) : null],
  ]
  return all.filter(([, v]) => v)
}

interface Props {
  /** On its own page, or in the drawer over a list. */
  frame: Frame
  org: Org
  setOrg: (o: Org) => void
  reloadOrg: () => void
  refreshError?: string
  /** Told whenever a new record arrives after the first (a status change, an edit, a conflict's current version, a
   * reload after a log or a failed save), so a list behind can update. */
  onChanged?: (org: Org) => void
  /** In the drawer, what happens once the organisation is deleted. Without it, and on the page, it goes to the list. */
  onDeleted?: () => void
}

/** One organisation: its header and sections, drawn for its own page or for the drawer. */
export function OrgDetail({ frame, org, setOrg, reloadOrg, refreshError, onChanged, onDeleted }: Props) {
  const phone = useIsPhone()
  const toolsSlot = useDrawerTools()
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

  // Every new record reaches onChanged, whichever path brought it. The ref keeps the effect off the caller's
  // callback identity; `seen` skips the first record, and a StrictMode re-run with the same one.
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const seen = useRef(org)
  useEffect(() => {
    if (seen.current === org) return
    seen.current = org
    onChangedRef.current?.(org)
  }, [org])

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

  /** Back to where this kind of record lives: Clients for a client, the Pipeline for the rest, on the segment
   * that holds its kind. */
  function goAfterDelete() {
    if (org.kind === 'client') return navigate('/clients')
    writeChoice(SEGMENT_KEY, org.kind)
    navigate('/pipeline')
  }

  const caption = (
    <p className="tenon-caption tn-custom-faint">
      {label(org.kind)} · owned by {person(org.owner_email)}
      {org.introduced_by && <> · Introduced by <Link to={`/o/${org.introduced_by.slug}`}>{org.introduced_by.name}</Link></>}
      {org.website && <> · {siteLink}</>}
    </p>
  )

  const overview = (
    <Section id="overview" title="Overview">
      {org.summary ? <p className="tenon-body tn-custom-body">{org.summary}</p> : <ColumnEmpty>No summary yet.</ColumnEmpty>}
      <dl className="tn-custom-facts">
        {facts(org).map(([k, v]) => (
          <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
        ))}
      </dl>
    </Section>
  )

  const forms = (
    <>
      <OrgForm
        open={editing}
        org={org}
        onClose={() => setEditing(false)}
        onSaved={(o) => {
          setEditing(false)
          setOrg(o)
          timeline.reload()
        }}
        onDeleted={() => (frame === 'drawer' && onDeleted ? onDeleted() : goAfterDelete())}
      />
      <QuickLog
        open={log !== undefined}
        orgId={org.id}
        contacts={contacts.data}
        initial={log === 'new' ? undefined : log}
        onClose={() => setLog(undefined)}
        onSaved={afterLog}
      />
    </>
  )

  if (frame === 'drawer') {
    // The tools go up into the drawer's head so they stay put while the body scrolls. They are still this
    // component's own elements (a portal keeps their state, handlers and context here); outside a Drawer there is
    // no slot, and they stay in the body.
    const tools = (
      <>
        <StatusPicker org={org} aria="Status" onChange={(s) => void changeStatus(s)} disabled={busy} />
        <Button size="sm" variant="primary" onClick={() => setLog('new')}>Log</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
        <Link className="tenon-button tenon-button--ghost tenon-button--sm" to={`/o/${org.slug}`}>Open page</Link>
      </>
    )
    return (
      <FrameContext.Provider value="drawer">
        <div className="tn-stack">
          {toolsSlot === undefined ? (
            <div className="tn-cluster tn-custom-drawer-tools">{tools}</div>
          ) : (
            toolsSlot && createPortal(tools, toolsSlot)
          )}
          {caption}
          {(notice ?? refreshError) && <Alert tone="error">{notice ?? `Could not refresh: ${refreshError}`}</Alert>}
          {overview}
          <IntroducedSection org={org} />
          <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
          <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} limit={5} moreHref={`/o/${org.slug}`} />
          <ResearchSection subject={{ kind: 'org', id: org.id }} orgId={org.id} people={contacts} />
          {meta.bench && <WorkSection orgId={org.id} slug={org.slug} />}
        </div>
        {forms}
      </FrameContext.Provider>
    )
  }

  return (
    <FrameContext.Provider value="page">
      <div className="tn-stack">
        <header className="tn-stack tn-custom-stage" style={{ '--tn-stage': stageColour(org.status).mark } as CSSProperties}>
          <div className="tn-toolbar">
            <div className="tn-cluster tn-custom-title">
              <h1 className="tenon-heading-3">{org.name}</h1>
              <StatusPicker org={org} aria="Status" onChange={(s) => void changeStatus(s)} disabled={busy} />
            </div>
            <div className="tn-cluster">
              {!phone && <Button size="sm" variant="primary" onClick={() => setLog('new')}>Log</Button>}
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              {meta.ai && <LinkButton size="sm" variant="ghost" href="#research">Research</LinkButton>}
              {!phone && primary?.phone && <LinkButton size="sm" variant="ghost" href={`tel:${primary.phone}`}>Call {primary.name}</LinkButton>}
              {primary?.email && <LinkButton size="sm" variant="ghost" href={`mailto:${primary.email}`}>Email {primary.name}</LinkButton>}
            </div>
          </div>
          {caption}
          {(notice ?? refreshError) && <Alert tone="error">{notice ?? `Could not refresh this page: ${refreshError}`}</Alert>}
        </header>

        <div className="tn-grid tn-custom-split">
          <div className="tn-col-8 tn-stack">
            {overview}
            <IntroducedSection org={org} />
            <TimelineSection items={timeline} contacts={contacts.data ?? []} onEdit={setLog} />
            <ResearchSection subject={{ kind: 'org', id: org.id }} orgId={org.id} people={contacts} />
          </div>
          <div className="tn-col-4 tn-stack">
            <PeopleSection orgId={org.id} contacts={contacts} onChanged={timeline.reload} />
            {meta.bench && <WorkSection orgId={org.id} slug={org.slug} />}
          </div>
        </div>

        {phone && (
          <div className="tn-custom-bar">
            <Button variant="primary" onClick={() => setLog('new')}>Log</Button>
            {primary?.phone && <LinkButton variant="secondary" href={`tel:${primary.phone}`}>Call</LinkButton>}
          </div>
        )}

        {forms}
      </div>
    </FrameContext.Provider>
  )
}
