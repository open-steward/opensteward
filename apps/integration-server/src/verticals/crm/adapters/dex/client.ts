import type { Credentials } from '@opensteward/shared'
import { AUTH_HEADER, BASE_URL, V1_BASE_URL } from './constants'

/**
 * Thin HTTP client for the Dex API.
 *
 * Reads go through {@link DexClient.getV1}: the documented public API at
 * https://api.prod.getdex.com with `Authorization: Bearer <api key>`
 * (API key stored in credentials.accessToken).
 *
 * `post`/`patch`/`put`/`delete` still target the legacy Hasura host
 * (x-hasura-dex-api-key); the write methods were out of scope for the read
 * rebuild and are recorded as using undocumented paths.
 */
export class DexClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  private headers(): Record<string, string> {
    return {
      [AUTH_HEADER]: this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${BASE_URL}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }
    return url.toString()
  }

  /**
   * GET against the documented public API. Only scalar query values are sent;
   * `undefined` values are dropped.
   */
  async getV1<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${V1_BASE_URL}${path}`)
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Dex API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Dex API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Dex API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.buildUrl(path), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Dex API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
    return res.json() as Promise<T>
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(this.buildUrl(path), {
      method: 'DELETE',
      headers: this.headers(),
    })
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(new Error(`Dex API error ${res.status}: ${text}`), {
        statusCode: res.status,
      })
    }
  }
}
