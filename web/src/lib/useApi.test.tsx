import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useApi } from './useApi'

function Probe({ load, dep }: { load: () => Promise<string>; dep: number }) {
  const r = useApi(load, [dep])
  if (r.error) return <p>error {r.error.message}</p>
  return <p>{r.data ?? 'nothing'}{r.loading ? ' (loading)' : ''}</p>
}

test('loads, and loads again when a dep changes', async () => {
  let n = 0
  const load = () => Promise.resolve(`v${++n}`)
  const { rerender } = render(<Probe load={load} dep={1} />)
  expect(await screen.findByText('v1')).toBeInTheDocument()
  rerender(<Probe load={load} dep={2} />)
  expect(await screen.findByText('v2')).toBeInTheDocument()
})

test('keeps the old data on screen while it reloads', async () => {
  let release!: (v: string) => void
  const slow = () => new Promise<string>((r) => { release = r })
  const { rerender } = render(<Probe load={() => Promise.resolve('old')} dep={1} />)
  expect(await screen.findByText('old')).toBeInTheDocument()
  rerender(<Probe load={slow} dep={2} />)
  expect(screen.getByText('old (loading)')).toBeInTheDocument()
  await act(async () => release('new'))
  expect(screen.getByText('new')).toBeInTheDocument()
})

test('a slow first answer never overwrites a newer one', async () => {
  let releaseFirst!: (v: string) => void
  const first = () => new Promise<string>((r) => { releaseFirst = r })
  const { rerender } = render(<Probe load={first} dep={1} />)
  rerender(<Probe load={() => Promise.resolve('second')} dep={2} />)
  expect(await screen.findByText('second')).toBeInTheDocument()
  await act(async () => releaseFirst('first'))
  expect(screen.getByText('second')).toBeInTheDocument()
})

test('an error is kept for the caller to show', async () => {
  render(<Probe load={() => Promise.reject(new Error('down'))} dep={1} />)
  expect(await screen.findByText('error down')).toBeInTheDocument()
})
