import type { ReactNode } from 'react'
import { typeColour } from '../lib/colour'
import { useSession } from '../app/session'
import { day, label } from '../lib/format'
import { ownerName } from '../lib/owners'
import { ColourTag, DueDate } from './ColourTag'

interface Props {
  type: string
  at: string
  by: string
  summary: string
  next_step: string | null
  next_step_due: string | null
  people: string[]
  action?: ReactNode
}

/** One logged interaction, as the timeline and the contact page show it. The type has its own colour. */
export function InteractionEntry({ type, at, by, summary, next_step, next_step_due, people, action }: Props) {
  const { owners } = useSession().meta
  return (
    <article className="tn-custom-entry">
      <div className="tn-cluster">
        <ColourTag colour={typeColour(type)}>{label(type)}</ColourTag>
        <span className="tenon-caption tn-custom-entry-meta">
          {day(at)} · {ownerName(owners, by)}
          {people.length > 0 && ` · with ${people.join(', ')}`}
        </span>
        {action}
      </div>
      <p className="tenon-body tn-custom-body">{summary}</p>
      {next_step && (
        <p className="tenon-body tn-custom-muted">
          Next: {next_step}
          {next_step_due && <> · <DueDate due={next_step_due} /></>}
        </p>
      )}
    </article>
  )
}
