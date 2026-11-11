// Writes public/icon-192.png and public/icon-512.png from public/icon.svg.
// Run with `npm run icons` after changing the SVG, and commit the PNGs.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: fileURLToPath(new URL(`../public/icon-${size}.png`, import.meta.url)) })
  await page.close()
}
await browser.close()
