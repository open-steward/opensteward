import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

function basicAuth(credentials: Credentials): string {
  // Insightly: api_key + colon, base64 encoded
  return Buffer.from(`${credentials.accessToken}:`).toString('base64')
}

async function send(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<Response> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Basic ${basicAuth(credentials)}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Insightly API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const res = await send(method, path, credentials, params, body)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export class InsightlyClient {
  constructor(private credentials: Credentials) {}

  /**
   * One page of a list endpoint. The body is a bare array; with
   * `count_total=true` the collection size arrives in the X-Total-Count
   * header, returned here as `total` when it is a whole number.
   */
  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total?: number }> {
    const res = await send('GET', path, this.credentials, params)
    const body: unknown = res.status === 204 ? undefined : await res.json()
    const items = Array.isArray(body) ? (body as T[]) : []
    const header = res.headers.get('x-total-count')
    const total = header != null && header.trim() !== '' ? Number(header) : NaN
    return Number.isInteger(total) && total >= 0 ? { items, total } : { items }
  }

  async get<T>(path: string): Promise<T> {
    const item = await request<T>('GET', path, this.credentials)
    if (item == null) {
      throw Object.assign(new Error(`Insightly: not found at ${path}`), { statusCode: 404 })
    }
    return item
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const item = await request<T>('POST', path, this.credentials, undefined, body)
    if (item == null) throw new Error(`Insightly: POST ${path} returned no data`)
    return item
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const item = await request<T>('PUT', path, this.credentials, undefined, body)
    if (item == null) throw new Error(`Insightly: PUT ${path} returned no data`)
    return item
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
