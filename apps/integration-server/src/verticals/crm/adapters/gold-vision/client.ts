/**
 * Gold-Vision REST API client.
 *
 * Every request sends `Authorization: Bearer <access_token>`.
 * The per-instance base URL is stored in credentials.extra.instanceUrl.
 *
 * Response envelope for list endpoints:
 *   GET /api/cosmos/{entity}  →  T[]  (plain JSON array)
 *
 * Filtering uses the proprietary `filters` query parameter:
 *   ?filters=field=value,field2=value2
 *
 * There is no standard server-side pagination envelope; the API returns all
 * matching records.  Client-side slicing is applied using the `page` /
 * `limit` QueryParams conventions.
 */

import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

function instanceUrl(credentials: Credentials): string {
  const raw = (credentials.extra as Record<string, unknown> | undefined)?.['instanceUrl']
  if (typeof raw === 'string' && raw) return raw
  // Fallback: hosted SaaS with no subdomain info — client will error on requests
  throw new Error(
    'Gold-Vision: instanceUrl is required in credentials.extra (e.g. https://mycompany.goldvisioncrm.com)',
  )
}

export class GoldVisionClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(credentials: Credentials) {
    this.baseUrl = buildBaseUrl(instanceUrl(credentials))
    this.token = credentials.accessToken
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
  }

  async get<T>(
    entity: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${entity}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Gold-Vision API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async getById<T>(entity: string, id: string): Promise<T> {
    const url = new URL(`${this.baseUrl}/${entity}/${encodeURIComponent(id)}`)
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Gold-Vision API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async post<T>(entity: string, body: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}/${entity}`)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Gold-Vision API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }

  async patch<T>(entity: string, id: string, body: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}/${entity}/${encodeURIComponent(id)}`)
    const res = await fetch(url.toString(), {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`Gold-Vision API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }
    return res.json() as Promise<T>
  }
}
