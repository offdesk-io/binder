import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * The organisation open in the drawer, kept in the address as ?org=<slug> so a reload keeps it and the link can be
 * shared. Opening pushes a history entry, so Back closes it. Closing a drawer this page opened goes back; closing
 * one that came in with the link drops the param in place.
 */
export function useOrgDrawer() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const slug = params.get('org') ?? undefined

  const open = useCallback(
    (next: string) => {
      const p = new URLSearchParams(params)
      p.set('org', next)
      setParams(p, { state: { drawer: true } })
    },
    [params, setParams],
  )

  const close = useCallback(() => {
    if ((location.state as { drawer?: boolean } | null)?.drawer) {
      navigate(-1)
      return
    }
    const p = new URLSearchParams(params)
    p.delete('org')
    setParams(p, { replace: true })
  }, [location.state, navigate, params, setParams])

  return { slug, open, close }
}
