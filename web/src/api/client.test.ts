import { describe, expect, test, vi } from 'vitest'
import { ApiError, request } from './client'

function stub(res: Response | Error) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (res instanceof Error) throw res
    return res
  })
  vi.stubGlobal('fetch', f)
  return f
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/* The ApiError a request rejects with. */
const failure = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error('expected the request to fail')
    },
    (e: ApiError) => e,
  )

describe('request', () => {
  test('a GET sends no X-Binder and returns the JSON', async () => {
    const f = stub(json({ ok: 1 }))
    expect(await request('GET', '/api/x')).toEqual({ ok: 1 })
    const headers = f.mock.calls[0][1]!.headers as Record<string, string>
    expect(headers['X-Binder']).toBeUndefined()
  })

  test('a write sends X-Binder and the body as JSON', async () => {
    const f = stub(json({ id: 1 }, 201))
    await request('POST', '/api/orgs', { name: 'Acme' })
    const init = f.mock.calls[0][1]!
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Binder']).toBe('1')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"name":"Acme"}')
  })

  test('204 returns undefined', async () => {
    stub(new Response(null, { status: 204 }))
    expect(await request('DELETE', '/api/orgs/1')).toBeUndefined()
  })

  test('an error becomes an ApiError with detail, current and errors', async () => {
    stub(json({ detail: 'Changed since you loaded it', current: { id: 1 } }, 409))
    const err = await failure(request('PATCH', '/api/orgs/1', {}))
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, detail: 'Changed since you loaded it', current: { id: 1 } })
    expect(err.message).toBe('Changed since you loaded it')

    stub(json({ detail: 'name: Field required', errors: [{ loc: ['body', 'name'], msg: 'Field required', type: 'missing' }] }, 422))
    const bad = await failure(request('POST', '/api/orgs', {}))
    expect(bad.errors).toHaveLength(1)
  })

  test('a body that is not JSON still gives a sentence', async () => {
    stub(new Response('<html>Bad gateway</html>', { status: 502 }))
    const err = await failure(request('GET', '/api/x'))
    expect(err).toMatchObject({ status: 502, detail: 'Request failed (502)' })
  })

  test('no network is status 0', async () => {
    stub(new TypeError('Failed to fetch'))
    const err = await failure(request('GET', '/api/x'))
    expect(err).toMatchObject({ status: 0 })
    expect(err.detail).toMatch(/cannot be reached/)
  })
})
