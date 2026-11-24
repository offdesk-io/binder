import { Dropdown } from '@tiagopedras/tenon'
import type { Org } from '../api/types'
import { useSession } from '../app/session'
import { label } from '../lib/format'
import { statusesOf } from '../lib/kinds'

/** A status dropdown for one organisation, offering its own kind's statuses. Picking Won on a lead makes it a client. */
export function StatusPicker({ org, aria, onChange, disabled }: { org: Org; aria: string; onChange: (status: string) => void; disabled?: boolean }) {
  const { meta } = useSession()
  const list = statusesOf(meta, org.kind)
  return (
    <Dropdown
      className="tn-custom-status"
      aria-label={aria}
      value={org.status}
      onChange={onChange}
      disabled={disabled}
      options={list.map((s) => ({ value: s, label: label(s) }))}
    />
  )
}
