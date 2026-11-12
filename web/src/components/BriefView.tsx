import { Alert, Button } from '@tiagopedras/tenon'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { BriefPerson, Contact, Research } from '../api/types'
import { day, person, safeHref, usd } from '../lib/format'
import type { Loaded } from '../lib/useApi'

/** The contact a suggested person already is: the same id, or the same name ignoring case. */
export function knownAs(p: BriefPerson, people: Contact[]): Contact | undefined {
  const name = p.name.trim().toLowerCase()
  return people.find((c) => c.id === p.contact_id) ?? people.find((c) => c.name.trim().toLowerCase() === name)
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="lg-brief-part">
      <h3 className="tenon-heading-4">{title}</h3>
      {children}
    </div>
  )
}

function Out({ url, children }: { url: string; children: ReactNode }) {
  const href = safeHref(url)
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>
}

interface Props {
  run: Research
  orgId: number
  /** The organisation's people: a suggestion links to them or can be added. */
  people: Loaded<Contact[]>
}

export function BriefView({ run, orgId, people }: Props) {
  const b = run.brief!
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string>()
  const known = people.data ?? []

  async function add(p: BriefPerson) {
    if (adding) return
    setAdding(true)
    setError(undefined)
    try {
      await api.createContact(orgId, { name: p.name, role: p.role || null })
      people.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="lg-brief">
      <p className="lg-entry-text">{b.overview}</p>
      {b.what_they_do && <Part title="What they do"><p className="lg-entry-text">{b.what_they_do}</p></Part>}
      {b.size_and_funding && <Part title="Size and funding"><p className="lg-entry-text">{b.size_and_funding}</p></Part>}
      {b.people.length > 0 && (
        <Part title="People">
          {error && <Alert tone="error">{error}</Alert>}
          <ul className="lg-brief-people">
            {b.people.map((p, i) => {
              const c = knownAs(p, known)
              return (
                <li key={i}>
                  <div>
                    {c ? <Link to={`/c/${c.id}`}>{p.name}</Link> : <span>{p.name}</span>}
                    {p.role && <span className="lg-faint"> · {p.role}</span>}
                    {!c && people.data && (
                      <Button size="sm" variant="secondary" disabled={adding} onClick={() => void add(p)} aria-label={`Add ${p.name}`}>
                        Add?
                      </Button>
                    )}
                  </div>
                  {p.why && <div className="lg-faint">{p.why}</div>}
                </li>
              )
            })}
          </ul>
        </Part>
      )}
      {b.recent_news.length > 0 && (
        <Part title="Recent news">
          <ul>
            {b.recent_news.map((n, i) => (
              <li key={i}><Out url={n.url}>{n.headline}</Out>{n.date && <span className="lg-faint"> · {n.date}</span>}</li>
            ))}
          </ul>
        </Part>
      )}
      {b.likely_needs.length > 0 && (
        <Part title="Likely needs"><ul>{b.likely_needs.map((t, i) => <li key={i}>{t}</li>)}</ul></Part>
      )}
      {b.offdesk_angle && <Part title="Offdesk angle"><p className="lg-entry-text">{b.offdesk_angle}</p></Part>}
      {b.open_questions.length > 0 && (
        <Part title="Open questions"><ul>{b.open_questions.map((t, i) => <li key={i}>{t}</li>)}</ul></Part>
      )}
      {run.sources.length > 0 && (
        <Part title="Sources">
          <ol>{run.sources.map((s, i) => <li key={i}><Out url={s.url}>{s.title || s.url}</Out></li>)}</ol>
        </Part>
      )}
      <p className="lg-faint">
        Researched {day(run.run_at)} by {person(run.author_email)}
        {run.model && ` · ${run.model}`}
        {run.cost_usd != null && ` · ${usd(run.cost_usd)}`}
      </p>
    </div>
  )
}
