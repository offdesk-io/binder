import { ColumnEmpty } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import type { Org } from '../../api/types'
import { StatusTag } from '../../components/StatusTag'
import { Section } from './Section'

/** What a partner or referrer brought in, each linking to its page with its status. */
export function IntroducedSection({ org }: { org: Org }) {
  if (org.kind !== 'partner' && org.kind !== 'referrer') return null
  return (
    <Section id="introduced" title="Introduced" count={org.introduced.length}>
      {org.introduced.length === 0 ? (
        <ColumnEmpty>Nobody introduced yet.</ColumnEmpty>
      ) : (
        <ul className="tn-custom-rows">
          {org.introduced.map((i) => (
            <li key={i.id}>
              <div className="tn-cluster">
                <Link to={`/o/${i.slug}`}>{i.name}</Link>
                <StatusTag status={i.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
