import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { renderApp } from '../test/render'
import { InteractionEntry } from './InteractionEntry'

const entry = { type: 'call', at: '2026-11-10', summary: 'Intro call', next_step: null, next_step_due: null, people: [] }

test('who logged it is shown by full name when they are on the team', () => {
  renderApp(<InteractionEntry {...entry} by="rui@example.com" />)
  expect(screen.getByText(/· Rui$/)).toBeInTheDocument()
})

test('someone not on the team falls back to the name part of their email', () => {
  renderApp(<InteractionEntry {...entry} by="old.hand@example.com" />)
  expect(screen.getByText(/· old\.hand$/)).toBeInTheDocument()
})
