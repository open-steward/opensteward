/**
 * lemlist HTTP client.
 *
 * Auth: HTTP Basic with empty username and the API key as the password.
 * The Authorization header is:  Basic base64(':<apiKey>')
 *
 * Rate limit: 20 req / 2 s per API key.
 * Pagination: offset + limit query params on list endpoints.
 */

import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

function buildBasicAuth(apiKey: string): string {
  // Username is empty; password is the API key.
  const encoded =
    typeof btoa !== 'undefined'
      ? btoa(`:${apiKey}`)
      : Buffer.from(`:${apiKey}`).toString('base64')
  return `Basic ${encoded}`
}

export class LemlistClient {
  private authHeader: string

  constructor(credentials: Credentials) {
    this.authHeader = buildBasicAuth(credentials.accessToken)
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
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v))
        }
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`lemlist API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    // 204 No Content (DELETE)
    if (res.status === 204) return undefined as unknown as T

    return res.json() as Promise<T>
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, params, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}
