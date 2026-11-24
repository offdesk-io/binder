import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { org } from '../test/fixtures'
import { renderApp } from '../test/render'
import { StatusPicker } from './StatusPicker'

test('a lead picks from lead statuses and reports the choice', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  renderApp(<StatusPicker org={org()} aria="Status" onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(7)
  await user.click(screen.getByRole('menuitemradio', { name: 'Contacted' }))
  expect(onChange).toHaveBeenCalledWith('contacted')
})

test('a client picks from client statuses', async () => {
  const user = userEvent.setup()
  renderApp(<StatusPicker org={org({ kind: 'client', status: 'active' })} aria="Status" onChange={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Active', 'Paused', 'Past'])
})

test('a partner picks from partner statuses, a referrer from its own shorter list', async () => {
  const user = userEvent.setup()
  const first = renderApp(<StatusPicker org={org({ kind: 'partner', status: 'identified' })} aria="Status" onChange={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Identified', 'Contacted', 'In talks', 'Terms sent', 'Active', 'Paused'])
  first.unmount()
  renderApp(<StatusPicker org={org({ kind: 'referrer', status: 'identified' })} aria="Status" onChange={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Status' }))
  expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Identified', 'Contacted', 'In talks', 'Active', 'Paused'])
})
