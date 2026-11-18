import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

// OnePageCRM: Basic Auth (user_id:api_key base64-encoded)
// credentials.accessToken = user_id, credentials.extra.apiKey = api_key

async function request<T>(
  method: string,
  path: string,
  authHeader: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
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
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`OnePageCRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

function buildAuthHeader(credentials: Credentials): string {
  const userId = credentials.accessToken
  const apiKey = (credentials.extra?.['apiKey'] as string | undefined) ?? ''
  const encoded = Buffer.from(`${userId}:${apiKey}`).toString('base64')
  return `Basic ${encoded}`
}

export class OnePageCrmClient {
  private authHeader: string

  constructor(credentials: Credentials) {
    this.authHeader = buildAuthHeader(credentials)
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.authHeader, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const pageSize = Number(params['per_page'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const queryParams = { ...params, per_page: pageSize, page }

    const res = await request<unknown>('GET', path, this.authHeader, queryParams)
    // OnePageCRM returns { data: [{ contact: {...} }, ...] } or { data: [...] }
    const raw = res as Record<string, unknown>
    const dataArr = Array.isArray(raw?.['data']) ? (raw['data'] as unknown[]) : []
    // Unwrap contact wrapper if present
    const items = dataArr.map((item) => {
      const obj = item as Record<string, unknown>
      // e.g. { contact: {...} } → unwrap to the inner object, keeping the wrapper as context
      const keys = Object.keys(obj)
      if (keys.length === 1 && keys[0] !== undefined && typeof obj[keys[0]] === 'object') {
        return obj[keys[0]] as T
      }
      return item as T
    })
    return { items }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<unknown>('POST', path, this.authHeader, undefined, body)
    const raw = res as Record<string, unknown>
    // POST returns { data: { contact: {...} } } or { data: {...} }
    if (raw?.['data'] && typeof raw['data'] === 'object') {
      const data = raw['data'] as Record<string, unknown>
      const keys = Object.keys(data)
      if (keys.length === 1 && keys[0] !== undefined && typeof data[keys[0]] === 'object') {
        return data[keys[0]] as T
      }
      return data as unknown as T
    }
    return res as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<unknown>('PUT', path, this.authHeader, undefined, body)
    const raw = res as Record<string, unknown>
    if (raw?.['data'] && typeof raw['data'] === 'object') {
      const data = raw['data'] as Record<string, unknown>
      const keys = Object.keys(data)
      if (keys.length === 1 && keys[0] !== undefined && typeof data[keys[0]] === 'object') {
        return data[keys[0]] as T
      }
      return data as unknown as T
    }
    return res as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.authHeader)
  }
}
