/**
 * Loxo API HTTP client.
 *
 * Auth: Authorization: Bearer <api_key>
 * Base URL: https://<domain>/api/<agency_slug>
 *
 * Pagination:
 *   - Cursor-based (scroll_id) for: people, companies, deals, activities
 *   - Page-based (page / per_page) for: jobs
 */
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, LOXO_DEFAULT_DOMAIN, DEFAULT_PAGE_SIZE } from './constants'

export interface LoxoListResponse<T> {
  results?: T[]
  /** Cursor for the next page — absent on the last page. */
  scroll_id?: string | null
  total_count?: number
  returned_count?: number
  has_more?: boolean
}

export interface LoxoPagedResponse<T> {
  results?: T[]
  total_count?: number
  page?: number
  per_page?: number
}

function getCredentialExtra(credentials: Credentials): Record<string, string> {
  return (credentials.extra ?? {}) as Record<string, string>
}

export class LoxoClient {
  private apiKey: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const extra = getCredentialExtra(credentials)
    const domain = extra['domain'] ?? LOXO_DEFAULT_DOMAIN
    const agencySlug = extra['agencySlug'] ?? ''
    this.baseUrl = buildBaseUrl(domain, agencySlug)
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }
    return url.toString()
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: unknown,
  ): Promise<T> {
    const url = this.buildUrl(path, params)
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Loxo API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }

  /**
   * Paginate a cursor-based list endpoint (scroll_id).
   * Returns the first page of results up to `limit` items.
   */
  async listCursor<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; scrollId?: string }> {
    const merged = { per_page: DEFAULT_PAGE_SIZE, ...params }
    const res = await this.get<LoxoListResponse<T>>(path, merged)
    return {
      items: res.results ?? [],
      scrollId: res.scroll_id ?? undefined,
    }
  }

  /**
   * Paginate a page-based list endpoint (page / per_page).
   */
  async listPaged<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const merged = { per_page: DEFAULT_PAGE_SIZE, page: 1, ...params }
    const res = await this.get<LoxoPagedResponse<T>>(path, merged)
    return { items: res.results ?? [] }
  }
}
