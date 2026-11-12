import { useEffect, useRef } from 'react'

/** Calls `tick` every `ms` milliseconds while `ms` is a number; null stops it.
 * The latest `tick` is used, so callers need not memoise it. */
export function usePoll(ms: number | null, tick: () => void): void {
  const latest = useRef(tick)
  latest.current = tick
  useEffect(() => {
    if (ms === null) return
    const timer = setInterval(() => latest.current(), ms)
    return () => clearInterval(timer)
  }, [ms])
}
