import type { Reason } from '../api/types'

/** `in_conversation` → `In conversation`. */
export function label(code: string): string {
  const s = code.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const REASON_TEXT: Record<Reason, string> = {
  overdue: 'Next step overdue',
  quiet: 'No contact in 14 days',
  stuck: 'Same stage for 30 days',
}

export function statusLine(from: string | null, to: string): string {
  return from ? `Moved from ${label(from)} to ${label(to)}` : `Added as ${label(to)}`
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** A plain YYYY-MM-DD is a day in the browser's zone, not midnight UTC. */
function parse(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  // Safari rejects more than three fractional digits
  return new Date(value.replace(/(\.\d{3})\d+/, '$1'))
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function day(value: string | null | undefined): string {
  if (!value) return ''
  const d = parse(value)
  return Number.isNaN(d.getTime()) ? '' : DAY.format(d)
}

/** The time of day, `09:30`, for something read a moment ago. */
export function clock(value: string | null | undefined): string {
  if (!value) return ''
  const d = parse(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function todayIso(now: Date = new Date()): string {
  return isoDay(now)
}

/** Whole days since a stored time, by the calendar day in the browser's zone. Null when there is no time. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  return Math.round((startOfDay(now) - startOfDay(parse(iso))) / 86_400_000)
}

export function ago(iso: string | null | undefined, now: Date = new Date()): string {
  const days = daysSince(iso, now)
  if (days === null) return 'never'
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return day(iso)
}

/** Offdesk works in euros. en-IE writes €12,000, as an English page expects. */
const EUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function money(n: number | null | undefined): string {
  return n == null ? '' : EUR.format(n)
}

/** A value in euros for a card's chip: €950, €12k, €12.5k, €1.2M. Empty when there is none. */
export function moneyShort(n: number | null | undefined): string {
  if (n == null) return ''
  const trim = (x: number) => String(Math.round(x * 10) / 10)
  if (Math.abs(n) >= 1_000_000) return `€${trim(n / 1_000_000)}M`
  if (Math.abs(n) >= 1000) return `€${trim(n / 1000)}k`
  return `€${Math.round(n)}`
}

/** The value for an <input type="datetime-local">, in the browser's zone. */
export function toLocalInput(iso: string): string {
  const d = parse(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value back to UTC ISO, which the API accepts. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** The name part of an email, which is how people are shown in v1. */
export function person(email: string | null | undefined): string {
  return email ? email.split('@')[0] : 'Nobody'
}

/** Up to two capitals from the name part of an email, for an owner chip: ana.example@… is AE. */
export function initials(email: string | null | undefined): string {
  if (!email) return ''
  const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}

/**
 * A website or profile as typed ("acme.com") made into a link. Only http and
 * https are linked; any other scheme (javascript:, data:) gives null.
 */
export function safeHref(url: string | null | undefined): string | null {
  const v = (url ?? '').trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[^/:]+:\d+(\/|$)/.test(v)
  return hasScheme ? null : `https://${v}`
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** What a research run cost. Anthropic bills in US dollars. */
export function usd(n: number | null | undefined): string {
  if (n == null) return ''
  if (n > 0 && n < 0.01) return '<$0.01'
  return USD.format(n)
}
