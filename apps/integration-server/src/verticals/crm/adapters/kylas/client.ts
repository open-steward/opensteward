import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

// Kylas CRM authenticates via 'api-key' header

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
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
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Kylas API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class KylasClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const pageSize = Number(params['pageSize'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 0) // Kylas uses 0-based pagination
    const res = await request<{ data?: T[]; content?: T[] }>(
      'GET', path, this.apiKey, { ...params, pageSize, page },
    )
    const items = res?.data ?? res?.content ?? []
    return { items: Array.isArray(items) ? items : [] }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.apiKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
