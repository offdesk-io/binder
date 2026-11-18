import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { FilterChips } from './FilterChips'

const chips = [
  { value: '', label: 'All', count: 5 },
  { value: 'lead', label: 'Leads', count: 3 },
  { value: 'client', label: 'Clients', count: 2 },
]

test('each chip shows its count and the matching one is pressed', () => {
  render(<FilterChips label="Kind" chips={chips} value="lead" onChange={() => {}} />)
  expect(screen.getByRole('group', { name: 'Kind' })).toBeInTheDocument()
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['All5', 'Leads3', 'Clients2'])
  expect(screen.getByRole('button', { name: /Leads/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'false')
})

test('clicking a chip calls onChange with its value', async () => {
  const onChange = vi.fn()
  render(<FilterChips label="Kind" chips={chips} value="" onChange={onChange} />)
  await userEvent.setup().click(screen.getByRole('button', { name: /Clients/ }))
  expect(onChange).toHaveBeenCalledWith('client')
})
