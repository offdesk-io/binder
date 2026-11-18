import { describe, expect, test } from 'vitest'
import { SESSION } from '../test/render'
import {
  columnHead, dueTone, relationshipTone, REASON_TONE, STAGE, stageColour, taskTone, TYPE, typeColour,
} from './colour'

const { meta } = SESSION
const statuses = [...meta.lead_statuses, ...meta.client_statuses]

describe('stage colour', () => {
  test('every lead and client status has its own entry, and no entry is left over', () => {
    expect(Object.keys(STAGE).sort()).toEqual([...statuses].sort())
    for (const s of statuses) expect(stageColour(s)).toBe(STAGE[s])
  })

  test('the categorical stages each have a different chart colour', () => {
    const charts = statuses.map((s) => STAGE[s].chart).filter((c) => c !== undefined)
    expect(new Set(charts).size).toBe(charts.length)
  })

  test('won and active are success, lost is error, paused is warning, and parked and past are neutral', () => {
    expect(STAGE.won.tone).toBe('success')
    expect(STAGE.active.tone).toBe('success')
    expect(STAGE.lost.tone).toBe('error')
    expect(STAGE.paused.tone).toBe('warning')
    expect(STAGE.parked.tone).toBe('neutral')
    expect(STAGE.past.tone).toBe('neutral')
  })

  test('an unknown status is neutral rather than missing', () => {
    expect(stageColour('what')).toMatchObject({ tone: 'neutral' })
  })

  test('every mark is a Tenon token, never a hex value or a primitive', () => {
    for (const c of [...Object.values(STAGE), ...Object.values(TYPE)]) {
      expect(c.mark).toMatch(/^var\(--tenon-(chart|text)-[a-z0-9-]+\)$/)
      expect(c.mark).not.toMatch(/color-/)
    }
  })

  test('a pipeline column is success for won, error for lost, and quiet for parked', () => {
    expect(columnHead('won')).toEqual({ tone: 'success', muted: false })
    expect(columnHead('lost')).toEqual({ tone: 'error', muted: false })
    expect(columnHead('parked')).toEqual({ tone: 'default', muted: true })
    expect(columnHead('contacted')).toEqual({ tone: 'default', muted: false })
  })
})

describe('interaction type colour', () => {
  test('every interaction type has a colour, and the four are distinct', () => {
    for (const t of meta.interaction_types) expect(TYPE[t]).toBeDefined()
    const colours = meta.interaction_types.map((t) => typeColour(t).mark)
    expect(new Set(colours).size).toBe(colours.length)
  })
})

describe('relationship, due date and attention', () => {
  test('cold is cool, warm is amber and strong is green', () => {
    expect(relationshipTone('cold')).toBe('info')
    expect(relationshipTone('warm')).toBe('warning')
    expect(relationshipTone('strong')).toBe('success')
    for (const r of meta.relationships) expect(relationshipTone(r)).not.toBe('neutral')
  })

  test('a past-due date is urgent, one within three days is soon, and later or no date is neutral', () => {
    const now = new Date(2026, 10, 16, 9, 0)
    expect(dueTone('2026-11-15', now)).toBe('urgent')
    expect(dueTone('2026-11-16', now)).toBe('soon')
    expect(dueTone('2026-11-19', now)).toBe('soon')
    expect(dueTone('2026-11-20', now)).toBe('neutral')
    expect(dueTone(null, now)).toBe('neutral')
  })

  test('a missed next step is urgent, and going quiet or stuck is a warning', () => {
    expect(REASON_TONE).toEqual({ overdue: 'urgent', quiet: 'warning', stuck: 'warning' })
  })
})

describe('Bench task state', () => {
  test('Doing is running, Reviewing is accent, Done is success, Cancelled is muted', () => {
    expect(taskTone('Doing')).toBe('running')
    expect(taskTone('Reviewing')).toBe('accent')
    expect(taskTone('Done')).toBe('success')
    expect(taskTone('Cancelled')).toBe('neutral')
    expect(taskTone('Somewhere else')).toBe('neutral')
  })
})
