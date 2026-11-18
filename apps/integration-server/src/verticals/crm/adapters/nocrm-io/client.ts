import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

/**
 * Thin HTTP client for noCRM.io REST API v2.
 *
 * Auth: X-API-KEY header (stored in credentials.accessToken).
 * Subdomain: stored in credentials.extra.subdomain.
 * Pagination: offset/limit query params; X-TOTAL-COUNT response header.
 */
export class NocrmIoClient {
  private baseUrl: string
  private apiKey: string

  constructor(credentials: Credentials) {
    const extra = credentials.extra as Record<string, string> | undefined
    const subdomain = extra?.['subdomain'] ?? ''
    this.baseUrl = buildBaseUrl(subdomain)
    this.apiKey = credentials.accessToken
  }

  private headers(): Record<string, string> {
    return {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`noCRM.io API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`noCRM.io API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`noCRM.io API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`noCRM.io API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
  }

  /**
   * One page of GET /leads: `limit` + `offset` as the caller sized them, and
   * the X-TOTAL-COUNT header ('the total number of resources before
   * pagination is applied') when the platform sends it.
   */
  async listPage<T>(
    path: string,
    params: { limit: number; offset: number },
  ): Promise<{ rows: T[]; totalCount?: number }> {
    const url = new URL(`${this.baseUrl}${path}`)
    url.searchParams.set('limit', String(params.limit))
    url.searchParams.set('offset', String(params.offset))
    const res = await fetch(url.toString(), { method: 'GET', headers: this.headers() })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`noCRM.io API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    const header = res.headers.get('x-total-count')
    const total = header === null || header.trim() === '' ? NaN : Number(header)
    const rows = (await res.json()) as T[]
    return Number.isInteger(total) && total >= 0 ? { rows, totalCount: total } : { rows }
  }
}
