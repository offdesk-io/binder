import raw from '@tiagopedras/tenon/tokens?raw'
import { expect, test } from 'vitest'
import { SESSION } from '../test/render'
import { SECTOR } from './colour'
import { SECTOR_LABEL, sectorLabel } from './sectors'

test('the seven sectors have their names, and an older value shows as typed', () => {
  expect(Object.values(SECTOR_LABEL)).toEqual([
    'Manufacturing', 'Consulting', 'Technology', 'Retail and e-commerce', 'Healthcare', 'Construction and installations', 'Finance',
  ])
  expect(sectorLabel('retail_ecommerce')).toBe('Retail and e-commerce')
  expect(sectorLabel('finance')).toBe('Finance')
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

/* Tenon's built tokens: the colour each theme draws chart-N in, and the surface a card is raised on. */
type Theme = Record<string, string>
const tokens = JSON.parse(raw) as { themes: { light: Theme; dark: Theme } }
const { light, dark } = tokens.themes

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function hue(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const k = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (k * 60 + 360) % 360
}

test('each sector colour has at least 4.5:1 contrast on the card in light and dark', () => {
  for (const s of SESSION.meta.sectors) {
    const n = String(SECTOR[s].chart)
    expect(contrast(light[`chart.${n}`], light['background.raised']), `${s} light`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(dark[`chart.${n}`], dark['background.raised']), `${s} dark`).toBeGreaterThanOrEqual(4.5)
  }
})

test('the seven sector colours are clearly different hues, at least 23 degrees apart', () => {
  const hues = SESSION.meta.sectors.map((s) => hue(light[`chart.${SECTOR[s].chart}`]))
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const gap = Math.abs(hues[i] - hues[j])
      expect(Math.min(gap, 360 - gap), `${SESSION.meta.sectors[i]} and ${SESSION.meta.sectors[j]}`).toBeGreaterThanOrEqual(23)
    }
  }
})
