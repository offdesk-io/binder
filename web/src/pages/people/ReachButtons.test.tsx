import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ReachButtons } from './ReachButtons'

test('each button only when there is something to reach them on', () => {
  render(<ReachButtons c={{ name: 'Bo', email: 'bo@example.com', phone: '+351 000', linkedin_url: 'linkedin.com/in/bo' }} />)
  expect(screen.getByRole('link', { name: 'Email Bo' })).toHaveAttribute('href', 'mailto:bo@example.com')
  expect(screen.getByRole('link', { name: 'Call Bo' })).toHaveAttribute('href', 'tel:+351 000')
  expect(screen.getByRole('link', { name: 'Bo on LinkedIn' })).toHaveAttribute('href', 'https://linkedin.com/in/bo')
})

test('a LinkedIn value that is not http(s) gets no button, and nobody to reach shows nothing', () => {
  const { container, rerender } = render(
    <ReachButtons c={{ name: 'Bo', email: 'bo@example.com', phone: null, linkedin_url: 'javascript:alert(1)' }} />,
  )
  expect(screen.getByRole('link', { name: 'Email Bo' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Call Bo' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Bo on LinkedIn' })).toBeNull()
  rerender(<ReachButtons c={{ name: 'Bo', email: null, phone: null, linkedin_url: null }} />)
  expect(container).toBeEmptyDOMElement()
})
