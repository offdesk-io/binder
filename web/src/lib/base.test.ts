import { expect, test } from 'vitest'
import { withBase } from './base'

test('no base leaves paths as they are', () => {
  expect(withBase('/api/orgs', '')).toBe('/api/orgs')
})

test('a base is put in front, with one slash', () => {
  expect(withBase('/api/orgs', '/binder')).toBe('/binder/api/orgs')
  expect(withBase('/api/orgs', '/binder/')).toBe('/binder/api/orgs')
})
