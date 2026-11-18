/**
 * Carerix REST API client.
 *
 * Carerix's REST API uses:
 *   - OAuth2 Bearer tokens for authentication (Authorization: Bearer <token>)
 *   - Offset-based pagination via `start` (0-based) and `count` parameters
 *   - JSON responses when Accept: application/json is set
 *   - Base URL: https://api.carerix.com
 *
 * Object types: CREmployee, CRCompany, CRPublication
 *
 * Docs: https://help.carerix.com/en/articles/9464648-carerix-rest-api
 */

import type { Credentials } from '@opensteward/shared'
import { CARERIX_BASE_URL, CARERIX_DEFAULT_PAGE_SIZE } from './constants'

/** Generic paged response wrapper returned by list endpoints. */
export interface CarerixListResponse<T> {
  items: T[]
  hasMore: boolean
  nextStart: number
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${CARERIX_BASE_URL}${path}`)
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
      new Error(`Carerix API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class CarerixClient {
  constructor(private readonly credentials: Credentials) {}

  /**
   * List objects from a resource endpoint.
   *
   * Carerix uses `start` (offset) + `count` (page size) pagination.
   * The response is an array of objects; if the array length equals `count`
   * there may be more results.
   */
  async list<T>(
    objectType: string,
    params: Record<string, unknown> = {},
  ): Promise<CarerixListResponse<T>> {
    const count = (params['count'] as number | undefined) ?? CARERIX_DEFAULT_PAGE_SIZE
    const start = (params['start'] as number | undefined) ?? 0

    // Carerix REST API: GET /<ObjectType> returns array at the root, or an
    // object with an array property. We normalise to an items array.
    const raw = await request<T[] | Record<string, unknown>>(
      'GET',
      `/${objectType}`,
      this.credentials,
      { ...params, start, count },
    )

    const items: T[] = Array.isArray(raw) ? raw : extractArray<T>(raw as Record<string, unknown>)

    return {
      items,
      hasMore: items.length >= count,
      nextStart: start + items.length,
    }
  }

  async get<T>(objectType: string, id: string): Promise<T> {
    return request<T>('GET', `/${objectType}/${id}`, this.credentials)
  }

  async post<T>(objectType: string, body: unknown): Promise<T> {
    return request<T>('POST', `/${objectType}`, this.credentials, undefined, body)
  }

  async put<T>(objectType: string, id: string, body: unknown): Promise<T> {
    return request<T>('PUT', `/${objectType}/${id}`, this.credentials, undefined, body)
  }

  async delete(objectType: string, id: string): Promise<void> {
    await request<void>('DELETE', `/${objectType}/${id}`, this.credentials)
  }
}

/** Extract the first array value from an object response envelope. */
function extractArray<T>(raw: Record<string, unknown>): T[] {
  for (const v of Object.values(raw)) {
    if (Array.isArray(v)) return v as T[]
  }
  return []
}
