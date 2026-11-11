import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useApi, type Loaded } from './useApi'

let api: Loaded<string>

function Probe({ load, dep, keep }: { load: () => Promise<string>; dep: number; keep?: boolean }) {
  const r = useApi(load, [dep], { keep })
  api = r
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

test('a reload keeps the old data on screen', async () => {
  let release!: (v: string) => void
  let n = 0
  const load = () => (++n === 1 ? Promise.resolve('old') : new Promise<string>((r) => { release = r }))
  render(<Probe load={load} dep={1} />)
  expect(await screen.findByText('old')).toBeInTheDocument()
  act(() => api.reload())
  expect(screen.getByText('old (loading)')).toBeInTheDocument()
  await act(async () => release('new'))
  expect(screen.getByText('new')).toBeInTheDocument()
})

test('a change of deps clears the old data', async () => {
  const slow = () => new Promise<string>(() => {})
  const { rerender } = render(<Probe load={() => Promise.resolve('old')} dep={1} />)
  expect(await screen.findByText('old')).toBeInTheDocument()
  rerender(<Probe load={slow} dep={2} />)
  expect(screen.getByText('nothing (loading)')).toBeInTheDocument()
})

test('setData puts a record in place and cancels a load in flight', async () => {
  let release!: (v: string) => void
  let n = 0
  const load = () => (++n === 1 ? Promise.resolve('old') : new Promise<string>((r) => { release = r }))
  render(<Probe load={load} dep={1} />)
  expect(await screen.findByText('old')).toBeInTheDocument()
  act(() => api.reload())
  act(() => api.setData('saved'))
  expect(screen.getByText('saved')).toBeInTheDocument()
  await act(async () => release('stale'))
  expect(screen.getByText('saved')).toBeInTheDocument()
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

test('keep holds the data across a change of deps', async () => {
  const slow = () => new Promise<string>(() => {})
  const { rerender } = render(<Probe load={() => Promise.resolve('old')} dep={1} keep />)
  expect(await screen.findByText('old')).toBeInTheDocument()
  rerender(<Probe load={slow} dep={2} keep />)
  expect(screen.getByText('old (loading)')).toBeInTheDocument()
})

test('setData takes an updater, so two calls build on each other', async () => {
  render(<Probe load={() => Promise.resolve('a')} dep={1} />)
  expect(await screen.findByText('a')).toBeInTheDocument()
  act(() => {
    api.setData((p) => `${p}b`)
    api.setData((p) => `${p}c`)
  })
  expect(screen.getByText('abc')).toBeInTheDocument()
})
