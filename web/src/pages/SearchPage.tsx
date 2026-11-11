import { Alert } from '@tiagopedras/tenon'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { SearchHit } from '../api/types'
import { Loading } from '../components/Loading'
import { useApi } from '../lib/useApi'

const GROUPS: { kind: SearchHit['kind']; title: string }[] = [
  { kind: 'org', title: 'Organisations' },
  { kind: 'contact', title: 'Contacts' },
  { kind: 'interaction', title: 'Interactions' },
]

export function hitLink(h: SearchHit): string {
  if (h.kind === 'contact') return `/c/${h.id}`
  if (h.kind === 'interaction') return `/o/${h.org_slug}#i-${h.id}`
  return `/o/${h.org_slug}`
}

/** The API wraps each match in \u0002 and \u0003, which never occur in typed text. */
export function Snippet({ text }: { text: string }) {
  return (
    <span className="lg-faint">
      {text.split(/(\u0002[^\u0003]*\u0003)/).map((part, i) =>
        part.startsWith('\u0002') && part.endsWith('\u0003') ? <mark key={i}>{part.slice(1, -1)}</mark> : part,
      )}
    </span>
  )
}

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const hits = useApi(() => (q ? api.search(q) : Promise.resolve([] as SearchHit[])), [q], { keep: true })

  if (!q) return <p className="lg-faint">Type in the search box to find organisations, people and notes.</p>
  if (hits.error) return <Alert tone="error">{hits.error.message}</Alert>
  if (!hits.data) return <Loading />
  if (hits.data.length === 0) return <p className="lg-faint">No matches for “{q}”.</p>

  return (
    <div className="lg-page">
      {GROUPS.map((g) => {
        const list = hits.data!.filter((h) => h.kind === g.kind)
        if (list.length === 0) return null
        return (
          <section key={g.kind} className="lg-section">
            <h2 className="tenon-heading-3">{g.title}</h2>
            <ul className="lg-hits">
              {list.map((h) => (
                <li key={`${h.kind}${h.id}`}>
                  <Link to={hitLink(h)}>{h.title}</Link>
                  {h.kind !== 'org' && <span className="lg-faint"> · {h.org_name}</span>}
                  <div><Snippet text={h.snippet} /></div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
