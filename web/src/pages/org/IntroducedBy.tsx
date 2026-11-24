import { Alert, Button, Dropdown, type DropdownOption } from '@tiagopedras/tenon'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { Org, OrgPatch } from '../../api/types'
import { Loading } from '../../components/Loading'
import { saveErrorText } from '../../lib/forms'
import { useApi } from '../../lib/useApi'

type Introducer = Pick<Org, 'introduced_by_contact_id' | 'introduced_by_org_id'>

/** The picker's value for who introduced an organisation: `c:<id>` for a person, `o:<id>` for a partner, '' for nobody. */
export function introducerValue(org: Introducer): string {
  if (org.introduced_by_contact_id != null) return `c:${org.introduced_by_contact_id}`
  if (org.introduced_by_org_id != null) return `o:${org.introduced_by_org_id}`
  return ''
}

/** The two fields a picker value stands for. */
export function introducerFields(value: string): Introducer {
  return {
    introduced_by_contact_id: value.startsWith('c:') ? Number(value.slice(2)) : null,
    introduced_by_org_id: value.startsWith('o:') ? Number(value.slice(2)) : null,
  }
}

/** The picker over people and partners. It loads them only once Change is pressed. */
function Choice({ org, busy, onPick }: { org: Org; busy: boolean; onPick: (value: string) => void }) {
  const lists = useApi(() => Promise.all([api.people(), api.orgs({ kind: 'partner', sort: 'name' })]), [])
  if (lists.error) return <Alert tone="error">{lists.error.message}</Alert>
  if (!lists.data) return <Loading />
  const [people, partners] = lists.data
  const options: DropdownOption[] = [
    { value: '', label: 'Nobody' },
    ...people.map((p) => ({ value: `c:${p.id}`, label: p.name, group: 'People' })),
    ...partners.filter((p) => p.id !== org.id).map((p) => ({ value: `o:${p.id}`, label: p.name, group: 'Partners' })),
  ]
  return <Dropdown aria-label="Introduced by" value={introducerValue(org)} onChange={onPick} disabled={busy} options={options} />
}

/** Who brought the organisation in, as a link, and a picker to change it. A pick saves at once. */
export function IntroducedBy({ org, setOrg }: { org: Org; setOrg: (o: Org) => void }) {
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const by = org.introduced_by

  async function pick(value: string) {
    if (busy) return
    if (value === introducerValue(org)) {
      setChoosing(false)
      return
    }
    const next = introducerFields(value)
    // Only the fields that change are sent.
    const body: OrgPatch = { updated_at: org.updated_at }
    if (next.introduced_by_contact_id !== org.introduced_by_contact_id) body.introduced_by_contact_id = next.introduced_by_contact_id
    if (next.introduced_by_org_id !== org.introduced_by_org_id) body.introduced_by_org_id = next.introduced_by_org_id
    setBusy(true)
    setError(undefined)
    try {
      setOrg(await api.patchOrg(org.id, body))
      setChoosing(false)
    } catch (e) {
      setError(saveErrorText(e))
      if (e instanceof ApiError && e.status === 409 && e.current) setOrg(e.current as Org)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tn-stack">
      <div className="tn-cluster">
        <span className="tenon-caption tn-custom-faint">Introduced by</span>
        {by ? (
          <Link to={by.type === 'contact' ? `/c/${by.id}` : `/o/${by.slug ?? ''}`}>{by.name}</Link>
        ) : (
          <span className="tn-custom-faint">Nobody yet</span>
        )}
        {!choosing && <Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>Change</Button>}
      </div>
      {choosing && <Choice org={org} busy={busy} onPick={(v) => void pick(v)} />}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  )
}
