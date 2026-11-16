import { Alert, Column, ColumnEmpty } from '@tiagopedras/tenon'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { SearchHit } from '../api/types'
import { Loading } from '../components/Loading'
import { StatusTag } from '../components/StatusTag'
import { useApi } from '../lib/useApi'

const GROUPS: { kind: SearchHit['kind']; title: string }[] = [
  { kind: 'org', title: 'Organisations' },
  { kind: 'contact', title: 'Contacts' },
  { kind: 'interaction', title: 'Interactions' },
  { kind: 'research', title: 'Research' },
]

export function hitLink(h: SearchHit): string {
  if (h.kind === 'contact') return `/c/${h.id}`
  if (h.kind === 'interaction') return `/o/${h.org_slug}#i-${h.id}`
  if (h.kind === 'research') return h.contact_id ? `/c/${h.contact_id}#research` : `/o/${h.org_slug}#research`
  return `/o/${h.org_slug}`
}

/** The API wraps each match in \u0002 and \u0003, which never occur in typed text. */
export function Snippet({ text }: { text: string }) {
  return (
    <span className="tn-custom-faint">
      {text.split(/(\u0002[^\u0003]*\u0003)/).map((part, i) =>
        part.startsWith('\u0002') && part.endsWith('\u0003') ? <mark key={i} className="tn-custom-mark">{part.slice(1, -1)}</mark> : part,
      )}
    </span>
  )
}

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const hits = useApi(() => (q ? api.search(q) : Promise.resolve([] as SearchHit[])), [q], { keep: true })

  if (!q) return <ColumnEmpty>Type in the search box to find organisations, people and notes.</ColumnEmpty>
  if (hits.error) return <Alert tone="error">{hits.error.message}</Alert>
  if (!hits.data) return <Loading />
  if (hits.data.length === 0) return <ColumnEmpty>No matches for “{q}”.</ColumnEmpty>

  return (
    <div className="tn-stack">
      <div className="tn-toolbar">
        <h1 className="tenon-heading-3">Search</h1>
      </div>
      {GROUPS.map((g) => {
        const list = hits.data!.filter((h) => h.kind === g.kind)
        if (list.length === 0) return null
        return (
          <Column key={g.kind} titleAs="h2" title={g.title}>
            <ul className="tn-custom-rows">
              {list.map((h) => (
                <li key={`${h.kind}${h.id}`}>
                  <div className="tn-cluster">
                    <Link to={hitLink(h)}>{h.title}</Link>
                    {h.kind !== 'org' && <span className="tn-custom-faint">· {h.org_name}</span>}
                    <StatusTag status={h.org_status} />
                  </div>
                  <div><Snippet text={h.snippet} /></div>
                </li>
              ))}
            </ul>
          </Column>
        )
      })}
    </div>
  )
}
