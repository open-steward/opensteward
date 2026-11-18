/**
 * ChurnZero REST API client (OData v4).
 *
 * Auth: HTTP Basic — Authorization: Basic <base64(username:apikey)>
 *
 * The per-instance base URL is stored on credentials.extra.baseUrl.
 * Pagination follows OData @odata.nextLink; `$top` and `$skip` control
 * page size / offset.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, ODATA_NEXT_LINK } from './constants'

export interface ODataList<T> {
  value: T[]
  '@odata.nextLink'?: string
  '@odata.count'?: number
}

export class ChurnZeroClient {
  private authHeader: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    // accessToken stores the pre-computed basic auth token:
    // base64(username:apikey) — built by exchangeCredentials.
    this.authHeader = `Basic ${credentials.accessToken}`
    const extra = credentials.extra as Record<string, unknown> | undefined
    this.baseUrl = (extra?.['baseUrl'] as string | undefined) ?? ''
    if (!this.baseUrl) {
      throw new Error('ChurnZero: credentials.extra.baseUrl is required. Set instance URL during credential exchange.')
    }
    // Normalise: strip trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, '')
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | undefined>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`ChurnZero API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /**
   * Fetch one page of an OData collection.
   * Returns `{ items, nextSkip }` where `nextSkip` is set when a
   * `@odata.nextLink` header was returned.
   */
  async list<T>(
    path: string,
    skip = 0,
    top: number = DEFAULT_PAGE_SIZE,
    extraParams?: Record<string, string>,
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const params: Record<string, string | number | undefined> = {
      '$top': top,
      '$skip': skip > 0 ? skip : undefined,
      ...extraParams,
    }
    const res = await this.request<ODataList<T>>('GET', path, params)
    const hasMore = Boolean(res[ODATA_NEXT_LINK as keyof typeof res])
    return { items: res.value ?? [], hasMore }
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
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
}
