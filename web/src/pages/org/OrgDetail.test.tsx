import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { api } from '../../api/endpoints'
import type { Org } from '../../api/types'
import { useApi } from '../../lib/useApi'
import { AT, interaction, org } from '../../test/fixtures'
import { renderApp, stubFetch } from '../../test/render'
import { OrgDetail } from './OrgDetail'

function Drawer({ onChanged }: { onChanged: (o: Org) => void }) {
  const o = useApi(() => api.orgBySlug('acme'), [])
  if (!o.data) return null
  return <OrgDetail frame="drawer" org={o.data} setOrg={o.setData} reloadOrg={o.reload} onChanged={onChanged} />
}

test('in the drawer, saving a log reports the reloaded record with its new last contact', async () => {
  const user = userEvent.setup()
  let loads = 0
  stubFetch({
    'GET /api/orgs/by-slug/acme': () => (loads++ === 0 ? org() : org({ last_contact: AT })),
    'GET /api/orgs/1/contacts': () => [],
    'GET /api/orgs/1/timeline': () => [],
    'GET /api/orgs/1/research': () => [],
    'GET /api/orgs/1/work': () => ({ tasks: [], fetched_at: AT, error: null, refreshing: false }),
    'POST /api/orgs/1/interactions': () => interaction(),
  })
  const onChanged = vi.fn()
  renderApp(<Drawer onChanged={onChanged} />)
  await user.click(await screen.findByRole('button', { name: 'Log' }))
  expect(onChanged).not.toHaveBeenCalled()
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText(/What happened/), 'Kick-off')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  expect(onChanged.mock.calls[0][0].last_contact).toBe(AT)
})
