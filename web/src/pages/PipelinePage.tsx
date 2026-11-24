import { Alert, Button, ColumnEmpty, Dropdown, Input, SegmentedControl } from '@tiagopedras/tenon'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { useNewOrg } from '../app/newOrg'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { OrgDrawer } from '../components/OrgDrawer'
import { saveErrorText } from '../lib/forms'
import { statusesOf } from '../lib/kinds'
import { matchesText } from '../lib/matchesText'
import { byOwner, ownerOptions, useOwnerFilter } from '../lib/ownerFilter'
import { SEGMENT_KEY, stages, undoMove, undoWon, wonStage, type Stage } from '../lib/pipeline'
import { readChoice, writeChoice } from '../lib/remembered'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { useOrgDrawer } from '../lib/useOrgDrawer'
import { PipelineColumns } from './pipeline/PipelineColumns'
import { StageGroup } from './pipeline/StageGroup'

type View = 'list' | 'columns'
const VIEW_KEY = 'binder.pipeline.view'
const VIEWS: readonly View[] = ['list', 'columns']

/** Which records the page shows: leads (with the clients won from them), partners or referrers. */
type Segment = 'lead' | 'partner' | 'referrer'
const SEGMENTS: readonly Segment[] = ['lead', 'partner', 'referrer']
const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'lead', label: 'Leads' },
  { value: 'partner', label: 'Partners' },
  { value: 'referrer', label: 'Referrers' },
]
const NOUN: Record<Segment, string> = { lead: 'leads', partner: 'partners', referrer: 'referrers' }
const TITLE: Record<Segment, string> = { lead: 'Leads by stage', partner: 'Partners by stage', referrer: 'Referrers by stage' }

/** A segment's records. Leads come with every client ever won, which has no time limit. */
function load(segment: Segment): Promise<Org[]> {
  if (segment !== 'lead') return api.orgs({ kind: segment })
  return Promise.all([api.orgs({ kind: 'lead' }), api.orgs({ kind: 'client', won: true })]).then(([leads, won]) => [...leads, ...won])
}

/** A saved record replaces its old copy; one that no longer belongs to the segment leaves. A client belongs to Leads
 * only for having been won, and the won clients stay newest-won first. */
function place(prev: Org[] | undefined, org: Org, segment: Segment): Org[] {
  const rest = (prev ?? []).filter((o) => o.id !== org.id)
  const belongs = org.kind === segment || (segment === 'lead' && org.kind === 'client' && !!org.won_at)
  const out = belongs ? [org, ...rest] : rest
  if (segment !== 'lead') return out
  const byWon = (a: Org, b: Org) => (a.won_at ?? '') < (b.won_at ?? '') ? 1 : (a.won_at ?? '') > (b.won_at ?? '') ? -1 : 0
  return [...out.filter((o) => o.kind !== 'client'), ...out.filter((o) => o.kind === 'client').sort(byWon)]
}

export function PipelinePage() {
  const { meta, me } = useSession()
  const phone = useIsPhone()
  const [segment, setSegment] = useState<Segment>(() => readChoice(SEGMENT_KEY, SEGMENTS, 'lead'))
  // The segment on screen now, for a save that finishes after the page has moved to another one.
  const onScreen = useRef(segment)
  const orgs = useApi(() => load(segment), [segment])
  const [notice, setNotice] = useState<string>()
  const [owner, setOwner] = useOwnerFilter()
  const [find, setFind] = useState('')
  const [view, setView] = useState<View>(() => readChoice(VIEW_KEY, VIEWS, 'list'))
  const [moveError, setMoveError] = useState<string>()
  const moving = useRef(new Set<number>())
  const drawer = useOrgDrawer()

  function chooseView(v: View) {
    setView(v)
    setMoveError(undefined)
    writeChoice(VIEW_KEY, v)
  }

  function chooseSegment(s: Segment) {
    if (s === segment) return
    onScreen.current = s
    setSegment(s)
    setNotice(undefined)
    setMoveError(undefined)
    writeChoice(SEGMENT_KEY, s)
  }

  // A failed move's message belongs to the board behind; opening a record moves on from it.
  useEffect(() => { if (drawer.slug) setMoveError(undefined) }, [drawer.slug])

  /** A card dropped on another stage: shown there at once, then saved with only the status. A failed save puts it
   * back; a stale one (409) takes the server's current copy. Dropped on Won, a lead is shown as the client it becomes. */
  async function moveTo(org: Org, status: string) {
    if (status === org.status || org.kind === 'client' || moving.current.has(org.id)) return
    moving.current.add(org.id)
    setNotice(undefined)
    setMoveError(undefined)
    const from = segment
    const won = from === 'lead' && status === 'won'
    const shown: Org = won
      ? { ...org, kind: 'client', status: meta.client_statuses[0] ?? 'active', won_at: new Date().toISOString() }
      : { ...org, status }
    orgs.setData((prev) => place(prev, shown, segment))
    try {
      const saved = await api.patchOrg(org.id, { updated_at: org.updated_at, status })
      // The page has moved to another segment: that list is loading its own records, and this one is not in it.
      if (onScreen.current === from) orgs.setData((prev) => place(prev, saved, from))
    } catch (e) {
      if (onScreen.current !== from) return
      setMoveError(saveErrorText(e))
      const current = e instanceof ApiError && e.status === 409 ? (e.current as Org | undefined) : undefined
      orgs.setData((prev) => (current ? place(prev, current, segment) : won ? undoWon(prev, org, shown) : undoMove(prev, org, status)))
    } finally {
      moving.current.delete(org.id)
    }
  }

  /** A record saved in the drawer goes to its stage. A lead that has just become a client moves to Won, or leaves with
   * a notice if it was not won; later saves of that client (or of one opened by its link) say nothing. */
  function changed(saved: Org) {
    setNotice(undefined)
    const was = orgs.data?.find((o) => o.id === saved.id)
    orgs.setData((prev) => place(prev, saved, segment))
    if (saved.kind === 'client' && was?.kind === 'lead') setNotice(`${saved.name} is now a client.`)
  }

  /** A new organisation goes under its stage and opens in the drawer, with the filters cleared enough to show its row. */
  function created(o: Org) {
    orgs.setData((prev) => place(prev, o, segment))
    setFind('')
    drawer.open(o.slug, byOwner([o], owner).length === 0 ? ['owner'] : [])
  }

  const addOrganisation = useNewOrg(created)

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  const shown = byOwner(orgs.data, owner).filter((o) => matchesText(o, find))
  // Leads: the lead statuses, Won left out (a won lead is a client), then Won at the end from the won clients. A status
  // not in the kind's list isn't shown.
  const groups: Stage[] =
    segment === 'lead'
      ? [
          ...stages(shown.filter((o) => o.kind === 'lead'), meta.lead_statuses.filter((s) => s !== 'won')),
          wonStage(shown.filter((o) => o.kind === 'client')),
        ]
      : stages(shown, statusesOf(meta, segment))
  const locked = segment === 'lead' ? 'won' : undefined
  const heads = [
    { name: 'Name' }, { name: 'Sector' }, { name: 'Next step' }, { name: 'Value', numeric: true }, { name: 'Owner' },
    { name: 'Last contact' },
  ]
  const columns = phone ? 1 : heads.length
  const filtering = owner !== '' || find.trim() !== ''

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Leads pipeline</h1>
      <div className="tn-custom-filterbar">
        <Dropdown className="tn-custom-filter" aria-label="Owner" value={owner} onChange={setOwner}
          options={ownerOptions(orgs.data, me.email, owner)} />
        <SegmentedControl aria-label="Kind" value={segment} onChange={chooseSegment} options={SEGMENT_OPTIONS} />
        <SegmentedControl aria-label="View" value={view} onChange={chooseView}
          options={[{ value: 'list', label: 'List' }, { value: 'columns', label: 'Board' }]} />
        <div className="tn-custom-filterbar-end">
          <Input type="search" className="tn-custom-find" aria-label="Filter organisations" placeholder="Filter organisations…"
            value={find} onChange={(e) => setFind(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={addOrganisation}>+ Add organisation</Button>
        </div>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {moveError && <Alert tone="error">{moveError}</Alert>}
      {groups.every((g) => g.orgs.length === 0) ? (
        <ColumnEmpty>{filtering ? 'Nothing matches these filters.' : `No ${NOUN[segment]} yet.`}</ColumnEmpty>
      ) : view === 'columns' ? (
        <PipelineColumns stages={groups} noun={NOUN[segment]} title={TITLE[segment]} locked={locked}
          onOpen={(o) => drawer.open(o.slug)} onMove={moveTo} />
      ) : (
        <div className="tn-table-wrap">
          <table className="tn-custom-table tn-custom-pipeline-table" aria-label={TITLE[segment]}>
            {!phone && (
              <thead>
                <tr>
                  {heads.map((h) => (
                    <th key={h.name} scope="col" data-numeric={h.numeric ? true : undefined}>{h.name}</th>
                  ))}
                </tr>
              </thead>
            )}
            {groups.map((g) => (
              <StageGroup key={g.status} stage={g} phone={phone} columns={columns} forceOpen={!!find.trim()}
                onOpen={(o) => drawer.open(o.slug)} />
            ))}
          </table>
        </div>
      )}
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={changed} onDeleted={() => orgs.reload()} />
    </div>
  )
}
