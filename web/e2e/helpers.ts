import { expect, type APIRequestContext } from '@playwright/test'

export interface Org { id: number; slug: string; name: string }

let n = 0
/** A name whose last word is unique, so a search for that word finds one organisation. */
export function unique(base: string): string {
  n += 1
  return `${base} ${Date.now().toString(36)}x${n}`
}

export async function newOrg(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}): Promise<Org> {
  const r = await request.post('/api/orgs', { data: { name, ...extra } })
  expect(r.ok()).toBeTruthy()
  return r.json()
}
