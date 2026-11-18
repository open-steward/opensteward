/**
 * Low-level HTTP client for the Klenty REST API.
 *
 * Auth: every request carries the API key in the `x-API-key` request header.
 * The account username (email) is embedded in each URL path segment.
 *
 * Docs: https://support.klenty.com/en/articles/3197537-getting-started-with-klenty-api
 */
import type { Credentials } from '@opensteward/shared'
import { KLENTY_BASE_URL } from './constants'

export class KlentyClient {
  private readonly apiKey: string
  /** The Klenty account email address — used as the URL username segment. */
  private readonly username: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    this.username = ((credentials.extra as Record<string, unknown> | undefined)?.['username'] as string | undefined) ?? ''
  }

  /** Build a fully-qualified URL for the given path suffix. */
  private url(suffix: string, params?: Record<string, string | number | undefined>): string {
    const base = `${KLENTY_BASE_URL}/user/${encodeURIComponent(this.username)}${suffix}`
    const u = new URL(base)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          u.searchParams.set(k, String(v))
        }
      }
    }
    return u.toString()
  }

  private headers(): Record<string, string> {
    return {
      'x-API-key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  async get<T>(suffix: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const res = await fetch(this.url(suffix, params), {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Klenty API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async post<T>(suffix: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(suffix), {
      method: 'POST',
      headers: this.headers(),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Klenty API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }
}
