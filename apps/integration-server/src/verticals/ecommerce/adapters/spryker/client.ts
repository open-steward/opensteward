/**
 * Spryker Glue REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` header for all requests.
 *  - JSON:API envelope unwrapping: responses arrive as
 *    `{ data: [...], links: { next, prev, self } }`.
 *  - Offset-based pagination via `page[offset]` / `page[limit]` query params.
 *    The `links.next` URL in the response contains the next page href; we
 *    extract the offset from it to return a stable `nextCursor`.
 *  - 429 / 5xx retry with exponential backoff via `withRetry`.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

// ── JSON:API envelope types ───────────────────────────────────────────────────

/** A single JSON:API resource object. */
export interface JsonApiResource<T = Record<string, unknown>> {
  type: string
  id: string
  attributes: T
  relationships?: Record<string, unknown>
  links?: { self?: string }
}

/** A JSON:API list response. */
export interface JsonApiListResponse<T> {
  data: JsonApiResource<T>[]
  links?: {
    self?: string
    next?: string
    prev?: string
    last?: string
  }
  meta?: {
    pagination?: {
      total?: number
      count?: number
      perPage?: number
      currentPage?: number
      lastPage?: number
    }
  }
}

/** A JSON:API single-resource response. */
export interface JsonApiSingleResponse<T> {
  data: JsonApiResource<T>
  links?: { self?: string }
}

export interface ListResult<T> {
  items: Array<JsonApiResource<T>>
  nextOffset?: number
}

// ── Pagination helpers ────────────────────────────────────────────────────────

/**
 * Extract the `page[offset]` value from a Spryker Glue `links.next` URL.
 *
 * Example: ".../abstract-products?page[offset]=25&page[limit]=25" → 25
 */
export function parseNextOffset(nextHref: string | undefined): number | undefined {
  if (!nextHref) return undefined
  try {
    const url = new URL(nextHref)
    const raw = url.searchParams.get('page[offset]')
    if (raw == null) return undefined
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

export class SprykerClient {
  private http: AxiosInstance
  readonly baseUrl: string

  constructor(credentials: Credentials, glueBaseUrl: string) {
    this.baseUrl = glueBaseUrl.replace(/\/$/, '')
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Paginated list helper for Spryker Glue's JSON:API offset pagination.
   *
   * @param path        - Resource path, e.g. "abstract-products"
   * @param extraParams - Additional query parameters (filters, includes, etc.)
   * @returns Items (as raw JSON:API resource objects) and the next offset if
   *          a next page exists.
   */
  async listWithOffset<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['page[limit]'] as number) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const params: Record<string, unknown> = {
      ...extraParams,
      'page[limit]': limit,
    }
    // If caller passed a numeric offset, forward it directly.
    if (extraParams['page[offset]'] == null) {
      params['page[offset]'] = 0
    }

    const res = await this.get<JsonApiListResponse<T>>(path, params)
    const nextOffset = parseNextOffset(res.links?.next)

    return {
      items: res.data ?? [],
      nextOffset,
    }
  }
}
