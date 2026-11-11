import { Tag } from '@tiagopedras/tenon'
import type { ReactNode } from 'react'
import { day, isOverdue, label, person } from '../lib/format'

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

/** One logged interaction, as the timeline and the contact page show it. */
export function InteractionEntry({ type, at, by, summary, next_step, next_step_due, people, action }: Props) {
  return (
    <article className="lg-entry">
      <div className="lg-entry-head">
        <Tag>{label(type)}</Tag>
        <span className="lg-faint">
          {day(at)} · {person(by)}
          {people.length > 0 && ` · with ${people.join(', ')}`}
        </span>
        {action}
      </div>
      <p className="lg-entry-text">{summary}</p>
      {next_step && (
        <p className={isOverdue(next_step_due) ? 'lg-overdue' : 'lg-faint'}>
          Next: {next_step}
          {next_step_due && ` · ${day(next_step_due)}`}
        </p>
      )}
    </article>
  )
}
