import { expect, test } from '@playwright/test'

test('the page links a manifest whose icons exist', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'Ledger', start_url: '/', display: 'standalone' })
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src)
    expect(r.ok(), icon.src).toBeTruthy()
  }
})
