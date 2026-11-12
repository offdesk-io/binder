import { expect, test } from '@playwright/test'
import { newOrg, unique } from './helpers'

test('research an organisation and add a suggested person', async ({ page, request }) => {
  const name = unique('Researched Ltd')
  const org = await newOrg(request, name)
  await page.goto(`/o/${org.slug}`)
  const section = page.locator('#research')
  await section.getByRole('button', { name: 'Research', exact: true }).click()
  await expect(section.getByText(`${name}, as the fake research sees it.`)).toBeVisible({ timeout: 15_000 })
  await section.getByRole('button', { name: 'Add Sam Example' }).click()
  await expect(section.getByRole('link', { name: 'Sam Example' })).toBeVisible()
  const people = await (await request.get(`/api/orgs/${org.id}/contacts`)).json()
  expect(people.map((p: { name: string }) => p.name)).toEqual(['Sam Example'])
})

test('paste and summarise fills the quick log', async ({ page, request }) => {
  const org = await newOrg(request, unique('Summarised Co'))
  await page.goto(`/o/${org.slug}`)
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Paste and summarise' }).click()
  await dialog.getByLabel('Pasted text').fill('Agreed a pilot over coffee\nMore detail here')
  await dialog.getByRole('button', { name: 'Summarise', exact: true }).click()
  await expect(dialog.getByLabel('What happened')).toHaveValue('Agreed a pilot over coffee')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Agreed a pilot over coffee')).toBeVisible()
})
