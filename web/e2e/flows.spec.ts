import { expect, test } from '@playwright/test'
import { newOrg, unique } from './helpers'

test('search finds an organisation and opens it', async ({ page, request }) => {
  const name = unique('Searchable Studio')
  const org = await newOrg(request, name)
  await page.goto('/')
  await page.keyboard.press('/')
  await page.keyboard.type(name.split(' ').pop()!)
  await page.getByRole('link', { name }).click()
  await expect(page).toHaveURL(new RegExp(`/o/${org.slug}$`))
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
})

test('the list opens an organisation', async ({ page, request }) => {
  const name = unique('Listed Ltd')
  await newOrg(request, name)
  await page.goto('/list')
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
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
    await card.dragTo(target)
    await expect(target.getByRole('link', { name })).toBeVisible()
  } else {
    await page.getByRole('button', { name: `Status of ${name}` }).click()
    await page.getByRole('menuitemradio', { name: 'Contacted' }).click()
    await page.getByRole('radio', { name: /^Contacted/ }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  const saved = await (await request.get(`/api/orgs/${org.id}`)).json()
  expect(saved.status).toBe('contacted')
})

test('a card status menu on the pipeline is not cut off by the board', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'the phone shows one stage at a time')
  const name = unique('Menu Room')
  await newOrg(request, name)
  await page.goto('/pipeline')
  await page.getByRole('button', { name: `Status of ${name}` }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Parked' })).toBeVisible()
  // The board scrolls sideways; it must not need an inner vertical scroll to show the menu.
  const clipped = await page.locator('.tn-custom-board').evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  expect(clipped).toBe(false)
})
