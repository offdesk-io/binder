import { ApiError } from '../api/client'

/** A form's text, trimmed. An empty field is null, so clearing it clears the stored value. */
export const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

/** A stored value as form text. */
export const text = (v: string | null | undefined): string => v ?? ''

/** The fields of `after` whose value differs from `before`'s. A PATCH sends only these. */
export function changed<F extends object>(before: F, after: F): Partial<F> {
  const out: Partial<F> = {}
  for (const k of Object.keys(after) as (keyof F)[]) {
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) out[k] = after[k]
  }
  return out
}

export function saveErrorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'Someone changed this while you had it open. It now shows their version: make your change again.'
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Try again.'
}
