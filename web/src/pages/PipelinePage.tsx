import { Alert, Column, ColumnEmpty, SegmentedControl } from '@tiagopedras/tenon'
import { useState } from 'react'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { OrgCard } from '../components/OrgCard'
import { StatusPicker } from '../components/StatusPicker'
import { label } from '../lib/format'
import { saveErrorText } from '../lib/forms'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'

export function byStatus(orgs: Org[], statuses: string[]): Record<string, Org[]> {
  const out: Record<string, Org[]> = Object.fromEntries(statuses.map((s) => [s, [] as Org[]]))
  for (const o of orgs) (out[o.status] ??= []).push(o)
  return out
}

const EMPTY: Record<string, string> = { won: 'Drop a lead here when it is won.' }

export function PipelinePage() {
  const { meta } = useSession()
  const phone = useIsPhone()
  const orgs = useApi(() => api.orgs({ kind: 'lead' }), [])
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string }>()
  const [stage, setStage] = useState(meta.lead_statuses[0])
  const [dragId, setDragId] = useState<number>()
  const [over, setOver] = useState<string>()

  async function move(org: Org, status: string) {
    if (status === org.status) return
    setNotice(undefined)
    try {
      const saved = await api.patchOrg(org.id, { updated_at: org.updated_at, status })
      orgs.setData((prev) => {
        const rest = (prev ?? []).filter((o) => o.id !== org.id)
        return saved.kind === 'lead' ? [...rest, saved] : rest
      })
      if (saved.kind === 'client') setNotice({ tone: 'success', text: `${saved.name} is now a client.` })
    } catch (e) {
      setNotice({ tone: 'error', text: saveErrorText(e) })
      orgs.reload()
    }
  }

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  // Orgs whose status isn't in meta.lead_statuses aren't shown on the board.
  const groups = byStatus(orgs.data, meta.lead_statuses)
  const note = notice && <Alert tone={notice.tone}>{notice.text}</Alert>

  if (phone) {
    return (
      <div className="lg-page">
        {note}
        <div className="lg-stages">
          <SegmentedControl
            aria-label="Stage"
            value={stage}
            onChange={setStage}
            options={meta.lead_statuses.map((s) => ({
              value: s,
              label: <>{label(s)} <span className="lg-count">{groups[s].length}</span></>,
            }))}
          />
        </div>
        <div className="lg-cards">
          {groups[stage].length === 0 && <ColumnEmpty>{EMPTY[stage] ?? 'None at this stage.'}</ColumnEmpty>}
          {groups[stage].map((o) => (
            <OrgCard key={o.id} org={o}
              action={<StatusPicker org={o} aria={`Status of ${o.name}`} onChange={(s) => void move(o, s)} />} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="lg-page">
      {note}
      <div className="lg-board">
        {meta.lead_statuses.map((s) => (
          <Column
            key={s}
            data-testid={`stage-${s}`}
            title={label(s)}
            count={groups[s].length}
            className={over === s ? 'lg-drop' : undefined}
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
                draggable
                dragging={dragId === o.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(o.id))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragId(o.id)
                }}
                onDragEnd={() => setDragId(undefined)}
                action={<StatusPicker org={o} aria={`Status of ${o.name}`} onChange={(st) => void move(o, st)} />}
              />
            ))}
          </Column>
        ))}
      </div>
    </div>
  )
}
