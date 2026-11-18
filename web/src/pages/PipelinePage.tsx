import { Alert, Column, ColumnEmpty, Input, SegmentedControl } from '@tiagopedras/tenon'
import { useState } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { ColourDot } from '../components/ColourTag'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { OrgDrawer } from '../components/OrgDrawer'
import { OrgForm } from '../components/OrgForm'
import { byOwner, OwnerChips, useOwnerFilter } from '../components/OwnerChips'
import { columnHead, stageColour } from '../lib/colour'
import { label } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { useOrgDrawer } from '../lib/useOrgDrawer'

export function byStatus(orgs: Org[], statuses: string[]): Record<string, Org[]> {
  const out: Record<string, Org[]> = Object.fromEntries(statuses.map((s) => [s, [] as Org[]]))
  for (const o of orgs) (out[o.status] ??= []).push(o)
  return out
}

const EMPTY: Record<string, string> = { won: 'Drop a lead here when it is won.' }
const EMPTY_PHONE: Record<string, string> = { won: 'No won leads yet.' }

/** A changed lead goes to the front, where the API's newest-first order puts it. */
function place(prev: Org[] | undefined, org: Org): Org[] {
  const rest = (prev ?? []).filter((o) => o.id !== org.id)
  return org.kind === 'lead' ? [org, ...rest] : rest
}

export function PipelinePage() {
  const { meta } = useSession()
  const phone = useIsPhone()
  const orgs = useApi(() => api.orgs({ kind: 'lead' }), [])
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>()
  const [stage, setStage] = useState(meta.lead_statuses[0])
  const [dragId, setDragId] = useState<number>()
  const [over, setOver] = useState<string>()
  const [owner, setOwner] = useOwnerFilter()
  const [find, setFind] = useState('')
  const drawer = useOrgDrawer()
  const [creating, setCreating] = useState(false)

  /** A saved record, from a drag or from the drawer, goes to its column; a client leaves the board with a notice. */
  function changed(saved: Org) {
    orgs.setData((prev) => place(prev, saved))
    if (saved.kind === 'client') setNotice({ tone: 'success', text: `${saved.name} is now a client.` })
  }

  async function move(org: Org, status: string) {
    if (status === org.status) return
    setNotice(undefined)
    try {
      const saved = await api.patchOrg(org.id, { updated_at: org.updated_at, status })
      changed(saved)
    } catch (e) {
      setNotice({ tone: 'error', text: saveErrorText(e) })
      if (e instanceof ApiError && e.status === 409 && e.current) orgs.setData((prev) => place(prev, e.current as Org))
      else orgs.reload()
    }
  }

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  // Orgs whose status isn't in meta.lead_statuses aren't shown on the board.
  const needle = find.trim().toLowerCase()
  const shown = byOwner(orgs.data, owner).filter(
    (o) => !needle || [o.name, o.sector, o.next_step].some((v) => v?.toLowerCase().includes(needle)),
  )
  const groups = byStatus(shown, meta.lead_statuses)
  const top = (
    <>
      <h1 className="tn-custom-sr-only">Pipeline</h1>
      <div className="tn-custom-filterbar">
        <OwnerChips orgs={orgs.data} value={owner} onChange={setOwner} />
        <Input type="search" className="tn-custom-find" aria-label="Filter cards" placeholder="Filter cards…"
          value={find} onChange={(e) => setFind(e.target.value)} />
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
    </>
  )
  const overlays = (
    <>
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={changed} onDeleted={() => orgs.reload()} />
      <OrgForm open={creating} onClose={() => setCreating(false)}
        onSaved={(o) => { setCreating(false); orgs.setData((prev) => place(prev, o)); drawer.open(o.slug) }} />
    </>
  )

  if (phone) {
    return (
      <div className="tn-stack">
        {top}
        <div className="tn-custom-scroll">
          <SegmentedControl
            aria-label="Stage"
            value={stage}
            onChange={setStage}
            options={meta.lead_statuses.map((s) => ({
              value: s,
              label: <><ColourDot colour={stageColour(s)} /> {label(s)} <span className="tn-custom-muted">{groups[s].length}</span></>,
            }))}
          />
        </div>
        <div className="tn-stack">
          {groups[stage].length === 0 && <ColumnEmpty>{EMPTY_PHONE[stage] ?? 'None at this stage.'}</ColumnEmpty>}
          {groups[stage].map((o) => (
            <OrgCard key={o.id} org={o} showStatus={false} onOpen={(x) => drawer.open(x.slug)} />
          ))}
        </div>
        {overlays}
      </div>
    )
  }

  return (
    <div className="tn-stack">
      {top}
      <div className="tn-board tn-custom-board">
        {meta.lead_statuses.map((s) => (
          <Column
            key={s}
            data-testid={`stage-${s}`}
            titleAs="h2"
            title={label(s)}
            titleAfter={<ColourDot colour={stageColour(s)} />}
            tone={columnHead(s).tone}
            muted={columnHead(s).muted}
            count={groups[s].length}
            className={over === s ? 'tn-custom-drop' : undefined}
            footer={s === meta.lead_statuses[0] ? (
              <button type="button" className="tn-custom-add" onClick={() => setCreating(true)}>+ Add organisation</button>
            ) : undefined}
            onDragOver={(e) => {
              if (dragId === undefined) return
              e.preventDefault()
              setOver(s)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
              setOver((o) => (o === s ? undefined : o))
            }}
            onDrop={(e) => {
              e.preventDefault()
              setOver(undefined)
              const org = orgs.data!.find((o) => o.id === dragId)
              setDragId(undefined)
              if (org) void move(org, s)
            }}
          >
            {groups[s].length === 0 && <ColumnEmpty>{EMPTY[s] ?? 'None'}</ColumnEmpty>}
            {groups[s].map((o) => (
              <OrgCard
                key={o.id}
                org={o}
                showStatus={false}
                draggable
                dragging={dragId === o.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(o.id))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragId(o.id)
                }}
                onDragEnd={() => setDragId(undefined)}
                onOpen={(x) => drawer.open(x.slug)}
              />
            ))}
          </Column>
        ))}
      </div>
      {overlays}
    </div>
  )
}
