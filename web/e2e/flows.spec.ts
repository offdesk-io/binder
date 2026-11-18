import { expect, test } from '@playwright/test'
import { newOrg, unique } from './helpers'

test('search finds an organisation and opens it', async ({ page, request }) => {
  const name = unique('Searchable Studio')
  const org = await newOrg(request, name)
  await page.goto('/')
  // The box must be on the page before `/` can reach it; Home links the new organisation too.
  await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible()
  await page.keyboard.press('/')
  await page.keyboard.type(name.split(' ').pop()!)
  await expect(page).toHaveURL(/\/search\?q=/)
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`org=${org.slug}`))
})

test('the list opens an organisation', async ({ page, request }) => {
  const name = unique('Listed Ltd')
  await newOrg(request, name)
  await page.goto('/list')
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await expect(page).toHaveURL(/\?org=/)
})

test('quick log adds to the timeline', async ({ page, request }) => {
  const org = await newOrg(request, unique('Logged Co'))
  await page.goto(`/o/${org.slug}`)
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Meeting' }).click()
  await dialog.getByLabel('What happened').fill('Talked budgets over coffee')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Talked budgets over coffee')).toBeVisible()
})

test('status changes on the organisation page', async ({ page, request }) => {
  const org = await newOrg(request, unique('Status Group'))
  await page.goto(`/o/${org.slug}`)
  await page.getByRole('button', { name: 'Status', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Contacted' }).click()
  await expect(page.getByText('Moved from Lead to Contacted')).toBeVisible()
  const saved = await (await request.get(`/api/orgs/${org.id}`)).json()
  expect(saved.status).toBe('contacted')
})

test('the pipeline moves a lead to the next stage', async ({ page, request }, info) => {
  const name = unique('Pipeline Partners')
  const org = await newOrg(request, name)
  await page.goto('/pipeline')
  if (info.project.name === 'desktop') {
    const card = page.locator('.tenon-card', { hasText: name })
    const target = page.getByTestId('stage-contacted')
    // Near the column's head: the columns stretch to the longest, so the centre can be below the fold.
    await card.dragTo(target, { targetPosition: { x: 150, y: 60 } })
    await expect(target.getByRole('link', { name })).toBeVisible()
  } else {
    await page.getByRole('link', { name }).click()
    const drawer = page.getByRole('dialog', { name })
    await drawer.getByRole('button', { name: 'Status', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Contacted' }).click()
    await drawer.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('radio', { name: /^Contacted/ }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  const saved = await (await request.get(`/api/orgs/${org.id}`)).json()
  expect(saved.status).toBe('contacted')
})

test('the drawer opens from the pipeline, Back closes it, and the link reopens it', async ({ page, request }) => {
  const name = unique('Drawer Works')
  const org = await newOrg(request, name)
  await page.goto('/pipeline')
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`org=${org.slug}`))
  await page.goBack()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.goto(`/pipeline?org=${org.slug}`)
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).not.toHaveURL(/org=/)
})

test('owner chips filter the pipeline and stay in the address', async ({ page, request }) => {
  const name = unique('Chip Owned')
  await newOrg(request, name)
  await page.goto('/pipeline')
  await page.getByRole('button', { name: /^Me/ }).click()
  await expect(page).toHaveURL(/owner=/)
  await expect(page.getByRole('link', { name })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Me/ })).toHaveAttribute('aria-pressed', 'true')
})
