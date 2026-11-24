import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { TimelineItem } from '../../api/types'
import type { Loaded } from '../../lib/useApi'
import { renderApp } from '../../test/render'
import { TimelineSection } from './TimelineSection'

const entries: TimelineItem[] = Array.from({ length: 7 }, (_, n) => ({
  kind: 'status',
  id: n + 1,
  org_id: 1,
  at: '2026-11-10T12:00:00+00:00',
  from_status: 'lead',
  to_status: 'contacted',
  by_email: 'ana@example.com',
}))
const loaded: Loaded<TimelineItem[]> = { data: entries, error: undefined, loading: false, reload() {}, setData() {} }

test('a limit shows the newest entries and links to the rest', () => {
  renderApp(<TimelineSection items={loaded} contacts={[]} onEdit={() => {}} limit={5} moreHref="/o/acme" />)
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByRole('link', { name: 'Show all 7' })).toHaveAttribute('href', '/o/acme')
})

test('a status line names who made it, in full when they are on the team and by email otherwise', () => {
  const status = (id: number, by_email: string): TimelineItem => ({
    kind: 'status', id, org_id: 1, at: '2026-11-10T12:00:00+00:00', from_status: 'lead', to_status: 'contacted', by_email,
  })
  const two = [status(1, 'rui@example.com'), status(2, 'old.hand@example.com')]
  renderApp(<TimelineSection items={{ ...loaded, data: two }} contacts={[]} onEdit={() => {}} />)
  expect(screen.getByText(/· Rui ·/)).toBeInTheDocument()
  expect(screen.getByText(/· old\.hand ·/)).toBeInTheDocument()
})

test('without a limit every entry shows and there is no link', () => {
  renderApp(<TimelineSection items={loaded} contacts={[]} onEdit={() => {}} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(7)
  expect(screen.queryByRole('link', { name: /Show all/ })).toBeNull()
})
