import { expect, test } from 'vitest'
import { SESSION } from '../test/render'
import { SECTOR } from './colour'
import { SECTOR_LABEL, sectorLabel } from './sectors'

test('the six sectors have their names, and an older value shows as typed', () => {
  expect(Object.values(SECTOR_LABEL)).toEqual([
    'Manufacturing', 'Consulting', 'Technology', 'Retail and e-commerce', 'Healthcare', 'Construction and installations',
  ])
  expect(sectorLabel('retail_ecommerce')).toBe('Retail and e-commerce')
  expect(sectorLabel('Fintech')).toBe('Fintech')
  expect(sectorLabel(null)).toBe('')
})

test('every sector the server lists has a name and its own colour, each from a Tenon token', () => {
  const sectors = SESSION.meta.sectors
  expect(Object.keys(SECTOR_LABEL).sort()).toEqual([...sectors].sort())
  expect(Object.keys(SECTOR).sort()).toEqual([...sectors].sort())
  const charts = sectors.map((s) => SECTOR[s].chart)
  expect(new Set(charts).size).toBe(sectors.length)
  for (const s of sectors) expect(SECTOR[s].mark).toMatch(/^var\(--tenon-chart-\d+\)$/)
})
