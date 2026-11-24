import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { matchesText } from './matchesText'

test('the filter box finds a description, and ignores the next step', () => {
  expect(matchesText(org({ description: 'Makes kilns' }), 'kiln')).toBe(true)
  expect(matchesText(org({ next_step: 'Send proposal' }), 'proposal')).toBe(false)
})

test('the filter box finds a sector by the name people see, and still by an older typed one', () => {
  expect(matchesText(org({ sector: 'retail_ecommerce' }), 'e-commerce')).toBe(true)
  expect(matchesText(org({ sector: 'retail_ecommerce' }), 'healthcare')).toBe(false)
  expect(matchesText(org({ sector: 'Fintech' }), 'fin')).toBe(true)
})
