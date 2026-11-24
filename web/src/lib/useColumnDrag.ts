import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

/* Drag items between columns, for a board of keyed cards in keyed columns.
   Browser-native drag and drop, no Binder types, so it can move into a shared package later.

   It carries the lessons Bench's board and Tenon's useReorder learnt:

   - the browser takes its picture of the dragged card just after dragstart returns, so the fade that marks it
     waits a tick, or the picture comes out faded or blank;
   - the picture is the whole card, not the link or chip the pointer happened to grab;
   - a drop is handled once: the column body claims the event and lets it go no further;
   - the drop, not dragend, is the real end. A moved card can be redrawn in another column before dragend fires, so
     the drag state is cleared on both.

   Each hook answers only for a drag it started, so a file or link dragged in from outside lights nothing. */

export type ColumnDropState = 'accept' | 'deny'

export interface ColumnDragOptions<I extends string | number, C extends string | number> {
  /** The card was dropped on a column other than the one it came from. */
  onMove: (item: I, from: C, to: C) => void
}

export interface DragCardProps {
  draggable: true
  dragging: boolean
  onDragStart: (ev: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

export interface DragColumnProps {
  dropState: ColumnDropState | undefined
  bodyProps: {
    onDragOver: (ev: DragEvent<HTMLElement>) => void
    onDragLeave: (ev: DragEvent<HTMLElement>) => void
    onDrop: (ev: DragEvent<HTMLElement>) => void
  }
}

export function useColumnDrag<I extends string | number, C extends string | number>({ onMove }: ColumnDragOptions<I, C>) {
  const [dragging, setDragging] = useState<I | null>(null)
  const [over, setOver] = useState<C | null>(null)
  /* Refs beside the state: the handlers need the drag at once, and the state behind `dragging` is held back a tick. */
  const drag = useRef<{ item: I; from: C } | null>(null)

  const end = () => {
    drag.current = null
    setDragging(null)
    setOver(null)
  }

  const card = (item: I, column: C): DragCardProps => ({
    draggable: true,
    dragging: dragging === item,
    onDragStart: (ev) => {
      ev.stopPropagation()
      const dt = ev.dataTransfer
      if (dt) {
        dt.effectAllowed = 'move'
        dt.setData('text/plain', String(item)) // Firefox cancels a drag that carries nothing
        const el = ev.currentTarget
        const r = el.getBoundingClientRect()
        dt.setDragImage(el, ev.clientX - r.left, ev.clientY - r.top)
      }
      drag.current = { item, from: column }
      setTimeout(() => { if (drag.current?.item === item) setDragging(item) }, 0)
    },
    onDragEnd: end,
  })

  const column = (key: C): DragColumnProps => ({
    dropState: drag.current && over === key && drag.current.from !== key ? 'accept' : undefined,
    bodyProps: {
      onDragOver: (ev) => {
        if (!drag.current) return
        ev.preventDefault()
        ev.stopPropagation()
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
        if (over !== key) setOver(key)
      },
      onDragLeave: (ev) => {
        // Moving onto a child of the body is not leaving it.
        if (ev.relatedTarget instanceof Node && ev.currentTarget.contains(ev.relatedTarget)) return
        if (over === key) setOver(null)
      },
      onDrop: (ev) => {
        const d = drag.current
        if (!d) return
        ev.preventDefault()
        ev.stopPropagation()
        end()
        if (d.from !== key) onMove(d.item, d.from, key)
      },
    },
  })

  return { card, column, dragging }
}
