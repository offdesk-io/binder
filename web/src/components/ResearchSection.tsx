import { Alert, Button, ColumnEmpty, Spinner } from '@tiagopedras/tenon'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Contact, Owner, Research } from '../api/types'
import { useSession } from '../app/session'
import { Section } from '../pages/org/Section'
import { day, label, usd } from '../lib/format'
import { ownerName } from '../lib/owners'
import { useApi, type Loaded } from '../lib/useApi'
import { usePoll } from '../lib/usePoll'
import { BriefView } from './BriefView'
import { Loading } from './Loading'

export const POLL_MS = 3000

export interface Subject {
  kind: 'org' | 'contact'
  id: number
}

interface Props {
  subject: Subject
  orgId: number
  people: Loaded<Contact[]>
  /** How often to check a running run. Tests make it short. */
  pollMs?: number
}

const load = (s: Subject) => (s.kind === 'org' ? api.orgResearch(s.id) : api.contactResearch(s.id))
const startRun = (s: Subject) => (s.kind === 'org' ? api.startOrgResearch(s.id) : api.startContactResearch(s.id))

export function runLine(r: Research, owners: Owner[]): string {
  return [day(r.run_at), ownerName(owners, r.author_email), label(r.status), usd(r.cost_usd)].filter(Boolean).join(' · ')
}

export function ResearchSection({ subject, orgId, people, pollMs = POLL_MS }: Props) {
  const { meta } = useSession()
  const { hash } = useLocation()
  const runs = useApi(() => load(subject), [subject.kind, subject.id])
  const [picked, setPicked] = useState<number>()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string>()
  const wasRunning = useRef(false)
  const scrolledFor = useRef<string>()

  const list = runs.data ?? []
  const running = list.some((r) => r.status === 'running')
  usePoll(running ? pollMs : null, runs.reload)

  // A run that was going has finished: show the newest brief, not the one picked before.
  useEffect(() => {
    if (wasRunning.current && !running) setPicked(undefined)
    wasRunning.current = running
  }, [running])

  // The header's Research link and search hits point at #research. Scroll once per hash and subject,
  // so that a poll refreshing the runs does not drag the page back to the section.
  const target = `${hash} ${subject.kind}:${subject.id}`
  useEffect(() => {
    if (hash !== '#research' || !runs.data || scrolledFor.current === target) return
    scrolledFor.current = target
    document.getElementById('research')?.scrollIntoView?.({ block: 'start' })
  }, [hash, target, runs.data])

  const latest = list[0]
  const shown = list.find((r) => r.id === picked && r.brief) ?? list.find((r) => r.status === 'done')

  async function start() {
    if (starting || running) return
    setStarting(true)
    setError(undefined)
    try {
      const r = await startRun(subject)
      runs.setData((prev) => [r, ...(prev ?? [])])
      setPicked(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the research.')
      if (e instanceof ApiError && e.status === 409) runs.reload()
    } finally {
      setStarting(false)
    }
  }

  return (
    <Section
      id="research"
      title="Research"
      action={meta.ai && (
        <Button size="sm" variant="secondary" disabled={starting || running} onClick={() => void start()}>
          {list.some((r) => r.status === 'done') ? 'Research again' : 'Research'}
        </Button>
      )}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {runs.error && !runs.data ? (
        <Alert tone="error">{runs.error.message}</Alert>
      ) : !runs.data ? (
        <Loading />
      ) : (
        <div className="tn-stack">
          {running && (
            <p className="tn-cluster tenon-body tn-custom-muted">
              <Spinner variant="ring" size="sm" label="Researching" />
              Researching. It takes a few minutes, and you can leave this page.
            </p>
          )}
          {latest?.status === 'failed' && (
            <Alert
              tone="error"
              title="The last research run failed"
              actions={meta.ai && <Button size="sm" variant="secondary" disabled={starting} onClick={() => void start()}>Retry</Button>}
            >
              {latest.error}
            </Alert>
          )}
          {shown?.brief ? (
            <BriefView run={shown} orgId={orgId} people={people} />
          ) : (
            !running && latest?.status !== 'failed' && (
              <ColumnEmpty boxed>
                {meta.ai ? 'No research yet. It searches the web and writes a brief.' : 'No research yet. AI is not set up on this server.'}
              </ColumnEmpty>
            )
          )}
          {list.length > 1 && (
            <div className="tenon-field">
              <span className="tenon-field__label">Runs</span>
              <ul className="tn-custom-runs">
                {list.map((r) => (
                  <li key={r.id}>
                    <Button size="sm" variant="ghost" pressed={shown?.id === r.id} disabled={!r.brief} onClick={() => setPicked(r.id)}>
                      {runLine(r, meta.owners)}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
