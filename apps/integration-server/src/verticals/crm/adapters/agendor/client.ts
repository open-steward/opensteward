import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

async function request<T>(
  method: string,
  path: string,
  token: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Agendor API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class AgendorClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<{ data: T }>('GET', path, this.token, params)
    return res.data
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<{ data: T[] }>('GET', path, this.token, {
      per_page: DEFAULT_PAGE_SIZE,
      page: 1,
      ...params,
    })
    return { items: res.data ?? [], hasMore: false }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data: T }>('POST', path, this.token, undefined, body)
    return res.data
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<{ data: T }>('PUT', path, this.token, undefined, body)
    return res.data
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}
