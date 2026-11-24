import { expect, test } from 'vitest'
import { org } from '../test/fixtures'
import { matchesText } from './matchesText'

test('the filter box finds a sector by the name people see, and still by an older typed one', () => {
  expect(matchesText(org({ sector: 'retail_ecommerce' }), 'e-commerce')).toBe(true)
  expect(matchesText(org({ sector: 'retail_ecommerce' }), 'healthcare')).toBe(false)
  expect(matchesText(org({ sector: 'Fintech' }), 'fin')).toBe(true)
})
