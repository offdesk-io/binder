import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useColumnDrag } from './useColumnDrag'

function Board({ onMove }: { onMove: (i: number, f: string, t: string) => void }) {
  const d = useColumnDrag<number, string>({ onMove })
  const c = d.card(1, 'a')
  return (
    <div>
      <div data-testid="card" draggable={c.draggable} data-dragging={c.dragging} onDragStart={c.onDragStart} onDragEnd={c.onDragEnd} />
      {['a', 'b'].map((k) => {
        const col = d.column(k)
        return <div key={k} data-testid={`col-${k}`} data-drop={col.dropState} {...col.bodyProps} />
      })}
    </div>
  )
}

const dt = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' })

function start() {
  vi.useFakeTimers()
  const onMove = vi.fn()
  render(<Board onMove={onMove} />)
  const data = dt()
  fireEvent.dragStart(screen.getByTestId('card'), { dataTransfer: data })
  return { onMove, data }
}

test('the card is faded a tick after dragstart, and pictured whole', () => {
  const { data } = start()
  expect(screen.getByTestId('card')).toHaveAttribute('data-dragging', 'false')
  expect(data.setDragImage).toHaveBeenCalledWith(screen.getByTestId('card'), expect.any(Number), expect.any(Number))
  expect(data.setData).toHaveBeenCalledWith('text/plain', '1')
  act(() => { vi.runAllTimers() })
  expect(screen.getByTestId('card')).toHaveAttribute('data-dragging', 'true')
  vi.useRealTimers()
})

test('a drop on another column reports the move once; the state clears', () => {
  const { onMove } = start()
  act(() => { vi.runAllTimers() })
  fireEvent.dragOver(screen.getByTestId('col-b'), { dataTransfer: dt() })
  expect(screen.getByTestId('col-b')).toHaveAttribute('data-drop', 'accept')
  fireEvent.drop(screen.getByTestId('col-b'), { dataTransfer: dt() })
  fireEvent.drop(screen.getByTestId('col-b'), { dataTransfer: dt() })
  expect(onMove).toHaveBeenCalledTimes(1)
  expect(onMove).toHaveBeenCalledWith(1, 'a', 'b')
  expect(screen.getByTestId('card')).toHaveAttribute('data-dragging', 'false')
  expect(screen.getByTestId('col-b')).not.toHaveAttribute('data-drop')
  vi.useRealTimers()
})

test('a drop on its own column does nothing, and lights nothing', () => {
  const { onMove } = start()
  fireEvent.dragOver(screen.getByTestId('col-a'), { dataTransfer: dt() })
  expect(screen.getByTestId('col-a')).not.toHaveAttribute('data-drop')
  fireEvent.drop(screen.getByTestId('col-a'), { dataTransfer: dt() })
  expect(onMove).not.toHaveBeenCalled()
  vi.useRealTimers()
})

test('a drag that did not start here is ignored', () => {
  const onMove = vi.fn()
  render(<Board onMove={onMove} />)
  fireEvent.dragOver(screen.getByTestId('col-b'), { dataTransfer: dt() })
  fireEvent.drop(screen.getByTestId('col-b'), { dataTransfer: dt() })
  expect(onMove).not.toHaveBeenCalled()
  expect(screen.getByTestId('col-b')).not.toHaveAttribute('data-drop')
})

test('dragend without a drop clears the drag', () => {
  start()
  act(() => { vi.runAllTimers() })
  fireEvent.dragEnd(screen.getByTestId('card'))
  expect(screen.getByTestId('card')).toHaveAttribute('data-dragging', 'false')
  vi.useRealTimers()
})
