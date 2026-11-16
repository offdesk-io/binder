import { describe, expect, test } from 'vitest'
import {
  ago, day, fromLocalInput, isOverdue, label, money, person, REASON_TEXT, statusLine,
  toLocalInput, todayIso, safeHref, usd,
} from './format'

describe('format', () => {
  test('label turns a code into words', () => {
    expect(label('in_conversation')).toBe('In conversation')
    expect(label('call')).toBe('Call')
  })

  test('day shows a plain date and a time the same way', () => {
    expect(day('2026-11-12')).toBe('12 Nov 2026')
    expect(day(new Date(2026, 10, 12, 9, 0).toISOString())).toBe('12 Nov 2026')
    expect(day(null)).toBe('')
  })

  test('microsecond times parse, and a bad date shows nothing', () => {
    expect(day('2026-11-12T09:00:00.123456+00:00')).toBe('12 Nov 2026')
    expect(toLocalInput('2026-11-12T09:00:00.123456+00:00')).not.toBe('')
    expect(day('not a date')).toBe('')
    expect(toLocalInput('not a date')).toBe('')
    expect(ago('not a date', new Date(2026, 10, 12))).toBe('')
  })

  test('ago counts calendar days', () => {
    const now = new Date(2026, 10, 12, 15, 0)
    expect(ago(new Date(2026, 10, 12, 1, 0).toISOString(), now)).toBe('today')
    expect(ago(new Date(2026, 10, 11, 23, 0).toISOString(), now)).toBe('yesterday')
    expect(ago(new Date(2026, 10, 9, 10, 0).toISOString(), now)).toBe('3 days ago')
    expect(ago(new Date(2026, 8, 1, 10, 0).toISOString(), now)).toBe('1 Sept 2026')
    expect(ago(null, now)).toBe('never')
  })

  test('a due date is overdue only after its day', () => {
    const now = new Date(2026, 10, 12, 9, 0)
    expect(todayIso(now)).toBe('2026-11-12')
    expect(isOverdue('2026-11-11', now)).toBe(true)
    expect(isOverdue('2026-11-12', now)).toBe(false)
    expect(isOverdue(null, now)).toBe(false)
  })

  test('money is whole pounds', () => {
    expect(money(12000)).toBe('€12,000')
    expect(money(null)).toBe('')
  })

  test('datetime-local values go both ways in the browser zone', () => {
    const at = new Date(2026, 10, 12, 9, 5)
    expect(toLocalInput(at.toISOString())).toBe('2026-11-12T09:05')
    expect(fromLocalInput('2026-11-12T09:05')).toBe(at.toISOString())
  })

  test('people, links and status lines', () => {
    expect(person('ana@example.com')).toBe('ana')
    expect(person(null)).toBe('No owner')
    expect(safeHref('acme.example.com')).toBe('https://acme.example.com')
    expect(safeHref('http://acme.example.com')).toBe('http://acme.example.com')
    expect(safeHref('localhost:3000')).toBe('https://localhost:3000')
    expect(safeHref(' HTTPS://Acme.example.com ')).toBe('HTTPS://Acme.example.com')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('  JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(statusLine(null, 'lead')).toBe('Added as Lead')
    expect(statusLine('lead', 'contacted')).toBe('Moved from Lead to Contacted')
    expect(REASON_TEXT.quiet).toBe('No contact in 14 days')
  })
})

test('usd shows cents, a floor for tiny costs, and nothing when unknown', () => {
  expect(usd(0.034)).toBe('$0.03')
  expect(usd(1.5)).toBe('$1.50')
  expect(usd(0)).toBe('$0.00')
  expect(usd(0.004)).toBe('<$0.01')
  expect(usd(null)).toBe('')
})
