/**
 * BoondManager HTTP client.
 *
 * Auth: JWT token sent in `X-Jwt-Client-Boondmanager` header.
 * credentials.accessToken holds the pre-built JWT (or a Basic-Auth base64 string
 * when the user provides basic credentials instead — in that case
 * credentials.extra.authType === 'basic').
 *
 * Response format: JSON:API — items are in `data[].attributes`; the item id is
 * `data[].id` (string).
 *
 * Pagination: `page` (1-indexed) + `maxResults` query params.
 * Meta totals: `response.meta.totals.rows`.
 */

import type { Credentials } from '@opensteward/shared'
import { BASE_URL, JWT_HEADER } from './constants'

/** JSON:API single-item envelope. */
export interface JsonApiItem {
  id: string
  type: string
  attributes: Record<string, unknown>
  relationships?: Record<string, unknown>
}

/** JSON:API list envelope. */
export interface JsonApiListResponse {
  data: JsonApiItem[]
  meta?: { totals?: { rows?: number } }
}

/** JSON:API single-item response. */
export interface JsonApiSingleResponse {
  data: JsonApiItem
}

export class BoondManagerClient {
  private readonly authHeader: Record<string, string>

  constructor(credentials: Credentials) {
    const isBasic = credentials.extra?.['authType'] === 'basic'
    if (isBasic) {
      this.authHeader = { Authorization: `Basic ${credentials.accessToken}` }
    } else {
      this.authHeader = { [JWT_HEADER]: credentials.accessToken }
    }
  }

  private buildUrl(path: string, params?: Record<string, string | number>): string {
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

  private async request<T>(
    method: string,
    path: string,
    queryParams?: Record<string, string | number>,
    body?: unknown,
  ): Promise<T> {
    const url = this.buildUrl(path, queryParams)
    const res = await fetch(url, {
      method,
      headers: {
        ...this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw Object.assign(
        new Error(`BoondManager API error ${res.status}: ${text}`),
        { statusCode: res.status },
      )
    }

    // 204 No Content on DELETE
    if (res.status === 204) return undefined as unknown as T

    return res.json() as Promise<T>
  }

  async list(
    path: string,
    page: number,
    maxResults: number,
    extra?: Record<string, string | number>,
  ): Promise<JsonApiListResponse> {
    return this.request<JsonApiListResponse>('GET', path, { page, maxResults, ...extra })
  }

  async get(path: string): Promise<JsonApiSingleResponse> {
    return this.request<JsonApiSingleResponse>('GET', path)
  }

  async post(path: string, body: unknown): Promise<JsonApiSingleResponse> {
    return this.request<JsonApiSingleResponse>('POST', path, undefined, body)
  }

  async put(path: string, body: unknown): Promise<JsonApiSingleResponse> {
    return this.request<JsonApiSingleResponse>('PUT', path, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path)
  }
}

/**
 * Build a JSON:API request body for create/update operations.
 * Strips undefined values from attributes.
 */
export function buildJsonApiBody(
  type: string,
  attributes: Record<string, unknown>,
  id?: string,
  relationships?: Record<string, unknown>,
): unknown {
  const data: Record<string, unknown> = {
    type,
    attributes: Object.fromEntries(
      Object.entries(attributes).filter(([, v]) => v !== undefined),
    ),
  }
  if (id !== undefined) data['id'] = id
  if (relationships && Object.keys(relationships).length > 0) {
    data['relationships'] = relationships
  }
  return { data }
}
