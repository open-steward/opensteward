/**
 * Corefactors HTTP client.
 *
 * Authentication: the API key is embedded directly in every URL path, e.g.
 *   POST https://teleduce.corefactors.in/leadapi/<api_key>/
 *
 * `credentials.accessToken` holds the Corefactors API key.
 */
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

export class CorefactorsClient {
  private readonly apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  /** Build a full URL with the API key injected at the :apiKey placeholder. */
  private url(pathTemplate: string): string {
    const resolved = pathTemplate.replace(':apiKey', encodeURIComponent(this.apiKey))
    return `${BASE_URL}${resolved}`
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const u = new URL(this.url(path))
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          u.searchParams.set(k, String(v))
        }
      }
    }
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Corefactors API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Corefactors API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Corefactors API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }
}
