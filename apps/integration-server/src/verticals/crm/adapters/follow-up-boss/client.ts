/**
 * Follow Up Boss REST API client.
 *
 * Auth: HTTP Basic Authentication — API key as the username, empty password.
 * The Authorization header is Base64-encoded as `apiKey:`.
 *
 * Pagination uses offset/limit query parameters.
 * Response envelope: { <resourceKey>: T[], _metadata: { total, offset, limit, next } }
 */
import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

export interface FubPaginatedResponse {
  _metadata: {
    collection: string
    total?: number
    offset?: number
    limit?: number
    next?: string
    nextLink?: string
  }
  [key: string]: unknown
  // The resource array is at a key named after the collection (e.g. "people", "deals")
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
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

  // Basic auth: apiKey as username, empty password
  const token = Buffer.from(`${credentials.accessToken}:`).toString('base64')

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Basic ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Follow Up Boss API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class FollowUpBossClient {
  constructor(private credentials: Credentials) {}

  /**
   * List a paginated resource. Returns the items array extracted from the
   * envelope's collection key and the raw _metadata.
   */
  async list<T>(
    path: string,
    collectionKey: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total?: number; nextCursor?: string }> {
    const res = await request<FubPaginatedResponse>(
      'GET',
      path,
      this.credentials,
      params,
    )
    const items = (res[collectionKey] as T[] | undefined) ?? []
    return {
      items,
      total: res._metadata?.total,
      nextCursor: res._metadata?.next,
    }
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
