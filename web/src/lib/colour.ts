import type { TagChart, TagTone } from '@tiagopedras/tenon'
import { todayIso } from './format'

/**
 * What colour means in Binder, in one place. Every colour is a Tenon prop or a Tenon semantic token:
 * a `tone` (status colour), a `chart` (one categorical colour per stage or type), or the token that paints
 * a mark such as a dot or a card's stripe. The text label always stays beside the colour.
 */
export interface Colour {
  tone?: TagTone
  chart?: TagChart
  /** A Tenon token for a mark that is only a colour: a dot, a stripe, a status rule. */
  mark: string
}

const chart = (n: TagChart): Colour => ({ chart: n, mark: `var(--tenon-chart-${n})` })
const tone = (t: TagTone, mark: string): Colour => ({ tone: t, mark })
const NEUTRAL = tone('neutral', 'var(--tenon-text-faint)')

/**
 * The pipeline stages and client statuses. The early and progressing stages are cool to warm categorical
 * colours; won and active are success, lost is error, paused is warning, and parked and past stay neutral.
 */
export const STAGE: Record<string, Colour> = {
  lead: chart(10),
  contacted: chart(1),
  in_conversation: chart(5),
  proposal_sent: chart(7),
  won: tone('success', 'var(--tenon-text-success)'),
  active: tone('success', 'var(--tenon-text-success)'),
  lost: tone('error', 'var(--tenon-text-error)'),
  paused: tone('warning', 'var(--tenon-text-warning)'),
  parked: NEUTRAL,
  past: NEUTRAL,
}

/** A stage's colour. A status the map does not know is neutral, as it is on the board. */
export function stageColour(status: string): Colour {
  return STAGE[status] ?? NEUTRAL
}

/** The interaction types, one categorical colour each. A note stays neutral: it is the plain record. */
export const TYPE: Record<string, Colour> = {
  call: chart(6),
  email: chart(3),
  meeting: chart(8),
  note: NEUTRAL,
}

export function typeColour(type: string): Colour {
  return TYPE[type] ?? NEUTRAL
}

/** A contact's relationship: cold is cool, warm is amber, strong is green. */
export const RELATIONSHIP: Record<string, TagTone> = {
  cold: 'info',
  warm: 'warning',
  strong: 'success',
}

export function relationshipTone(relationship: string): TagTone {
  return RELATIONSHIP[relationship] ?? 'neutral'
}

/** A next step's date: past due is urgent, due within three days is soon, anything later is on track. */
export function dueTone(due: string | null | undefined, now: Date = new Date()): TagTone {
  if (!due) return 'neutral'
  if (due < todayIso(now)) return 'urgent'
  if (due <= todayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3))) return 'soon'
  return 'neutral'
}

/** The attention reasons on Home. A missed next step is urgent; going quiet or stuck, or a connector gone quiet, is a
 * warning. */
export const REASON_TONE: Record<string, TagTone> = {
  overdue: 'urgent',
  quiet: 'warning',
  stuck: 'warning',
  quiet_connector: 'warning',
}

/** A Bench column as a Tag: Doing is running, Reviewing is accent, Done is success, and Cancelled is muted. */
export const TASK_TONE: Record<string, TagTone> = {
  Doing: 'running',
  Reviewing: 'accent',
  'To do': 'info',
  Backlog: 'neutral',
  Done: 'success',
  Cancelled: 'neutral',
}

export function taskTone(state: string): TagTone {
  return TASK_TONE[state] ?? 'neutral'
}

/**
 * A sector's colour, for the label at the top of a card. The sector is free text, so
 * its name is hashed to one of Tenon's ten chart colours: the same name always lands on the same colour. Drawn as
 * text on a raised card, where each chart colour reaches AA in both themes (see .tn-custom-chart in styles.css).
 */
export function sectorColour(sector: string): Colour {
  const name = sector.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return chart(((h % 10) + 1) as TagChart)
}
