import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

/**
 * Teamgate REST API v4 client.
 *
 * Auth: two HTTP request headers on every call.
 *   X-App-Key    — application key  (credentials.refreshToken)
 *   X-Auth-Token — user auth token  (credentials.accessToken)
 *
 * Base URL: https://api.teamgate.com/v4
 */
export class TeamgateClient {
  private appKey: string
  private authToken: string

  constructor(credentials: Credentials) {
    // accessToken carries the user's personal auth token (X-Auth-Token)
    // refreshToken carries the application key (X-App-Key)
    this.authToken = credentials.accessToken
    this.appKey = credentials.refreshToken ?? ''
  }

  private authHeaders(): Record<string, string> {
    return {
      'X-App-Key': this.appKey,
      'X-Auth-Token': this.authToken,
      'Content-Type': 'application/json',
    }
  }

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
      headers: this.authHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Teamgate API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
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
  ): Promise<T[]> {
    const limit = (params.limit as number) ?? DEFAULT_PAGE_SIZE
    const page = (params.page as number) ?? 1
    const result = await this.request<{ data: T[] } | T[]>(
      'GET',
      path,
      { ...params, limit, page },
    )
    if (Array.isArray(result)) return result
    return (result as { data: T[] }).data ?? []
  }

  /**
   * One page of a v4 collection, sending exactly `params` and keeping the
   * {count, nextPage} envelope ("To paginate, use the keywords limit and
   * offset."). Unlike `list`, it adds no `page` parameter, which Teamgate
   * does not document.
   */
  async listPage<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<{ data: T[]; count?: number; nextPage?: unknown }> {
    const result = await this.request<{ data?: T[]; count?: unknown; nextPage?: unknown } | T[]>(
      'GET',
      path,
      params,
    )
    if (Array.isArray(result)) return { data: result }
    const count = Number(result.count)
    return {
      data: result.data ?? [],
      ...(result.count != null && Number.isFinite(count) ? { count } : {}),
      ...('nextPage' in result ? { nextPage: result.nextPage } : {}),
    }
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
