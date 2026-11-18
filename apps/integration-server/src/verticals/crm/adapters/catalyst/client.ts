/**
 * Catalyst API v1 HTTP client.
 *
 * Authentication: API key sent in the `X-Api-Key` request header. UNVERIFIED:
 * no public first-party page names the header (the OpenAPI spec is behind a
 * login at https://app.catalyst.io/public-apis).
 * Pagination: limit/offset query parameters (default limit=25, max=100).
 */

import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

export interface CatalystListResponse<T> {
  data: T[]
  meta?: {
    total?: number
    limit?: number
    offset?: number
  }
}

export interface CatalystPageParams {
  limit?: number
  offset?: number
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
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
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Catalyst API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  // 204 No Content (e.g. DELETE)
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class CatalystClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  async list<T>(
    path: string,
    pageParams: CatalystPageParams = {},
    extraParams: Record<string, unknown> = {},
  ): Promise<CatalystListResponse<T>> {
    const params: Record<string, unknown> = {
      limit: pageParams.limit ?? DEFAULT_PAGE_SIZE,
      offset: pageParams.offset ?? 0,
      ...extraParams,
    }
    return request<CatalystListResponse<T>>('GET', path, this.apiKey, params)
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.apiKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
