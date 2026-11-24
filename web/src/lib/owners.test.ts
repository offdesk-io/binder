import { expect, test } from 'vitest'
import { ownerInitials, ownerName } from './owners'

const team = [{ email: 'ana.silva@example.com', name: 'Ana Silva' }, { email: 'rui@example.com', name: 'Rui' }]

test('a person on the team list is shown by name, anyone else by the name part of their email, and nobody as Nobody', () => {
  expect(ownerName(team, 'ana.silva@example.com')).toBe('Ana Silva')
  expect(ownerName(team, 'old@example.com')).toBe('old')
  expect(ownerName(team, null)).toBe('Nobody')
})

test('initials come from the name when it is known, else from the email', () => {
  expect(ownerInitials(team, 'ana.silva@example.com')).toBe('AS')
  expect(ownerInitials(team, 'rui@example.com')).toBe('R')
  expect(ownerInitials(team, 'old.hand@example.com')).toBe('OH')
  expect(ownerInitials(team, null)).toBe('')
})
