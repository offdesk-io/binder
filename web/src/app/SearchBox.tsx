import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** The global search. `/` anywhere outside a field focuses it; typing opens
 * /search?q=… after a short pause; Escape leaves it. */
export function SearchBox() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const onSearch = pathname === '/search'
  const urlQ = onSearch ? params.get('q') ?? '' : ''
  const [text, setText] = useState(urlQ)
  const input = useRef<HTMLInputElement>(null)
  // The last query this box put in the URL or took from it, so the URL and the
  // text can tell their own changes from the other side's.
  const lastQ = useRef(urlQ)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || e.defaultPrevented) return
      if (e.target instanceof Element) {
        if (e.target.closest('input, textarea, select')) return
        if ((e.target as HTMLElement).isContentEditable) return
      }
      if (document.querySelector('.tenon-modal')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Back and forward change the URL under the box; follow it, but leave
  // alone text that is only waiting to be sent.
  useEffect(() => {
    if (urlQ === lastQ.current) return
    lastQ.current = urlQ
    setText(urlQ)
  }, [urlQ])

  // Any other page starts with an empty box, so unsent text cannot follow the
  // visitor there.
  useEffect(() => {
    if (onSearch) return
    lastQ.current = ''
    setText('')
  }, [pathname])

  useEffect(() => {
    const q = text.trim()
    if (q === lastQ.current || (!onSearch && !q)) return
    const t = setTimeout(() => {
      lastQ.current = q
      navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search', { replace: onSearch })
    }, 200)
    return () => clearTimeout(t)
  }, [text, pathname])

  return (
    <input
      ref={input}
      className="tenon-field__control tn-custom-search"
      type="search"
      aria-label="Search"
      placeholder="Search   /"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') input.current?.blur()
      }}
    />
  )
}
