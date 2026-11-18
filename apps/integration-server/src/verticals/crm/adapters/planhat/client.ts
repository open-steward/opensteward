import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

export class PlanhatClient {
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
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Planhat ${res.status}: ${t}`), { statusCode: res.status })
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  /**
   * One page of a documented offset list. Every list example on
   * https://www.planhat.com/developers/api returns a bare JSON array with no
   * total (e.g. "GET 'https://api.planhat.com/endusers?limit=2&offset=0'" ->
   * "200 ok '[{...},{...}]'"), so only a full page implies more.
   */
  async list<T>(
    path: string,
    params: { limit: number; offset: number },
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const result = await this.request<unknown>('GET', path, params)
    if (!Array.isArray(result)) {
      throw Object.assign(
        new Error(`Planhat GET ${path}: expected the documented JSON array, got ${typeof result}`),
        { statusCode: 502 },
      )
    }
    const items = result as T[]
    return { items, hasMore: items.length >= params.limit }
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
