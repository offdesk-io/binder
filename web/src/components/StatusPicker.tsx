import { Dropdown } from '@tiagopedras/tenon'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'

/** A status dropdown for one organisation. A lead offers lead statuses
 * (picking Won makes it a client), a client offers client statuses. */
export function StatusPicker({ org, aria, onChange, disabled }: { org: Org; aria: string; onChange: (status: string) => void; disabled?: boolean }) {
  const { meta } = useSession()
  const list = org.kind === 'lead' ? meta.lead_statuses : meta.client_statuses
  return (
    <Dropdown
      aria-label={aria}
      value={org.status}
      onChange={onChange}
      disabled={disabled}
      options={list.map((s) => ({ value: s, label: label(s) }))}
    />
  )
}
