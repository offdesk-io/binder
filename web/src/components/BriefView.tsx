import { Alert, Button, Tag } from '@tiagopedras/tenon'
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

/** A small heading over a part of the brief. In a grid, `className` places it. */
function Part({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={className ? `tn-custom-part ${className}` : 'tn-custom-part'}>
      <h3 className="tenon-label tn-custom-muted">{title}</h3>
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
  const facts: [string, string][] = [
    ['What they do', b.what_they_do],
    ['Size and funding', b.size_and_funding],
    ['Offdesk angle', b.offdesk_angle],
  ].filter((f): f is [string, string] => !!f[1])

  async function add(p: BriefPerson) {
    if (adding) return
    setAdding(true)
    setError(undefined)
    try {
      const created = await api.createContact(orgId, { name: p.name, role: p.role || null })
      // Put the new person in the list now, so the suggestion stops offering to add them while the list reloads.
      people.setData((prev) => [...(prev ?? []), created])
      people.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="tn-stack">
      <p className="tenon-body tn-custom-body">{b.overview}</p>
      {facts.length > 0 && (
        <dl className="tn-custom-facts">
          {facts.map(([k, v]) => (
            <div key={k} className="tn-custom-fact">
              <dt>{k}</dt>
              <dd className="tenon-body">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {b.people.length > 0 && (
        <Part title="People">
          {error && <Alert tone="error">{error}</Alert>}
          <ul className="tn-custom-people-list">
            {b.people.map((p, i) => {
              const c = knownAs(p, known)
              return (
                <li key={i}>
                  <div className="tn-cluster">
                    {c ? <Link to={`/c/${c.id}`}>{p.name}</Link> : <span>{p.name}</span>}
                    {p.role && <span className="tn-custom-faint">· {p.role}</span>}
                    {c && <Tag>In Binder</Tag>}
                    {!c && people.data && (
                      <Button size="sm" variant="secondary" disabled={adding} onClick={() => void add(p)} aria-label={`Add ${p.name}`}>
                        Add?
                      </Button>
                    )}
                  </div>
                  {p.why && <div className="tenon-caption tn-custom-faint">{p.why}</div>}
                </li>
              )
            })}
          </ul>
        </Part>
      )}
      {(b.recent_news.length > 0 || b.likely_needs.length > 0 || b.open_questions.length > 0) && (
        <div className="tn-grid">
          {b.recent_news.length > 0 && (
            <Part className="tn-col-4" title="Recent news">
              <ul className="tn-custom-tight">
                {b.recent_news.map((n, i) => (
                  <li key={i}><Out url={n.url}>{n.headline}</Out>{n.date && <span className="tn-custom-faint"> · {n.date}</span>}</li>
                ))}
              </ul>
            </Part>
          )}
          {b.likely_needs.length > 0 && (
            <Part className="tn-col-4" title="Likely needs">
              <ul className="tn-custom-tight">{b.likely_needs.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </Part>
          )}
          {b.open_questions.length > 0 && (
            <Part className="tn-col-4" title="Open questions">
              <ul className="tn-custom-tight">{b.open_questions.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </Part>
          )}
        </div>
      )}
      {run.sources.length > 0 && (
        <Part title="Sources">
          <ol className="tn-custom-tight tenon-caption">
            {run.sources.map((s, i) => <li key={i}><Out url={s.url}>{s.title || s.url}</Out></li>)}
          </ol>
        </Part>
      )}
      <p className="tenon-caption tn-custom-faint">
        Researched {day(run.run_at)} by {person(run.author_email)}
        {run.model && ` · ${run.model}`}
        {run.cost_usd != null && ` · ${usd(run.cost_usd)}`}
      </p>
    </div>
  )
}
