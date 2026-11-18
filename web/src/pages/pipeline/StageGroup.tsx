import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Org } from '../../api/types'
import { ColourDot, DueDate } from '../../components/ColourTag'
import { SectorLabel } from '../../components/SectorLabel'
import { stageColour } from '../../lib/colour'
import { ago, label, money, moneyShort, person } from '../../lib/format'
import { openInPlace } from '../../lib/openInPlace'
import { FOLDED_BY_DEFAULT, type Stage } from '../../lib/pipeline'

const key = (status: string) => `binder.pipeline.fold.${status}`

function readOpen(status: string): boolean {
  try {
    const kept = localStorage.getItem(key(status))
    if (kept === 'open') return true
    if (kept === 'closed') return false
  } catch {
    // Storage can be off (a private window); the default applies.
  }
  return !FOLDED_BY_DEFAULT.has(status)
}

function writeOpen(status: string, open: boolean) {
  try {
    localStorage.setItem(key(status), open ? 'open' : 'closed')
  } catch {
    // The stage still folds, it just isn't remembered.
  }
}

interface StageGroupProps {
  stage: Stage
  /** The phone layout: each organisation one cell on two lines, under a table with no column heads. */
  phone: boolean
  /** How many columns the table has, for the heading row to span. */
  columns: number
  /** Show the rows whatever the fold says, as while the filter box has text; the stored choice is left alone. */
  forceOpen?: boolean
  onOpen: (org: Org) => void
}

/**
 * One stage of the Pipeline as a table row group: a heading row that folds the stage (kept per device; Lost and
 * Parked start folded), then a row per organisation when it is open.
 */
export function StageGroup({ stage, phone, columns, forceOpen = false, onOpen }: StageGroupProps) {
  const { status, orgs, total } = stage
  const [kept, setKept] = useState(() => readOpen(status))
  const open = forceOpen || kept
  const toggle = () => {
    setKept(!kept)
    writeOpen(status, !kept)
  }
  const count = orgs.length
  const name = (o: Org) => (
    <Link to={`/o/${o.slug}`} data-org-open={o.slug} onClick={(e) => openInPlace(e, () => onOpen(o))}>{o.name}</Link>
  )
  return (
    <tbody>
      <tr className="tn-custom-stage-head">
        <th colSpan={columns} scope="rowgroup">
          <button type="button" className="tn-custom-stage-toggle" aria-expanded={open} disabled={forceOpen}
            onClick={toggle}>
            <span className="tn-custom-stage-chevron" aria-hidden="true" />
            <ColourDot colour={stageColour(status)} />
            <span className="tn-custom-stage-name">{label(status)}</span>
            <span className="tn-custom-stage-figures" aria-hidden="true">
              {count}{total > 0 && <> · {moneyShort(total)}</>}
            </span>
            <span className="tn-custom-sr-only">
              , {count === 1 ? '1 organisation' : `${count} organisations`}{total > 0 && `, ${moneyShort(total)}`}
            </span>
          </button>
        </th>
      </tr>
      {open && orgs.map((o) =>
        phone ? (
          <tr key={o.id}>
            <td className="tn-custom-stage-item">
              <div className="tn-custom-stage-line">{name(o)} <SectorLabel sector={o.sector} /></div>
              <div className="tn-custom-stage-line tn-custom-stage-sub">
                {[
                  o.next_step && <span key="step">{o.next_step}</span>,
                  // In a plain span, so the separator dot sits outside the Tag's chip.
                  o.next_step_due && <span key="due"><DueDate due={o.next_step_due} /></span>,
                  o.value_estimate != null && <span key="value">{money(o.value_estimate)}</span>,
                  <span key="owner">{person(o.owner_email)}</span>,
                ]}
              </div>
            </td>
          </tr>
        ) : (
          <tr key={o.id}>
            <td>{name(o)}</td>
            <td><SectorLabel sector={o.sector} /></td>
            <td className="tn-custom-stage-step">
              {o.next_step}
              {o.next_step && o.next_step_due && ' '}
              {o.next_step_due && <DueDate due={o.next_step_due} />}
            </td>
            <td data-numeric className="tn-numeric">{money(o.value_estimate)}</td>
            <td>{person(o.owner_email)}</td>
            <td>{ago(o.last_contact)}</td>
          </tr>
        ),
      )}
    </tbody>
  )
}
