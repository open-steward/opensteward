/**
 * Gallabox API client.
 *
 * Authentication: every request sends two HTTP headers:
 *   apiKey    — the API Key ID from Settings > API Keys
 *   apiSecret — the API secret generated at key creation time
 *
 * The account ID is stored in credentials.extra.accountId and is required
 * in every path under /accounts/:accountId/...
 *
 * Docs: https://developers.gallabox.com/getting-started/authentication
 */
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

export class GallaboxClient {
  private apiKey: string
  private apiSecret: string
  readonly accountId: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    const extra = credentials.extra as Record<string, string> | undefined
    this.apiSecret = extra?.['apiSecret'] ?? credentials.refreshToken ?? ''
    this.accountId = extra?.['accountId'] ?? ''
  }

  private authHeaders(): Record<string, string> {
    return {
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(`${BASE_URL}${path}`)
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
        new Error(`Gallabox API error ${res.status}: ${text}`),
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
        new Error(`Gallabox API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PATCH',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Gallabox API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }
}
