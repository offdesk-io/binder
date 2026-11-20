import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { FOLDED_BY_DEFAULT, stages, undoMove } from './pipeline'

test('stages follow the given order, and an empty stage still appears', () => {
  const out = stages([org({ id: 1, status: 'contacted' }), org({ id: 2, status: 'lead' })], ['lead', 'contacted', 'lost'])
  expect(out.map((s) => s.status)).toEqual(['lead', 'contacted', 'lost'])
  expect(out[2]).toEqual({ status: 'lost', orgs: [], total: 0 })
})

test('a status not in the list is left out', () => {
  const out = stages([org({ id: 1, status: 'won' })], ['lead'])
  expect(out).toEqual([{ status: 'lead', orgs: [], total: 0 }])
})

test('within a stage: by due date, earliest first, then undated by name ignoring case', () => {
  const late = org({ id: 1, name: 'Zed', next_step_due: '2026-11-20' })
  const early = org({ id: 2, name: 'Yak', next_step_due: '2026-11-01' })
  const bolt = org({ id: 3, name: 'bolt', next_step_due: null })
  const acme = org({ id: 4, name: 'Acme', next_step_due: null })
  const [lead] = stages([bolt, late, acme, early], ['lead'])
  expect(lead.orgs.map((o) => o.name)).toEqual(['Yak', 'Zed', 'Acme', 'bolt'])
})

test('a stage totals its values, counting none as nothing', () => {
  const [lead] = stages(
    [org({ id: 1, value_estimate: 12000 }), org({ id: 2, value_estimate: 500 }), org({ id: 3, value_estimate: null })],
    ['lead'],
  )
  expect(lead.total).toBe(12500)
})

test('lost and parked start folded', () => {
  expect([...FOLDED_BY_DEFAULT].sort()).toEqual(['lost', 'parked'])
})

test('undoMove puts only the status back and keeps a newer copy of the rest', () => {
  const was = org({ id: 1, status: 'lead', next_step: null })
  const newer = org({ id: 1, status: 'contacted', next_step: 'Call', updated_at: 'later' })
  const other = org({ id: 2, status: 'lead' })
  expect(undoMove([newer, other], was, 'contacted')).toEqual([{ ...newer, status: 'lead' }, other])
})

test('undoMove leaves a record someone moved since, or that has left the list', () => {
  const was = org({ id: 1, status: 'lead' })
  const moved = org({ id: 1, status: 'parked' })
  expect(undoMove([moved], was, 'contacted')).toEqual([moved])
  expect(undoMove([], was, 'contacted')).toEqual([])
  expect(undoMove(undefined, was, 'contacted')).toEqual([])
})
