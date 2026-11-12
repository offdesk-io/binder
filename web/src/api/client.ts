/* The one place the app calls fetch. Every error body from the API has
 * `detail`, a sentence to show people. A 409 adds `current`, the record as it
 * is now; a request-validation 422 adds `errors`. */

export interface FieldError {
  loc: (string | number)[]
  msg: string
  type: string
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly current?: unknown
  readonly errors?: FieldError[]

  constructor(status: number, detail: string, current?: unknown, errors?: FieldError[]) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.current = current
    this.errors = errors
  }
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') headers['X-Binder'] = '1' // the API refuses a write without it
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Binder cannot be reached. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data && typeof data.detail === 'string' ? data.detail : `Request failed (${res.status})`
    throw new ApiError(res.status, detail, data?.current, data?.errors)
  }
  return data as T
}
