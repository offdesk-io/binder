import { useCallback, useEffect, useRef, useState } from 'react'

export interface Loaded<T> {
  data: T | undefined
  error: Error | undefined
  /** True while a load is in flight. `data` keeps the last answer meanwhile. */
  loading: boolean
  reload: () => void
  /** Put a saved record in place without a round trip. */
  setData: (data: T) => void
}

/** Runs `load` when the component mounts and again whenever `deps` change.
 * Only the newest call's answer is kept, so a slow old answer cannot
 * overwrite a newer one. */
export function useApi<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    const call = ++latest.current
    setLoading(true)
    load().then(
      (d) => {
        if (call !== latest.current) return
        setData(d)
        setError(undefined)
        setLoading(false)
      },
      (e: unknown) => {
        if (call !== latest.current) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      },
    )
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}
