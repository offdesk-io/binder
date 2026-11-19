import { Alert, Button, Drawer } from '@tiagopedras/tenon'
import { api } from '../api/endpoints'
import type { Org } from '../api/types'
import { OrgDetail } from '../pages/org/OrgDetail'
import { useApi } from '../lib/useApi'
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

/** One organisation in the drawer over Pipeline, List or Home. */
export function OrgDrawer({ slug, onClose, onChanged, onDeleted }: Props) {
  return slug ? <Loaded slug={slug} onClose={onClose} onChanged={onChanged} onDeleted={onDeleted} /> : null
}

function Loaded({ slug, onClose, onChanged, onDeleted }: Props & { slug: string }) {
  const org = useApi(() => api.orgBySlug(slug), [slug])
  const title = org.data?.name ?? slug
  // The list behind may re-render while the drawer is open and replace the element that opened it, so focus goes
  // back to whichever element now carries this slug. The card and row links put data-org-open={slug} on themselves.
  // When none does (the row sits in a folded Pipeline stage), focus goes to the heading button of the stage the
  // organisation is in now; failing that (a won lead has left the board), to the page's main region.
  const returnFocus = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-org-open]')).find((el) => el.dataset.orgOpen === slug) ??
    Array.from(document.querySelectorAll<HTMLElement>('[data-org-stage]')).find((el) => el.dataset.orgStage === org.data?.status) ??
    document.getElementById('main')
  return (
    <Drawer open title={title} onClose={onClose} returnFocus={returnFocus}>
      {org.error && !org.data ? (
        <div className="tn-stack">
          <Alert tone="error" title="Could not open this organisation">{org.error.message}</Alert>
          <Button size="sm" variant="secondary" onClick={org.reload}>Retry</Button>
        </div>
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
