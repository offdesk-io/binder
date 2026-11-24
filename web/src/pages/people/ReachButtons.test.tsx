import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ReachButtons } from './ReachButtons'

test('a LinkedIn value that is not http(s) gets no button', () => {
  render(<ReachButtons c={{ name: 'Bo', email: 'bo@example.com', phone: null, linkedin_url: 'javascript:alert(1)' }} />)
  expect(screen.getByRole('link', { name: 'Email Bo' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Bo on LinkedIn' })).toBeNull()
})
