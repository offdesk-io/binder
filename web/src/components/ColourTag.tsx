import { Tag } from '@tiagopedras/tenon'
import type { CSSProperties, ReactNode } from 'react'
import { dueTone, type Colour } from '../lib/colour'
import { day } from '../lib/format'

/**
 * A Tag in a Binder colour. A chart colour is drawn on a raised chip (see `.tn-custom-chart` in styles.css),
 * so its text keeps AA contrast in light mode too. The label is always there beside the colour.
 */
export function ColourTag({ colour, children }: { colour: Colour; children: ReactNode }) {
  return (
    <Tag tone={colour.chart ? undefined : colour.tone} chart={colour.chart} dot className={colour.chart ? 'tn-custom-chart' : undefined}>
      {children}
    </Tag>
  )
}

/** A small dot in a colour, for a legend, a column head or a segment. It is decorative: the label next to it carries the meaning. */
export function ColourDot({ colour }: { colour: Colour }) {
  return <span className="tn-custom-dot" aria-hidden="true" style={{ '--tn-dot': colour.mark } as CSSProperties} />
}

/** A due date in a Tag: urgent when past due, soon when due within three days, neutral otherwise. */
export function DueDate({ due }: { due: string }) {
  return <Tag tone={dueTone(due)}>{day(due)}</Tag>
}
