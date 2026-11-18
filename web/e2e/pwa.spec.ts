import { expect, test } from '@playwright/test'

test('the page links a manifest whose icons exist', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'Binder', start_url: './', display: 'standalone' })
  for (const icon of manifest.icons) {
    // Manifest URLs are relative to the manifest, so they work under any base path.
    const r = await request.get(new URL(icon.src, new URL(href!, page.url())).toString())
    expect(r.ok(), icon.src).toBeTruthy()
  }
})
