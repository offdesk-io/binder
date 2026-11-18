// Checks that a build made with BINDER_BASE=/binder refers to nothing outside /binder (except /auth/, the shared sign-in).
// Markup and styles are read from the build. API paths are plain strings in the bundle, which api/client.ts prefixes at
// run time, so the check instead requires that client.ts is the only source file that calls fetch.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'dist-base'
const base = '/binder'
const bad = []
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!/\.(html|js|css|webmanifest)$/.test(f)) continue
    const text = readFileSync(p, 'utf8')
    for (const m of text.matchAll(/(?:href|src|action)=["'](\/[^"']*)["']|url\((['"]?)(\/[^)'"]*)\2\)/g)) {
      const url = m[1] ?? m[3]
      if (!url.startsWith(base + '/') && !url.startsWith('/auth/')) bad.push(`${p}: ${url}`)
    }
  }
}
walk(dir)
function walkSrc(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) { walkSrc(p); continue }
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f) || p.endsWith(join('api', 'client.ts'))) continue
    if (/\bfetch\(/.test(readFileSync(p, 'utf8'))) bad.push(`${p}: calls fetch outside api/client.ts`)
  }
}
walkSrc('src')
if (bad.length) { console.error('Outside ' + base + ':\n' + bad.join('\n')); process.exit(1) }
console.log('All URLs are under ' + base)
