import { useCallback, useEffect, useRef, useState } from 'react'

export interface Loaded<T> {
  data: T | undefined
  error: Error | undefined
  /** True while a load is in flight. `data` keeps the last answer meanwhile. */
  loading: boolean
  reload: () => void
  /** Put a saved record in place without a round trip. Takes a value or an
   * updater that gets the latest data, so quick successive calls build on each other. */
  setData: (data: T | ((prev: T | undefined) => T)) => void
}

export interface ApiOptions {
  /** Keep the current data on screen when `deps` change (for a re-sort, say). */
  keep?: boolean
}

/** Runs `load` when the component mounts and again whenever `deps` change.
 * Only the newest call's answer is kept, so a slow old answer cannot
 * overwrite a newer one. */
export function useApi<T>(load: () => Promise<T>, deps: readonly unknown[], options: ApiOptions = {}): Loaded<T> {
  const [data, setDataState] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const latest = useRef(0)
  const lastDeps = useRef(deps)

  useEffect(() => {
    const call = ++latest.current
    const changed =
      lastDeps.current.length !== deps.length || deps.some((d, i) => !Object.is(d, lastDeps.current[i]))
    lastDeps.current = deps
    // A reload keeps the old data on screen; a new set of deps starts clean
    // unless the caller asked to keep it.
    if (changed && !options.keep) setDataState(undefined)
    setError(undefined)
    setLoading(true)
    load().then(
      (d) => {
        if (call !== latest.current) return
        setDataState(d)
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
  const setData = useCallback((d: T | ((prev: T | undefined) => T)) => {
    latest.current++ // cancels any load in flight
    setDataState((prev) => (typeof d === 'function' ? (d as (p: T | undefined) => T)(prev) : d))
    setError(undefined)
    setLoading(false)
  }, [])
  return { data, error, loading, reload, setData }
}
