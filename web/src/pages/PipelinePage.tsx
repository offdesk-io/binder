import { Alert, Button, ColumnEmpty, Dropdown, Input } from '@tiagopedras/tenon'
import { useState } from 'react'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { OrgDrawer } from '../components/OrgDrawer'
import { OrgForm } from '../components/OrgForm'
import { byOwner, ownerOptions, useOwnerFilter } from '../lib/ownerFilter'
import { stages } from '../lib/pipeline'
import { useApi } from '../lib/useApi'
import { useIsPhone } from '../lib/useIsPhone'
import { useOrgDrawer } from '../lib/useOrgDrawer'
import { StageGroup } from './pipeline/StageGroup'

/** A saved lead replaces its old copy; one that is no longer a lead leaves. */
function place(prev: Org[] | undefined, org: Org): Org[] {
  const rest = (prev ?? []).filter((o) => o.id !== org.id)
  return org.kind === 'lead' ? [org, ...rest] : rest
}

export function PipelinePage() {
  const { meta, me } = useSession()
  const phone = useIsPhone()
  const orgs = useApi(() => api.orgs({ kind: 'lead' }), [])
  const [notice, setNotice] = useState<string>()
  const [owner, setOwner] = useOwnerFilter()
  const [find, setFind] = useState('')
  const drawer = useOrgDrawer()
  const [creating, setCreating] = useState(false)

  /** A record saved in the drawer goes to its stage. A lead that has just become a client leaves the Pipeline with a
   * notice; later saves of that client (or of one opened by its link) say nothing. */
  function changed(saved: Org) {
    setNotice(undefined)
    const was = orgs.data?.find((o) => o.id === saved.id)
    orgs.setData((prev) => place(prev, saved))
    if (saved.kind === 'client' && was?.kind === 'lead') setNotice(`${saved.name} is now a client.`)
  }

  /** A new organisation goes under its stage and opens in the drawer, with the filters cleared enough to show its row. */
  function created(o: Org) {
    setCreating(false)
    orgs.setData((prev) => place(prev, o))
    setFind('')
    drawer.open(o.slug, byOwner([o], owner).length === 0 ? ['owner'] : [])
  }

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  const needle = find.trim().toLowerCase()
  const shown = byOwner(orgs.data, owner).filter(
    (o) => !needle || [o.name, o.sector, o.next_step].some((v) => v?.toLowerCase().includes(needle)),
  )
  // A won lead is a client and leaves the Pipeline; a status not in meta.lead_statuses isn't shown.
  const groups = stages(shown, meta.lead_statuses.filter((s) => s !== 'won'))
  const columns = phone ? 1 : 6

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Pipeline</h1>
      <div className="tn-custom-filterbar">
        <Dropdown className="tn-custom-filter" aria-label="Owner" value={owner} onChange={setOwner}
          options={ownerOptions(orgs.data, me.email, owner)} />
        <div className="tn-custom-filterbar-end">
          <Input type="search" className="tn-custom-find" aria-label="Filter organisations" placeholder="Filter organisations…"
            value={find} onChange={(e) => setFind(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>+ Add organisation</Button>
        </div>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {groups.every((g) => g.orgs.length === 0) ? (
        <ColumnEmpty>{orgs.data.length === 0 ? 'No leads yet.' : 'Nothing matches these filters.'}</ColumnEmpty>
      ) : (
        <div className="tn-table-wrap">
          <table className="tn-custom-table tn-custom-pipeline-table" aria-label="Leads by stage">
            {!phone && (
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Sector</th>
                  <th scope="col">Next step</th>
                  <th scope="col" data-numeric>Value</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Last contact</th>
                </tr>
              </thead>
            )}
            {groups.map((g) => (
              <StageGroup key={g.status} stage={g} phone={phone} columns={columns} forceOpen={!!needle}
                onOpen={(o) => drawer.open(o.slug)} />
            ))}
          </table>
        </div>
      )}
      <OrgDrawer slug={drawer.slug} onClose={drawer.close} onChanged={changed} onDeleted={() => orgs.reload()} />
      <OrgForm open={creating} onClose={() => setCreating(false)} onSaved={created} />
    </div>
  )
}
