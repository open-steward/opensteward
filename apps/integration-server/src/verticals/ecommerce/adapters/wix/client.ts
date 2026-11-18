/**
 * Wix REST API client.
 *
 * Features:
 *  - `Authorization: {accessToken}` header (NO "Bearer" prefix — Wix-specific).
 *  - Simple 429 retry with exponential backoff.
 *  - `queryPost` helper for Wix's POST-for-queries pattern with cursor pagination.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { withRetry } from '@opensteward/shared'

export interface ListResult<T> {
  items: T[]
  nextCursor?: string
  /**
   * Rows matching the query across all pages, when Wix reports it: Stores V1
   * queries send `totalResults`, Contacts v4 sends `pagingMetadata.total`.
   */
  total?: number
  /** Contacts v4: `pagingMetadata.tooManyToCount`, set when `total` could not be computed. */
  tooManyToCount?: boolean
}

export class WixClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        // Wix uses the raw token, NOT "Bearer <token>"
        Authorization: credentials.accessToken,
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
   * Wix uses POST for list/query operations. The response contains a
   * cursor-based pagination envelope. This helper extracts items and the
   * optional next cursor.
   *
   * Wix query body shape:
   * ```json
   * {
   *   "query": {
   *     "paging": { "limit": 50, "offset": 0 },
   *     "cursorPaging": { "limit": 50, "cursor": "..." }
   *   }
   * }
   * ```
   *
   * Response envelope varies by endpoint — the caller passes `resourceKey`
   * to extract the array.
   */
  async queryPost<T>(
    path: string,
    resourceKey: string,
    opts: {
      limit?: number
      /** `query.paging.offset`: rows to skip. Defaults to 0. */
      offset?: number
      cursor?: string
      extraBody?: Record<string, unknown>
    } = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    const query: Record<string, unknown> = {}
    if (opts.cursor) {
      query.cursorPaging = { limit, cursor: opts.cursor }
    } else {
      query.paging = { limit, offset: opts.offset ?? 0 }
    }

    const body: Record<string, unknown> = {
      query,
      ...opts.extraBody,
    }

    const data = await this.post<Record<string, unknown>>(path, body)
    const items = (data[resourceKey] ?? []) as T[]

    // Wix cursor pagination: response may contain `pagingMetadata.cursors.next`
    const pagingMetadata = data['pagingMetadata'] as
      | { cursors?: { next?: string }; total?: unknown; tooManyToCount?: unknown }
      | undefined
    const nextCursor = pagingMetadata?.cursors?.next

    const rawTotal = data['totalResults'] ?? pagingMetadata?.total
    const total = typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined
    const tooManyToCount = pagingMetadata?.tooManyToCount === true ? true : undefined

    return { items, nextCursor, total, tooManyToCount }
  }
}
