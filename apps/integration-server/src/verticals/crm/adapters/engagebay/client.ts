/**
 * EngageBay REST API client.
 *
 * Auth: REST API key sent as `Authorization` header on every request.
 * Format: JSON (header `Accept: application/json` required — default is XML).
 * Pagination: cursor-based; the cursor for the next page is on the last item
 *   in the list response.
 *
 * Content-Type notes (per EngageBay docs):
 *   - List (POST) endpoints: application/x-www-form-urlencoded
 *   - Create / Update endpoints: application/json
 *
 * Docs: https://github.com/engagebay/restapi
 */
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, API_PREFIX } from './constants'

export interface EngageBayListResponse<T> {
  items: T[]
  /** Cursor from the last item, present when more pages exist. */
  nextCursor: string | undefined
}

async function request<T>(
  method: string,
  path: string,
  apiKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
  contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json',
): Promise<T> {
  const url = new URL(`${BASE_URL}${API_PREFIX}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  let encodedBody: string | undefined
  if (body != null) {
    if (contentType === 'application/x-www-form-urlencoded') {
      const formParams = new URLSearchParams()
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (v !== undefined && v !== null) {
          formParams.set(k, String(v))
        }
      }
      encodedBody = formParams.toString()
    } else {
      encodedBody = JSON.stringify(body)
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'Content-Type': contentType,
    },
    body: encodedBody,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`EngageBay API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class EngageBayClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  /**
   * POST-based list endpoint (EngageBay uses POST for list operations).
   * EngageBay requires application/x-www-form-urlencoded for list endpoints.
   * The cursor for the next page is found on the last item of each batch.
   */
  async list<T extends Record<string, unknown>>(
    path: string,
    pageSize: number,
    cursor?: string,
  ): Promise<EngageBayListResponse<T>> {
    const body: Record<string, unknown> = { page_size: pageSize }
    if (cursor) body.cursor = cursor

    const raw = await request<T[]>('POST', path, this.apiKey, undefined, body, 'application/x-www-form-urlencoded')
    // The documented response is a bare JSON array; anything else is no rows.
    const items = Array.isArray(raw) ? raw : []
    const last = items[items.length - 1]
    const c = last?.['cursor']
    const nextCursor = c != null && c !== '' ? String(c) : undefined

    return { items, nextCursor }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.apiKey, params)
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return request<T>('POST', path, this.apiKey, params, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.apiKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.apiKey)
  }
}
