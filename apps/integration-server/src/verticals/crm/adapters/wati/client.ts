/**
 * Wati API client.
 *
 * Authentication: Bearer token sent in the `Authorization` header.
 *
 * The Wati API is per-tenant. Each tenant has a unique base URL of the form
 *   https://live-mt-server.wati.io/{tenantId}
 *
 * The full base URL is stored in `credentials.extra.baseUrl`.
 * `credentials.accessToken` holds the Bearer token.
 *
 * Docs: https://docs.wati.io/reference/authentication
 */
import type { Credentials } from '@opensteward/shared'

export class WatiClient {
  private readonly token: string
  private readonly baseUrl: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    // extra.baseUrl is the full per-tenant base, e.g.
    // https://live-mt-server.wati.io/123456
    const extra = credentials.extra as Record<string, string> | undefined
    this.baseUrl = (extra?.['baseUrl'] ?? '').replace(/\/$/, '')
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }
    return url.toString()
  }

  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.buildUrl(path, query), {
      method: 'GET',
      headers: this.authHeaders(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Wati API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Wati API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }
}
