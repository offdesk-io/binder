import { Alert, Button, ColumnEmpty, Dropdown, Input } from '@tiagopedras/tenon'
import { useState } from 'react'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { useNewOrg } from '../app/newOrg'
import { useSession } from '../app/session'
import { Loading } from '../components/Loading'
import { OrgDrawer } from '../components/OrgDrawer'
import { matchesText } from '../lib/matchesText'
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
    orgs.setData((prev) => place(prev, o))
    setFind('')
    drawer.open(o.slug, byOwner([o], owner).length === 0 ? ['owner'] : [])
  }

  const addOrganisation = useNewOrg(created)

  if (orgs.error) return <Alert tone="error">{orgs.error.message}</Alert>
  if (!orgs.data) return <Loading />
  const shown = byOwner(orgs.data, owner).filter((o) => matchesText(o, find))
  // A won lead is a client and leaves the Pipeline; a status not in meta.lead_statuses isn't shown.
  const groups = stages(shown, meta.lead_statuses.filter((s) => s !== 'won'))
  const heads = [
    { name: 'Name' }, { name: 'Sector' }, { name: 'Next step' }, { name: 'Value', numeric: true }, { name: 'Owner' },
    { name: 'Last contact' },
  ]
  const columns = phone ? 1 : heads.length
  const filtering = owner !== '' || find.trim() !== ''

  return (
    <div className="tn-stack">
      <h1 className="tn-custom-sr-only">Pipeline</h1>
      <div className="tn-custom-filterbar">
        <Dropdown className="tn-custom-filter" aria-label="Owner" value={owner} onChange={setOwner}
          options={ownerOptions(orgs.data, me.email, owner)} />
        <div className="tn-custom-filterbar-end">
          <Input type="search" className="tn-custom-find" aria-label="Filter organisations" placeholder="Filter organisations…"
            value={find} onChange={(e) => setFind(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={addOrganisation}>+ Add organisation</Button>
        </div>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {groups.every((g) => g.orgs.length === 0) ? (
        <ColumnEmpty>{filtering ? 'Nothing matches these filters.' : 'No leads yet.'}</ColumnEmpty>
      ) : (
        <div className="tn-table-wrap">
          <table className="tn-custom-table tn-custom-pipeline-table" aria-label="Leads by stage">
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
