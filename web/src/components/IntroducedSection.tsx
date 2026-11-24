import { Alert, ColumnEmpty } from '@tiagopedras/tenon'
import { Link } from 'react-router-dom'
import type { Introduced } from '../api/types'
import { money } from '../lib/format'
import { useApi } from '../lib/useApi'
import { Section } from '../pages/org/Section'
import { Loading } from './Loading'
import { StatusTag } from './StatusTag'

interface Props {
  /** Loads what this person or partner brought in. */
  load: () => Promise<Introduced>
  /** Names whose list this is, such as `contact:5`: a new subject loads again. */
  subject: string
}

/** The organisations a person or a partner brought in, and what the clients among them are worth. */
export function IntroducedSection({ load, subject }: Props) {
  const introduced = useApi(load, [subject])
  const data = introduced.data
  return (
    <Section id="introduced" title="Introduced" count={data?.orgs.length}>
      {introduced.error ? (
        <Alert tone="error">{introduced.error.message}</Alert>
      ) : !data ? (
        <Loading />
      ) : data.orgs.length === 0 ? (
        <ColumnEmpty>Nobody brought in yet.</ColumnEmpty>
      ) : (
        <>
          <ul className="tn-custom-rows">
            {data.orgs.map((o) => (
              <li key={o.id} className="tn-cluster">
                <Link to={`/o/${o.slug}`}>{o.name}</Link>
                <StatusTag status={o.status} />
                {o.value_estimate != null && <span className="tn-custom-faint">{money(o.value_estimate)}</span>}
              </li>
            ))}
          </ul>
          {data.client_value > 0 && <p className="tenon-caption">Clients worth {money(data.client_value)}</p>}
        </>
      )}
    </Section>
  )
}
