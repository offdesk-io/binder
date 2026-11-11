import { expect, test } from 'vitest'
import { ApiError } from '../api/client'
import { changed, orNull, saveErrorText, text } from './forms'

test('orNull trims, and empty means null', () => {
  expect(orNull('  hi ')).toBe('hi')
  expect(orNull('   ')).toBeNull()
  expect(text(null)).toBe('')
})

test('changed keeps only the fields that differ, lists compared by value', () => {
  const before = { name: 'Acme', tags: ['a'], sector: null as string | null }
  expect(changed(before, { name: 'Acme', tags: ['a'], sector: 'Retail' })).toEqual({ sector: 'Retail' })
  expect(changed(before, { name: 'Acme', tags: ['a', 'b'], sector: null })).toEqual({ tags: ['a', 'b'] })
})

test('a 409 gets its own sentence; other errors say what the API said', () => {
  expect(saveErrorText(new ApiError(409, 'Changed since you loaded it'))).toMatch(/^Someone changed this/)
  expect(saveErrorText(new ApiError(422, 'name: Field required'))).toBe('name: Field required')
  expect(saveErrorText('?')).toBe('Something went wrong. Try again.')
})
