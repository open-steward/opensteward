import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * Thin HTTP client for the JobDiva REST API (apiv2).
 *
 * Every request attaches `Authorization: Bearer <token>` using the Bearer
 * token stored in `credentials.accessToken`. The token is obtained by
 * POSTing username + password + clientId to /gettoken (handled during
 * the credential exchange step).
 *
 * Pagination uses `pageNumber` + `pageSize` query parameters.
 */
export class JobdivaClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private url(path: string, params?: Record<string, unknown>): string {
    const u = new URL(`${BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          u.searchParams.set(k, String(v))
        }
      }
    }
    return u.toString()
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.url(path, params), {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`JobDiva API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`JobDiva API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`JobDiva API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }
}
