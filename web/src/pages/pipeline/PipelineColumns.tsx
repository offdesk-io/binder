import { Column, ColumnEmpty } from '@tiagopedras/tenon'
import type { Org } from '../../api/types'
import { OrgCard } from '../../components/OrgCard'
import { label, moneyShort } from '../../lib/format'
import { FOLDED_BY_DEFAULT, type Stage } from '../../lib/pipeline'
import { useColumnDrag } from '../../lib/useColumnDrag'

interface Props {
  stages: Stage[]
  /** What the cards are, plural and lower case: "leads", "partners". */
  noun: string
  /** The board's accessible name. */
  title: string
  /** The stage whose cards open but are never dragged out (Won). Dropping on it still works. */
  locked?: string
  onOpen: (org: Org) => void
  /** A card was dropped on another stage's column. */
  onMove: (org: Org, status: string) => void
}

/** The Pipeline as one Tenon Column per stage, each holding its organisations as cards. Dragging a card to another
 * column changes its status; keyboard users change it from the drawer. */
export function PipelineColumns({ stages, noun, title, locked, onOpen, onMove }: Props) {
  const drag = useColumnDrag<number, string>({
    onMove: (id, from, to) => {
      if (from === locked) return
      const org = stages.flatMap((s) => s.orgs).find((o) => o.id === id)
      if (org) onMove(org, to)
    },
  })
  return (
    <div className="tn-custom-pipeline-columns" aria-label={title}>
      {stages.map((s) => {
        const col = drag.column(s.status)
        return (
          <Column
            key={s.status}
            className="tn-custom-pipeline-column"
            title={label(s.status)}
            titleAs="h2"
            count={s.total > 0 ? `${s.orgs.length} · ${moneyShort(s.total)}` : s.orgs.length}
            muted={FOLDED_BY_DEFAULT.has(s.status)}
            dropState={col.dropState}
            bodyProps={col.bodyProps}
            data-stage={s.status}
          >
            {s.orgs.length === 0 ? <ColumnEmpty>{s.status === locked ? 'No clients won yet' : `No ${noun}`}</ColumnEmpty> : s.orgs.map((o) => (
              <OrgCard key={o.id} org={o} onOpen={onOpen} showStatus={false} openOnCard
                {...(s.status === locked ? {} : drag.card(o.id, s.status))} />
            ))}
          </Column>
        )
      })}
    </div>
  )
}
