import { renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { usePoll } from './usePoll'

afterEach(() => {
  vi.useRealTimers()
})

test('calls tick on an interval, and stops when the delay is null', () => {
  vi.useFakeTimers()
  const tick = vi.fn()
  const { rerender } = renderHook(({ ms }: { ms: number | null }) => usePoll(ms, tick), { initialProps: { ms: 1000 as number | null } })
  vi.advanceTimersByTime(3000)
  expect(tick).toHaveBeenCalledTimes(3)
  rerender({ ms: null })
  vi.advanceTimersByTime(3000)
  expect(tick).toHaveBeenCalledTimes(3)
})
