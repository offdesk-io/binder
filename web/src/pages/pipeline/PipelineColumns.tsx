import { Column, ColumnEmpty } from '@tiagopedras/tenon'
import type { Org } from '../../api/types'
import { OrgCard } from '../../components/OrgCard'
import { label, moneyShort } from '../../lib/format'
import type { Stage } from '../../lib/pipeline'
import { useColumnDrag } from '../../lib/useColumnDrag'

interface Props {
  stages: Stage[]
  onOpen: (org: Org) => void
  /** A card was dropped on another stage's column. */
  onMove: (org: Org, status: string) => void
}

/** The Pipeline as one Tenon Column per stage, each holding its organisations as cards. Dragging a card to another
 * column changes its status; keyboard users change it from the drawer. */
export function PipelineColumns({ stages, onOpen, onMove }: Props) {
  const drag = useColumnDrag<number, string>({
    onMove: (id, _from, to) => {
      const org = stages.flatMap((s) => s.orgs).find((o) => o.id === id)
      if (org) onMove(org, to)
    },
  })
  return (
    <div className="tn-custom-pipeline-columns" aria-label="Leads by stage">
      {stages.map((s) => {
        const col = drag.column(s.status)
        return (
          <Column
            key={s.status}
            className="tn-custom-pipeline-column"
            title={label(s.status)}
            titleAs="h2"
            count={s.total > 0 ? `${s.orgs.length} · ${moneyShort(s.total)}` : s.orgs.length}
            muted={s.status === 'lost' || s.status === 'parked'}
            dropState={col.dropState}
            bodyProps={col.bodyProps}
            data-stage={s.status}
          >
            {s.orgs.length === 0 ? <ColumnEmpty>No leads</ColumnEmpty> : s.orgs.map((o) => (
              <OrgCard key={o.id} org={o} onOpen={onOpen} showStatus={false} openOnCard {...drag.card(o.id, s.status)} />
            ))}
          </Column>
        )
      })}
    </div>
  )
}
