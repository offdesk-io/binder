import { Card } from '@tiagopedras/tenon'
import { Fragment } from 'react'
import type { Org } from '../../api/types'
import { safeHref } from '../../lib/format'
import { useFrame } from './Section'

/** A referrer is a person: their details sit at the top of the page, where a company shows its overview. */
export function PersonCard({ org }: { org: Org }) {
  const frame = useFrame()
  const p = org.person
  const link = safeHref(p?.linkedin_url)
  const rows: [string, React.ReactNode][] = [
    ['Works at', org.description],
    ['Email', p?.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null],
    ['Phone', p?.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : null],
    ['LinkedIn', p?.linkedin_url ? (link ? <a href={link} target="_blank" rel="noreferrer">{p.linkedin_url}</a> : p.linkedin_url) : null],
  ]
  const shown = rows.filter(([, v]) => v)
  return (
    <Card
      id="person"
      title="Contact details"
      titleAs={frame === 'drawer' ? 'h3' : 'h2'}
      summary={
        shown.length === 0 ? (
          <span className="tn-custom-muted">No details yet.</span>
        ) : (
          <dl className="tn-custom-facts">
            {shown.map(([k, v]) => (
              <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
            ))}
          </dl>
        )
      }
    />
  )
}
