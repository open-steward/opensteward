/**
 * Payhip REST API v2 client.
 *
 * Features:
 *  - `payhip-api-key` header auth from `credentials.accessToken`.
 *  - 429 + 5xx retry with exponential backoff (via shared `withRetry`).
 *  - `listWithOffset` helper for Payhip's offset-based pagination
 *    (`limit` 1-100, `offset` ≥0, list envelope `{ data: { <key>: [...] } }`,
 *    e.g. `{ data: { coupons: [...] } }`).
 *
 * Docs: https://payhip.com/api-reference
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** Next offset to pass in a follow-up request, or undefined when exhausted. */
  nextOffset?: number
}

export class PayhipClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'payhip-api-key': credentials.accessToken,
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

  /**
   * Offset-based list helper.
   *
   * Payhip wraps a list in `{ data: { <key>: [...] } }` — for coupons,
   * `{ "data": { "coupons": [ ... ] } }` (https://payhip.com/api-reference,
   * "List all coupons"). Sends the given `limit` (clamped to Payhip's 1–100
   * range, default 10) and `offset`, and returns the rows plus the next offset
   * when the page came back full.
   */
  async listWithOffset<T>(
    path: string,
    key: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const asked = extraParams['limit']
    const limit =
      typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE
    const at = extraParams['offset']
    const offset = typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.floor(at) : 0

    const params: Record<string, unknown> = { ...extraParams, limit, offset }

    const res = await this.get<{ data?: Record<string, T[] | undefined> }>(path, params)
    const items = res.data?.[key] ?? []

    // Payhip does not return a total count, so we infer "more pages" by
    // checking whether the page is full.
    const nextOffset = items.length === limit ? offset + limit : undefined

    return { items, nextOffset }
  }
}
