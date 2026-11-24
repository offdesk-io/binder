import { expect, test } from '@playwright/test'
import { newOrg, unique } from './helpers'

test('a connector without a company introduces a lead, and their gift is ticked in Thanks', async ({ page, request }) => {
  const name = unique('Marta Connector')

  // Add them on People: no organisation, the star on by default.
  await page.goto('/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/^Name/).fill(name)
  await expect(dialog.getByLabel('Key connector')).toBeChecked()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name })).toBeVisible()

  // Mark them as having introduced a lead.
  const lead = await newOrg(request, unique('Introduced Lead'))
  await page.goto(`/o/${lead.slug}`)
  await page.getByRole('button', { name: 'Change' }).click()
  await page.getByRole('button', { name: 'Introduced by' }).click()
  await page.getByRole('menuitemradio', { name }).click()

  // The lead shows on their page.
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByRole('link', { name: lead.name })).toBeVisible()

  // Tick their gift.
  await page.goto('/people?view=thanks')
  const sent = page.getByLabel(`Sent to ${name}`)
  await sent.click() // the box is ticked once the save comes back
  await expect(sent).toBeChecked()
  const year = new Date().getFullYear()
  const rows: { contact: { name: string }; thanks: { sent_on: string | null } | null }[] =
    await (await request.get(`/api/thanks?year=${year}`)).json()
  expect(rows.find((r) => r.contact.name === name)?.thanks?.sent_on).toBeTruthy()
})
