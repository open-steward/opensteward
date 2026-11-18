import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

/**
 * Thin HTTP client for the Mixmax REST API v1.
 *
 * Auth: every request sends the API token in the `X-API-Token` header.
 * Pagination: cursor-based — responses return `{ results, next, hasNext }`.
 *   Pass `next` cursor as the `?next` query param for the following page.
 */

export interface MixmaxListResponse<T> {
  results: T[]
  next?: string
  hasNext?: boolean
}

async function request<T>(
  method: string,
  path: string,
  apiToken: string,
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
      'X-API-Token': apiToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Mixmax API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class MixmaxClient {
  private readonly apiToken: string

  constructor(credentials: Credentials) {
    this.apiToken = credentials.accessToken
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean; nextCursor?: string }> {
    const res = await request<MixmaxListResponse<T>>(
      'GET',
      path,
      this.apiToken,
      params,
    )
    return {
      items: res.results ?? [],
      hasMore: res.hasNext ?? false,
      nextCursor: res.next,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiToken, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiToken, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiToken, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiToken)
  }
}
