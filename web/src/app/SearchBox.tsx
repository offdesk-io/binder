import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** The global search. `/` anywhere outside a field focuses it; typing opens
 * /search?q=… after a short pause; Escape leaves it. */
export function SearchBox() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const onSearch = pathname === '/search'
  const [text, setText] = useState(onSearch ? params.get('q') ?? '' : '')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!onSearch) setText('')
  }, [onSearch])

  useEffect(() => {
    const q = text.trim()
    if (!q || (onSearch && q === (params.get('q') ?? ''))) return
    const t = setTimeout(() => navigate(`/search?q=${encodeURIComponent(q)}`, { replace: onSearch }), 200)
    return () => clearTimeout(t)
  }, [text])

  return (
    <input
      ref={input}
      className="lg-search"
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
