/**
 * Vincere REST API v2 client.
 *
 * Source: Vincere's first-party OpenAPI spec, https://api.vincere.io/vapi.yaml
 * (loaded by the reference at https://api.vincere.io/).
 *
 * Host: `servers: - url: https://{tenant}.vincere.io/api/v2`, "Your tenant API
 * server." The tenant is `credentials.extra.domain`.
 *
 * Headers, from the spec's request table: "`id-token` | string | A short lived
 * token that identifies and grants access to the Vincere API on behalf of the
 * *Vincere user* that authorized the *client app*." and "`x-api-key`| string |
 * This is the API key provided by Vincere Support".
 *
 * Searches (`GET /<entity>/search/{matrix_vars}`) answer
 * `{ category, result: { start, total, items } }`; `total` is "Total matched
 * results."
 */

import type { Credentials } from '@opensteward/shared'
import { VINCERE_API_BASE_TEMPLATE } from './constants'

function extraOf(credentials: Credentials): Record<string, unknown> {
  return (credentials.extra as Record<string, unknown> | undefined) ?? {}
}

/** Retrieve the id_token stored in credentials.extra.idToken. */
function idTokenFrom(credentials: Credentials): string {
  const extra = extraOf(credentials)
  return String(extra['idToken'] ?? credentials.accessToken)
}

/** The x-api-key, "provided by Vincere Support", from credentials.extra.apiKey. */
function apiKeyFrom(credentials: Credentials): string {
  const key = extraOf(credentials)['apiKey']
  if (typeof key !== 'string' || key.trim() === '') {
    throw Object.assign(
      new Error(
        'Vincere: credentials.extra.apiKey is required; every request carries the x-api-key "provided by Vincere Support"',
      ),
      { statusCode: 400 },
    )
  }
  return key
}

/** The tenant sub-domain, credentials.extra.domain ("Your tenant sub domain."). */
export function tenantOf(credentials: Credentials): string {
  const domain = extraOf(credentials)['domain']
  if (typeof domain !== 'string' || domain.trim() === '') {
    throw Object.assign(
      new Error(
        'Vincere: credentials.extra.domain is required; the API host is https://{tenant}.vincere.io/api/v2',
      ),
      { statusCode: 400 },
    )
  }
  return domain.trim()
}

/** Build the tenant-specific base URL from credentials.extra.domain. */
function baseUrlFrom(credentials: Credentials): string {
  return VINCERE_API_BASE_TEMPLATE.replace('{domain}', tenantOf(credentials))
}

/** The documented envelope of every `/<entity>/search/{matrix_vars}`. */
export interface VincereSearchResponse<T> {
  category?: string | null
  result?: {
    start?: number | null
    total?: number | null
    items?: T[]
  } | null
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fullUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      'id-token': idTokenFrom(credentials),
      'x-api-key': apiKeyFrom(credentials),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Vincere API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class VincereClient {
  private baseUrl: string

  constructor(private credentials: Credentials) {
    this.baseUrl = baseUrlFrom(credentials)
  }

  /**
   * One page of a search: `path` is `/<entity>/search/<matrix vars>`, and
   * `query` holds the documented `start` and `limit`.
   */
  async search<T>(
    path: string,
    query: { start: number; limit: number },
  ): Promise<VincereSearchResponse<T>> {
    return request<VincereSearchResponse<T>>(
      'GET',
      `${this.baseUrl}${path}`,
      this.credentials,
      query,
    )
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', `${this.baseUrl}${path}`, this.credentials, params)
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return request<T>('POST', `${this.baseUrl}${path}`, this.credentials, params, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', `${this.baseUrl}${path}`, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', `${this.baseUrl}${path}`, this.credentials)
  }
}
