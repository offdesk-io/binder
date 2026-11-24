import { expect, test } from '@playwright/test'
import { newOrg, unique } from './helpers'

test('star a contact, find them under People, and tick their gift in Thanks', async ({ page, request }) => {
  const org = await newOrg(request, unique('Starred Studio'))
  const name = unique('Marta Example')
  const made = await request.post(`/api/orgs/${org.id}/contacts`, { data: { name, postal_address: '1 Example Street' } })
  expect(made.ok()).toBeTruthy()
  const person = await made.json()

  // Star them on their page.
  await page.goto(`/c/${person.id}`)
  const toggle = page.getByRole('button', { name: 'Key connector' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: 'Key person' })).toBeVisible()

  // They are on the pipeline's People.
  await page.goto('/pipeline')
  await page.getByRole('radio', { name: 'People' }).click()
  await page.getByRole('searchbox', { name: 'Filter people' }).fill(name.split(' ').pop()!)
  await expect(page.getByRole('link', { name })).toBeVisible()

  // Tick their gift.
  await page.getByRole('radio', { name: 'Thanks' }).click()
  const line = page.getByRole('listitem').filter({ has: page.getByRole('link', { name }) })
  await expect(line.getByText('1 Example Street')).toBeVisible()
  const sent = page.getByLabel(`Sent to ${name}`)
  await sent.click() // the box is ticked once the save comes back
  await expect(sent).toBeChecked()
  const year = new Date().getFullYear()
  const rows: { person: { name: string }; thanks: { sent_on: string | null } | null }[] =
    await (await request.get(`/api/thanks?year=${year}`)).json()
  expect(rows.find((r) => r.person.name === name)?.thanks?.sent_on).toBeTruthy()
})
