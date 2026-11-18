import { useCallback, useEffect, useRef } from 'react'
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
  // Set when a close has gone back, so a second close before the address changes does not go back again.
  const closing = useRef(false)
  useEffect(() => {
    closing.current = false
  }, [location.key])

  // `drop` names other params to remove in the same step, such as a filter that would hide the opened card: two
  // separate setParams calls in one event would each start from the same params, and the second would undo the first.
  const open = useCallback(
    (next: string, drop: string[] = []) => {
      const p = new URLSearchParams(params)
      for (const k of drop) p.delete(k)
      p.set('org', next)
      // Opening over an open drawer swaps the slug in the same entry, keeping that entry's own state.
      const replace = slug !== undefined
      setParams(p, { replace, state: replace ? location.state : { drawer: true } })
    },
    [location.state, params, setParams, slug],
  )

  const close = useCallback(() => {
    if ((location.state as { drawer?: boolean } | null)?.drawer) {
      if (closing.current) return
      closing.current = true
      navigate(-1)
      return
    }
    const p = new URLSearchParams(params)
    p.delete('org')
    setParams(p, { replace: true })
  }, [location.state, navigate, params, setParams])

  return { slug, open, close }
}
