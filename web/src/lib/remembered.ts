/** A choice kept per device. Storage can be off (a private window), so a read falls back and a write is dropped. */
export function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const kept = localStorage.getItem(key)
    return allowed.find((a) => a === kept) ?? fallback
  } catch {
    return fallback
  }
}

export function writeChoice(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The choice still applies, it just isn't remembered.
  }
}
