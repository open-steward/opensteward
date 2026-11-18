/**
 * Cafe24 Admin REST API client.
 *
 * Features:
 *  - `Authorization: Bearer {access_token}` auth header.
 *  - Pinned API version via `X-Cafe24-Api-Version` header.
 *  - Per-mall base URL: `https://{mallId}.cafe24api.com/api/v2/admin`.
 *  - Offset-based pagination (`limit` + `offset`, max 100 items/page).
 *  - 429 retry with exponential backoff via `withRetry`.
 *
 * Response envelope: list responses wrap items under a named key,
 * e.g. `{ "orders": [...] }`. Single-resource responses wrap under a
 * singular key, e.g. `{ "order": {...} }`.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import {
  apiBaseUrl,
  API_VERSION,
  API_VERSION_HEADER,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'

export interface ListResult<T> {
  items: T[]
  /** Offset to use for the next page; undefined when no more pages exist. */
  nextOffset?: number
}

export class Cafe24Client {
  private http: AxiosInstance

  constructor(credentials: Credentials, mallId: string) {
    this.http = axios.create({
      baseURL: apiBaseUrl(mallId),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        [API_VERSION_HEADER]: API_VERSION,
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
   * Fetch one page of resources and return items plus the next offset.
   *
   * Cafe24 uses simple offset-based pagination. The caller provides the
   * resource envelope key (e.g. `products`) used to unwrap the response.
   *
   * @param path        Relative path, e.g. `products`
   * @param resourceKey Top-level key in the response envelope
   * @param extraParams Additional query params (filters, fields, current offset, etc.)
   */
  async listPage<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      typeof extraParams.limit === 'number' ? extraParams.limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = typeof extraParams.offset === 'number' ? extraParams.offset : 0

    const params: Record<string, unknown> = {
      ...extraParams,
      limit,
      offset,
    }

    const res = await this.get<Record<string, T[]>>(path, params)
    const items: T[] = (res[resourceKey] ?? []) as T[]

    // Cafe24 does not return a `total_count` on all endpoints. We infer
    // "more pages" by checking whether we received a full page.
    const nextOffset = items.length >= limit ? offset + items.length : undefined

    return { items, nextOffset }
  }
}
