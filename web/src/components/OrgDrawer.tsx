import { Alert } from '@tiagopedras/tenon'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { OrgDetail } from '../pages/org/OrgDetail'
import { useApi } from '../lib/useApi'
import { Drawer } from './Drawer'
import { Loading } from './Loading'

interface Props {
  /** The organisation to show; undefined keeps the drawer shut. */
  slug: string | undefined
  onClose: () => void
  /** The record changed in the drawer: the list behind it should take the new copy. */
  onChanged?: (org: Org) => void
  /** The record was deleted from the drawer. */
  onDeleted?: (slug: string) => void
}

const quote = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'))

/** One organisation in the drawer over Pipeline, List or Home. */
export function OrgDrawer({ slug, onClose, onChanged, onDeleted }: Props) {
  return slug ? <Loaded slug={slug} onClose={onClose} onChanged={onChanged} onDeleted={onDeleted} /> : null
}

function Loaded({ slug, onClose, onChanged, onDeleted }: Props & { slug: string }) {
  const org = useApi(() => api.orgBySlug(slug), [slug])
  const title = org.data?.name ?? 'Organisation'
  // The list behind may re-render while the drawer is open and replace the element that opened it, so focus goes
  // back to whichever element now carries this slug. The card and row links put data-org-open={slug} on themselves.
  const returnFocus = () => document.querySelector<HTMLElement>(`[data-org-open="${quote(slug)}"]`)
  return (
    <Drawer open title={title} onClose={onClose} returnFocus={returnFocus}>
      {org.error && !org.data ? (
        <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
      ) : !org.data ? (
        <Loading />
      ) : (
        <OrgDetail
          key={org.data.id}
          frame="drawer"
          org={org.data}
          setOrg={org.setData}
          reloadOrg={org.reload}
          refreshError={org.error?.message}
          onChanged={onChanged}
          onDeleted={() => {
            onDeleted?.(slug)
            onClose()
          }}
        />
      )}
    </Drawer>
  )
}
