import type { Credentials } from '@opensteward/shared'
import { DAYLITE_BASE_URL } from './constants'

/**
 * HTTP client for the Daylite REST API (api.marketcircle.net/v1).
 *
 * Auth: Bearer token in Authorization header.
 * Pagination: none on GET list endpoints; they return the whole collection.
 * Rate limit: 5 000 requests/hour per user.
 */

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${DAYLITE_BASE_URL}${path}`)
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Daylite API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE / some PUTs
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class DayliteClient {
  constructor(private credentials: Credentials) {}

  /**
   * Fetch a whole collection.
   * Daylite list endpoints (GET /v1/{entity}) are unpaginated: they document no
   * limit, offset or page (only include_trash) and return the whole collection
   * as a bare array, so nothing paging-related is sent. Callers page locally.
   */
  async list<T>(path: string): Promise<T[]> {
    const res = await request<T[]>('GET', path, this.credentials)
    return Array.isArray(res) ? res : []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
