/**
 * Haravan Omni API client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` auth (per
 *    https://docs.haravan.com/docs/get-started/create-app/ Step 4) — NOT a
 *    platform-specific header like Shopify's `X-Shopify-Access-Token`.
 *  - `withRetry` handles the documented 429 (leaky bucket 80, leak 4/s,
 *    `X-Haravan-Api-Call-Limit` header — see constants.ts) with exponential
 *    backoff.
 *  - `list` helper for the `page` + `limit` + `since_id` pagination every
 *    Haravan list endpoint documents (e.g.
 *    https://docs.haravan.com/docs/omni-apis/products/).
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { API_BASE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

export interface ListResult<T> {
  items: T[]
  /** True when this page came back full — the platform reports no total, so a
   *  short page is the only signal that this was the last one. */
  hasMore: boolean
}

export class HaravanClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE,
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

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * One page of a `page` + `limit` + `since_id` list. `resourceKey` is the
   * envelope key Haravan wraps list responses in (e.g. `products`, matching
   * `{ "products": [...] }`).
   */
  async list<T>(
    path: string,
    resourceKey: string,
    params: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const query = { ...params, limit }
    const data = await this.get<Record<string, T[]>>(path, query)
    const items = data[resourceKey] ?? []
    return { items, hasMore: items.length >= limit }
  }
}
