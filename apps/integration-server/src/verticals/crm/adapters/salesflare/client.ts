import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

export class SalesflareClient {
  constructor(private credentials: Credentials) {}

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) url.searchParams.set(k, String(v))
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Salesflare ${res.status}: ${t}`), { statusCode: res.status })
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const limit = (params.limit as number) ?? DEFAULT_PAGE_SIZE
    const offset = (params.offset as number) ?? 0
    const result = await this.request<T[] | { data: T[] }>(
      'GET',
      path,
      { ...params, limit, offset },
    )
    const items = Array.isArray(result) ? result : (result as { data: T[] }).data ?? []
    return { items, hasMore: items.length >= limit }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
