import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Wordmark } from './Wordmark'

test('the wordmark is an image named Binder', () => {
  render(<Wordmark />)
  const svg = screen.getByRole('img', { name: 'Binder' })
  expect(svg.tagName.toLowerCase()).toBe('svg')
})

test('the letters take the themed class and the dot keeps its own fill', () => {
  const { container } = render(<Wordmark />)
  expect(container.querySelector('.tn-custom-wm-ink')).not.toBeNull()
  expect(container.querySelector('[fill="#e2481c"]')).not.toBeNull()
})
